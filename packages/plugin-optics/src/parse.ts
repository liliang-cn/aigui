import type { OpticsDefinition, OpticsResult } from "./types"

const IMAGING = new Set(["convex-lens", "concave-lens", "concave-mirror", "convex-mirror", "plane-mirror"])
const CONVERGING = new Set(["convex-lens", "concave-mirror"])
const DIVERGING = new Set(["concave-lens", "convex-mirror"])
const SHOW = new Set(["rays", "focalPoints", "labels"])
const TOP = new Set(["element", "focal", "object", "media", "incidence", "show", "caption"])
const OBJECT = new Set(["distance", "height", "label"])

/** Fields that would mean the model answered the question instead of setting it up. */
const COMPUTED = /"(image|imageDistance|imageHeight|imagePosition|magnification|refractionAngle|angleOfRefraction|nature|isReal|virtual)"\s*:/

const bad = (message: string): OpticsResult<never> => ({ ok: false, error: { code: "invalid-definition", message } })
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

/** Validate one `optics` fence. */
export function parseOptics(source: string, options: { maxSourceBytes?: number } = {}): OpticsResult<OpticsDefinition> {
  if (new TextEncoder().encode(source).byteLength > (options.maxSourceBytes ?? 8 * 1024)) {
    return { ok: false, error: { code: "too-large", message: "Figure definition is too large." } }
  }
  let raw: unknown
  try {
    raw = JSON.parse(source)
  } catch {
    return { ok: false, error: { code: "invalid-json", message: "Figure definition is not valid JSON." } }
  }
  if (!isRecord(raw)) return bad("A figure definition must be a JSON object")
  // Before the generic unknown-field check, so the message names the actual mistake.
  if (COMPUTED.test(source)) return bad("give the conditions, not the result — where the image lands is computed for you")
  for (const key of Object.keys(raw)) if (!TOP.has(key)) return bad(`${key} is not a field of a figure definition`)

  const element = raw.element
  if (typeof element !== "string" || (!IMAGING.has(element) && element !== "interface")) {
    return bad(`element must be one of ${[...IMAGING, "interface"].join(", ")}`)
  }
  const definition: OpticsDefinition = { element: element as OpticsDefinition["element"] }

  if (element === "interface") {
    if ("focal" in raw || "object" in raw) return bad("an interface has no focal length or object")
    if (!Array.isArray(raw.media) || raw.media.length !== 2 || !raw.media.every((n) => num(n) && n > 0)) {
      return bad("interface needs media [n1, n2], both positive")
    }
    if (!num(raw.incidence) || raw.incidence < 0 || raw.incidence >= 90) {
      return bad("incidence must be an angle from 0 to 89 degrees")
    }
    definition.media = raw.media as [number, number]
    definition.incidence = raw.incidence
  } else {
    if ("media" in raw || "incidence" in raw) return bad("an imaging element has no media or incidence angle")
    if (!isRecord(raw.object)) return bad("object is required")
    for (const key of Object.keys(raw.object)) if (!OBJECT.has(key)) return bad(`object has no field ${key}`)
    const { distance, height, label } = raw.object
    if (!num(distance) || distance <= 0) return bad("object.distance must be a positive number")
    if (!num(height) || height <= 0) return bad("object.height must be a positive number")
    if (label !== undefined && typeof label !== "string") return bad("object.label must be a string")
    definition.object = { distance, height, label: label as string | undefined }

    if (element === "plane-mirror") {
      if ("focal" in raw) return bad("a plane mirror has no focal length")
    } else if (!num(raw.focal) || raw.focal === 0) {
      return bad("focal is required and must not be zero")
    } else if (CONVERGING.has(element) && raw.focal < 0) {
      return bad(`${element} converges, so its focal length is positive — saw ${raw.focal}`)
    } else if (DIVERGING.has(element) && raw.focal > 0) {
      // The likeliest slip, because a question quotes the focal length as a magnitude. Drawn with a
      // positive f a diverging element converges, which is the opposite figure.
      return bad(`${element} diverges, so its focal length is negative — saw ${raw.focal}`)
    } else {
      definition.focal = raw.focal
    }
  }

  if (raw.show !== undefined) {
    if (!Array.isArray(raw.show) || !raw.show.every((f) => typeof f === "string" && SHOW.has(f))) {
      return bad(`show may only contain ${[...SHOW].join(", ")}`)
    }
    definition.show = raw.show as OpticsDefinition["show"]
  }
  if (raw.caption !== undefined) {
    if (typeof raw.caption !== "string") return bad("caption must be a string")
    definition.caption = raw.caption
  }
  return { ok: true, value: definition }
}
