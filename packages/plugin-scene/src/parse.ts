import type { Anchor, Material, ParsedScene, RefusedModel, SceneCamera, SceneDefinition, SceneObject, SceneResult, ShapeKind, Vec3 } from "./types"

const SHAPES = new Set<ShapeKind>(["box", "sphere", "cylinder", "cone", "torus", "capsule", "plane", "model"])
const MATERIALS = new Set<Material>(["matte", "metal", "glass"])
const ANCHORS = new Set<Anchor>(["center", "bottom"])
const SCENE_FIELDS = new Set(["objects", "camera", "grid", "autoRotate", "caption"])
const COMMON_FIELDS = ["shape", "label", "position", "rotation", "anchor", "color", "opacity", "material", "wireframe"]
const SHAPE_FIELDS: Record<ShapeKind, string[]> = {
  box: ["size"],
  sphere: ["radius"],
  cylinder: ["radius", "height", "radiusTop", "sides"],
  cone: ["radius", "height", "sides"],
  torus: ["radius", "tube"],
  capsule: ["radius", "height"],
  plane: ["size"],
  model: ["src", "size"],
}

/**
 * The colours a scene may use: CSS hex, or a name from this list.
 *
 * Three's `Color` accepts every CSS colour name, but the string still goes through a validator
 * so that a model writing "浅蓝" gets told, rather than getting black.
 */
export const COLOR_NAMES = new Set([
  "red", "orange", "yellow", "green", "teal", "cyan", "blue", "navy", "purple", "pink", "brown",
  "white", "silver", "gray", "grey", "black", "gold", "beige", "olive", "lime", "coral", "salmon",
  "ivory", "tan", "wheat", "chocolate", "crimson", "magenta", "violet", "indigo", "turquoise",
])
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

const bad = (message: string): SceneResult<never> => ({ ok: false, error: { code: "invalid-definition", message } })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const positive = (value: unknown): value is number => finite(value) && value > 0

function vec3(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every(finite)
}

/**
 * Whether a `model` URL may be fetched, as an exact-origin check.
 *
 * The comparison is against `URL.origin`, so a path, a query, credentials and a trailing slash in
 * the host's list are all normalised away before matching — and a host that lists
 * `https://cdn.example.com` does not thereby allow `https://cdn.example.com.evil.net`.
 */
export function modelOriginAllowed(src: string, allowed: readonly string[] | undefined): SceneResult<URL> {
  let url: URL
  try {
    url = new URL(src)
  } catch {
    return bad("src must be an absolute URL")
  }
  if (url.protocol !== "https:") return bad("src must use https")
  if (url.username || url.password) return bad("src must not carry credentials")
  const origins = new Set((allowed ?? []).map((origin) => {
    try {
      return new URL(origin).origin
    } catch {
      return ""
    }
  }))
  if (!origins.has(url.origin)) {
    return {
      ok: false,
      error: {
        code: "origin-not-allowed",
        message: origins.size === 0
          ? "External models are disabled: the host has not allowed any origin to load them from."
          : `Models may not be loaded from ${url.origin}.`,
      },
    }
  }
  return { ok: true, value: url }
}

type ObjectOutcome = SceneResult<SceneObject> | { ok: "refused"; refused: RefusedModel }

function parseObject(raw: unknown, index: number, allowedModelOrigins: readonly string[] | undefined): ObjectOutcome {
  const at = `objects[${index}]`
  if (!isRecord(raw)) return bad(`${at} must be an object`)
  if (typeof raw.shape !== "string" || !SHAPES.has(raw.shape as ShapeKind)) return bad(`${at}.shape must be one of ${[...SHAPES].join(", ")}`)
  const shape = raw.shape as ShapeKind
  const allowed = new Set([...COMMON_FIELDS, ...SHAPE_FIELDS[shape]])
  // An unknown key is a request this protocol cannot honour, and a model that wrote `texture` or
  // `children` wanted something that dropping it quietly would leave out of the picture.
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) return bad(`${at}.${key} is not a field of a ${shape}`)
  }

  const base: Record<string, unknown> = { shape }
  if (raw.label !== undefined) {
    if (typeof raw.label !== "string" || raw.label.length > 80) return bad(`${at}.label must be a short string`)
    base.label = raw.label
  }
  if (raw.position !== undefined) {
    if (!vec3(raw.position)) return bad(`${at}.position must be [x, y, z]`)
    base.position = raw.position
  }
  if (raw.rotation !== undefined) {
    if (!vec3(raw.rotation)) return bad(`${at}.rotation must be [x, y, z] in degrees`)
    base.rotation = raw.rotation
  }
  if (raw.anchor !== undefined) {
    if (typeof raw.anchor !== "string" || !ANCHORS.has(raw.anchor as Anchor)) return bad(`${at}.anchor must be center or bottom`)
    base.anchor = raw.anchor
  }
  if (raw.color !== undefined) {
    if (typeof raw.color !== "string" || !(HEX.test(raw.color) || COLOR_NAMES.has(raw.color.toLowerCase()))) {
      return bad(`${at}.color must be a hex colour like #4f46e5 or a colour name`)
    }
    base.color = raw.color.toLowerCase()
  }
  if (raw.opacity !== undefined) {
    if (!finite(raw.opacity) || raw.opacity < 0 || raw.opacity > 1) return bad(`${at}.opacity must be between 0 and 1`)
    base.opacity = raw.opacity
  }
  if (raw.material !== undefined) {
    if (typeof raw.material !== "string" || !MATERIALS.has(raw.material as Material)) return bad(`${at}.material must be matte, metal or glass`)
    base.material = raw.material
  }
  if (raw.wireframe !== undefined) {
    if (typeof raw.wireframe !== "boolean") return bad(`${at}.wireframe must be true or false`)
    base.wireframe = raw.wireframe
  }

  switch (shape) {
    case "box":
      if (!vec3(raw.size) || !raw.size.every(positive)) return bad(`${at} box needs size [width, height, depth]`)
      return { ok: true, value: { ...base, shape, size: raw.size } as SceneObject }
    case "sphere":
      if (!positive(raw.radius)) return bad(`${at} sphere needs a positive radius`)
      return { ok: true, value: { ...base, shape, radius: raw.radius } as SceneObject }
    case "cylinder": {
      if (!positive(raw.radius)) return bad(`${at} cylinder needs a positive radius`)
      if (!positive(raw.height)) return bad(`${at} cylinder needs a positive height`)
      if (raw.radiusTop !== undefined && !(finite(raw.radiusTop) && raw.radiusTop >= 0)) return bad(`${at}.radiusTop must be zero or more`)
      const sides = parseSides(raw.sides, at)
      if (!sides.ok) return sides
      const value = { ...base, shape, radius: raw.radius, height: raw.height } as SceneObject & { radiusTop?: number; sides?: number }
      if (raw.radiusTop !== undefined) value.radiusTop = raw.radiusTop as number
      if (sides.value !== undefined) value.sides = sides.value
      return { ok: true, value }
    }
    case "cone": {
      if (!positive(raw.radius)) return bad(`${at} cone needs a positive radius`)
      if (!positive(raw.height)) return bad(`${at} cone needs a positive height`)
      const sides = parseSides(raw.sides, at)
      if (!sides.ok) return sides
      const value = { ...base, shape, radius: raw.radius, height: raw.height } as SceneObject & { sides?: number }
      if (sides.value !== undefined) value.sides = sides.value
      return { ok: true, value }
    }
    case "capsule":
      if (!positive(raw.radius)) return bad(`${at} capsule needs a positive radius`)
      if (!positive(raw.height)) return bad(`${at} capsule needs a positive height`)
      return { ok: true, value: { ...base, shape, radius: raw.radius, height: raw.height } as SceneObject }
    case "torus":
      if (!positive(raw.radius)) return bad(`${at} torus needs a positive radius`)
      if (!positive(raw.tube)) return bad(`${at} torus needs a positive tube`)
      return { ok: true, value: { ...base, shape, radius: raw.radius, tube: raw.tube } as SceneObject }
    case "plane":
      if (!Array.isArray(raw.size) || raw.size.length !== 2 || !raw.size.every(positive)) return bad(`${at} plane needs size [width, depth]`)
      return { ok: true, value: { ...base, shape, size: raw.size as [number, number] } as SceneObject }
    case "model": {
      if (typeof raw.src !== "string") return bad(`${at} model needs a src URL`)
      const origin = modelOriginAllowed(raw.src, allowedModelOrigins)
      // A well-formed URL the host has not opened is the host's decision, not the model's mistake,
      // so it costs this one object and a note rather than the scene. A malformed one is still a
      // mistake and is refused like any other bad field.
      if (!origin.ok && origin.error.code === "origin-not-allowed") return { ok: "refused", refused: { index, src: raw.src, message: origin.error.message } }
      if (!origin.ok) return origin
      if (raw.size !== undefined && !positive(raw.size)) return bad(`${at}.size must be a positive length`)
      const value = { ...base, shape, src: origin.value.href } as SceneObject & { size?: number }
      if (raw.size !== undefined) value.size = raw.size as number
      return { ok: true, value }
    }
  }
}

function parseSides(raw: unknown, at: string): SceneResult<number | undefined> {
  if (raw === undefined) return { ok: true, value: undefined }
  if (!Number.isInteger(raw) || (raw as number) < 3 || (raw as number) > 64) return bad(`${at}.sides must be a whole number from 3 to 64`)
  return { ok: true, value: raw as number }
}

function parseCamera(raw: unknown): SceneResult<SceneCamera | undefined> {
  if (raw === undefined) return { ok: true, value: undefined }
  if (!isRecord(raw)) return bad("camera must be an object")
  for (const key of Object.keys(raw)) {
    if (key !== "position" && key !== "target") return bad(`camera.${key} is not a field of the camera`)
  }
  const camera: SceneCamera = {}
  if (raw.position !== undefined) {
    if (!vec3(raw.position)) return bad("camera.position must be [x, y, z]")
    camera.position = raw.position
  }
  if (raw.target !== undefined) {
    if (!vec3(raw.target)) return bad("camera.target must be [x, y, z]")
    camera.target = raw.target
  }
  return { ok: true, value: camera }
}

/** Validate one `scene` fence, or explain why it cannot be built. */
export function parseScene(
  source: string,
  options: { allowedModelOrigins?: string[]; maxObjects?: number; maxSourceBytes?: number } = {},
): SceneResult<ParsedScene> {
  const maxObjects = options.maxObjects ?? 64
  const maxSourceBytes = options.maxSourceBytes ?? 32 * 1024
  if (new TextEncoder().encode(source).byteLength > maxSourceBytes) {
    return { ok: false, error: { code: "too-large", message: "Scene definition is too large." } }
  }
  let raw: unknown
  try {
    raw = JSON.parse(source)
  } catch {
    return { ok: false, error: { code: "invalid-json", message: "Scene definition is not valid JSON." } }
  }
  if (!isRecord(raw)) return bad("A scene definition must be a JSON object")
  for (const key of Object.keys(raw)) {
    if (!SCENE_FIELDS.has(key)) return bad(`${key} is not a field of a scene definition`)
  }
  if (!Array.isArray(raw.objects) || raw.objects.length === 0) return bad("objects must be a non-empty array")
  if (raw.objects.length > maxObjects) return bad(`objects has more than ${maxObjects} entries`)

  const objects: SceneObject[] = []
  const refused: RefusedModel[] = []
  for (const [index, entry] of raw.objects.entries()) {
    const object = parseObject(entry, index, options.allowedModelOrigins)
    if (object.ok === "refused") refused.push(object.refused)
    else if (!object.ok) return object
    else objects.push(object.value)
  }
  if (objects.length === 0) return bad(refused[0]?.message ?? "objects must be a non-empty array")
  const definition: SceneDefinition = { objects }

  const camera = parseCamera(raw.camera)
  if (!camera.ok) return camera
  if (camera.value) definition.camera = camera.value

  if (raw.grid !== undefined) {
    if (typeof raw.grid !== "boolean") return bad("grid must be true or false")
    definition.grid = raw.grid
  }
  if (raw.autoRotate !== undefined) {
    if (typeof raw.autoRotate !== "boolean") return bad("autoRotate must be true or false")
    definition.autoRotate = raw.autoRotate
  }
  if (raw.caption !== undefined) {
    if (typeof raw.caption !== "string") return bad("caption must be a string")
    definition.caption = raw.caption
  }
  return { ok: true, value: { definition, refused } }
}
