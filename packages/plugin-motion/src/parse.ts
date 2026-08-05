import type { MotionDefinition, MotionKind } from "./motion"

const FIELDS: Record<MotionKind, { required: string[]; optional: string[] }> = {
  projectile: { required: ["speed", "angle"], optional: ["height"] },
  "free-fall": { required: ["height"], optional: [] },
  "uniform-acceleration": { required: ["speed", "acceleration", "duration"], optional: [] },
  shm: { required: ["amplitude", "period"], optional: [] },
  circular: { required: ["radius", "period"], optional: [] },
  collision: { required: ["bodies", "kind"], optional: [] },
}
const COMMON = ["motion", "strobe", "show", "caption"]
const SHOW = new Set(["trajectory", "strobe", "vectors"])
/** Fields that would mean the model answered the question instead of setting it up. */
const COMPUTED = /"(range|flightTime|maxHeight|apex|finalSpeed|displacement|velocityAfter|result|frequency|omega|energy)"\s*:/

export interface MotionError {
  code: "invalid-json" | "invalid-definition" | "too-large"
  message: string
}
export type MotionResultOf<T> = { ok: true; value: T } | { ok: false; error: MotionError }

const bad = (message: string): MotionResultOf<never> => ({ ok: false, error: { code: "invalid-definition", message } })
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

/** Validate one `motion` fence. */
export function parseMotion(source: string, options: { maxSourceBytes?: number } = {}): MotionResultOf<MotionDefinition> {
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
  if (COMPUTED.test(source)) return bad("give the initial conditions, not the result — the range and the times are computed for you")

  const kind = raw.motion
  if (typeof kind !== "string" || !(kind in FIELDS)) {
    return bad(`motion must be one of ${Object.keys(FIELDS).join(", ")}`)
  }
  const shape = FIELDS[kind as MotionKind]
  const allowed = new Set([...COMMON, ...shape.required, ...shape.optional])
  for (const key of Object.keys(raw)) if (!allowed.has(key)) return bad(`a ${kind} figure has no field ${key}`)
  for (const key of shape.required) if (!(key in raw)) return bad(`a ${kind} figure needs ${key}`)

  const definition: MotionDefinition = { motion: kind as MotionKind }

  if (kind === "collision") {
    if (!Array.isArray(raw.bodies) || raw.bodies.length !== 2) return bad("collision needs exactly two bodies")
    // Every rejection leaves through the result type. A throw here would escape `parseMotion`
    // entirely and reach the renderer as a crash rather than as a message anyone can act on.
    let bodies: Array<{ mass: number; speed: number }>
    try {
      bodies = raw.bodies.map((b, i) => {
        if (!isRecord(b) || !num(b.mass) || b.mass <= 0) throw new RangeError(`bodies[${i}].mass must be a positive number`)
        if (!num(b.speed)) throw new RangeError(`bodies[${i}].speed must be a number`)
        for (const key of Object.keys(b)) if (key !== "mass" && key !== "speed") throw new RangeError(`bodies[${i}] has no field ${key}`)
        return { mass: b.mass, speed: b.speed }
      })
    } catch (error) {
      return bad(error instanceof Error ? error.message : "collision bodies are invalid")
    }
    if (raw.kind !== "elastic" && raw.kind !== "inelastic") return bad('collision kind must be "elastic" or "inelastic"')
    definition.bodies = bodies as [{ mass: number; speed: number }, { mass: number; speed: number }]
    definition.kind = raw.kind
  } else {
    for (const key of [...shape.required, ...shape.optional]) {
      if (!(key in raw)) continue
      if (!num(raw[key])) return bad(`${key} must be a number`)
      definition[key as "speed"] = raw[key] as number
    }
    if (kind === "projectile") {
      const angle = definition.angle ?? 0
      if (angle < 0 || angle > 90) return bad(`angle must be between 0 and 90 degrees, saw ${angle}`)
      if ((definition.speed ?? 0) <= 0) return bad("speed must be positive")
      if ((definition.height ?? 0) < 0) return bad("height must not be negative")
    }
    if (kind === "free-fall" && (definition.height ?? 0) <= 0) return bad("height must be positive")
    if ((kind === "shm" || kind === "circular") && (definition.period ?? 0) <= 0) return bad("period must be positive")
    if (kind === "shm" && (definition.amplitude ?? 0) <= 0) return bad("amplitude must be positive")
    if (kind === "circular" && (definition.radius ?? 0) <= 0) return bad("radius must be positive")
    if (kind === "uniform-acceleration") {
      if ((definition.duration ?? 0) <= 0) return bad("duration must be positive")
      // A body already at rest and slowing has no motion to draw at all.
      if ((definition.speed ?? 0) === 0 && (definition.acceleration ?? 0) === 0) return bad("a body at rest with no acceleration does not move")
    }
  }

  if (raw.strobe !== undefined) {
    if (!num(raw.strobe) || raw.strobe <= 0) return bad("strobe must be a positive number of seconds")
    definition.strobe = raw.strobe
  }
  if (raw.show !== undefined) {
    if (!Array.isArray(raw.show) || !raw.show.every((f) => typeof f === "string" && SHOW.has(f))) {
      return bad(`show may only contain ${[...SHOW].join(", ")}`)
    }
    definition.show = raw.show as MotionDefinition["show"]
  }
  if (raw.caption !== undefined) {
    if (typeof raw.caption !== "string") return bad("caption must be a string")
    definition.caption = raw.caption
  }
  return { ok: true, value: definition }
}
