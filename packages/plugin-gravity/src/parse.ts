import { resolveInitial } from "./simulate"
import type { BodyDefinition, BodyState, CollisionRule, GravityDefinition, GravityResult, OrbitSpec, UnitSystem, Vec2 } from "./types"

const UNIT_SYSTEMS = new Set<UnitSystem>(["astronomical", "si", "toy"])
const COLLISION_RULES = new Set<CollisionRule>(["none", "merge", "bounce"])
const SCENE_FIELDS = new Set(["units", "G", "bodies", "duration", "collisions", "trails", "animate", "caption"])
const BODY_FIELDS = new Set(["id", "mass", "position", "velocity", "orbit", "radius", "color", "fixed"])
const ORBIT_FIELDS = new Set(["around", "distance", "eccentricity", "angle", "direction"])
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
export const COLOR_NAMES = new Set([
  "red", "orange", "yellow", "green", "teal", "cyan", "blue", "navy", "purple", "pink", "brown",
  "white", "silver", "gray", "grey", "black", "gold", "beige", "olive", "lime", "coral", "salmon",
  "ivory", "tan", "wheat", "chocolate", "crimson", "magenta", "violet", "indigo", "turquoise",
])

const bad = (message: string): GravityResult<never> => ({ ok: false, error: { code: "invalid-definition", message } })
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const vec2 = (value: unknown): value is Vec2 => Array.isArray(value) && value.length === 2 && value.every(finite)

function parseOrbit(raw: unknown, at: string, earlier: Set<string>): GravityResult<OrbitSpec> {
  if (!isRecord(raw)) return bad(`${at}.orbit must be an object`)
  for (const key of Object.keys(raw)) {
    if (!ORBIT_FIELDS.has(key)) return bad(`${at}.orbit.${key} is not a field of an orbit`)
  }
  if (typeof raw.around !== "string") return bad(`${at}.orbit.around must name a body`)
  // Resolved in order, so a moon can circle a planet that circles a star — but only bodies
  // already placed can be circled, or the velocity has nothing to be relative to.
  if (!earlier.has(raw.around)) return bad(`${at}.orbit.around refers to ${raw.around}, which must be a body listed before this one`)
  if (!finite(raw.distance) || raw.distance <= 0) return bad(`${at}.orbit.distance must be a positive number`)
  const orbit: OrbitSpec = { around: raw.around, distance: raw.distance }
  if (raw.eccentricity !== undefined) {
    if (!finite(raw.eccentricity) || raw.eccentricity < 0 || raw.eccentricity >= 1) return bad(`${at}.orbit.eccentricity must be from 0 up to (not including) 1`)
    orbit.eccentricity = raw.eccentricity
  }
  if (raw.angle !== undefined) {
    if (!finite(raw.angle)) return bad(`${at}.orbit.angle must be a number of degrees`)
    orbit.angle = raw.angle
  }
  if (raw.direction !== undefined) {
    if (raw.direction !== "ccw" && raw.direction !== "cw") return bad(`${at}.orbit.direction must be ccw or cw`)
    orbit.direction = raw.direction
  }
  return { ok: true, value: orbit }
}

function parseBody(raw: unknown, index: number, earlier: Set<string>, collisions: CollisionRule): GravityResult<BodyDefinition> {
  const at = `bodies[${index}]`
  if (!isRecord(raw)) return bad(`${at} must be an object`)
  for (const key of Object.keys(raw)) {
    if (!BODY_FIELDS.has(key)) return bad(`${at}.${key} is not a field of a body`)
  }
  if (typeof raw.id !== "string" || raw.id.trim() === "" || raw.id.length > 24) return bad(`${at}.id must be a short name`)
  if (earlier.has(raw.id)) return bad(`${at}.id ${raw.id} is used twice`)
  if (!finite(raw.mass) || raw.mass < 0) return bad(`${at}.mass must be zero or a positive number`)
  const body: BodyDefinition = { id: raw.id, mass: raw.mass }
  if (raw.orbit !== undefined) {
    if (raw.position !== undefined || raw.velocity !== undefined) return bad(`${at} gives an orbit and also a position or velocity; give one or the other`)
    const orbit = parseOrbit(raw.orbit, at, earlier)
    if (!orbit.ok) return orbit
    body.orbit = orbit.value
  }
  if (raw.position !== undefined) {
    if (!vec2(raw.position)) return bad(`${at}.position must be [x, y]`)
    body.position = raw.position
  }
  if (raw.velocity !== undefined) {
    if (!vec2(raw.velocity)) return bad(`${at}.velocity must be [vx, vy]`)
    body.velocity = raw.velocity
  }
  if (raw.radius !== undefined) {
    if (!finite(raw.radius) || raw.radius <= 0) return bad(`${at}.radius must be a positive number`)
    body.radius = raw.radius
  } else if (collisions !== "none") {
    // A collision is decided by radii; without one the rule is a promise the figure cannot keep.
    return bad(`${at} needs a radius when collisions are "${collisions}"`)
  }
  if (raw.color !== undefined) {
    if (typeof raw.color !== "string" || !(HEX.test(raw.color) || COLOR_NAMES.has(raw.color.toLowerCase()))) return bad(`${at}.color must be a hex colour or a colour name`)
    body.color = raw.color.toLowerCase()
  }
  if (raw.fixed !== undefined) {
    if (typeof raw.fixed !== "boolean") return bad(`${at}.fixed must be true or false`)
    body.fixed = raw.fixed
  }
  return { ok: true, value: body }
}

export interface ParsedGravity {
  definition: GravityDefinition
  initial: BodyState[]
}

/** Validate one `gravity` fence and place its bodies, or explain why it cannot be run. */
export function parseGravity(
  source: string,
  options: { maxBodies?: number; maxSourceBytes?: number; animate?: boolean } = {},
): GravityResult<ParsedGravity> {
  const maxBodies = options.maxBodies ?? 12
  const maxSourceBytes = options.maxSourceBytes ?? 16 * 1024
  if (new TextEncoder().encode(source).byteLength > maxSourceBytes) {
    return { ok: false, error: { code: "too-large", message: "Gravity definition is too large." } }
  }
  let raw: unknown
  try {
    raw = JSON.parse(source)
  } catch {
    return { ok: false, error: { code: "invalid-json", message: "Gravity definition is not valid JSON." } }
  }
  if (!isRecord(raw)) return bad("A gravity definition must be a JSON object")
  for (const key of Object.keys(raw)) {
    if (!SCENE_FIELDS.has(key)) return bad(`${key} is not a field of a gravity definition`)
  }
  if (typeof raw.units !== "string" || !UNIT_SYSTEMS.has(raw.units as UnitSystem)) return bad(`units must be one of ${[...UNIT_SYSTEMS].join(", ")}`)
  const units = raw.units as UnitSystem
  if (!finite(raw.duration) || raw.duration <= 0) return bad("duration must be a positive number")

  let collisions: CollisionRule = "none"
  if (raw.collisions !== undefined) {
    if (typeof raw.collisions !== "string" || !COLLISION_RULES.has(raw.collisions as CollisionRule)) return bad(`collisions must be one of ${[...COLLISION_RULES].join(", ")}`)
    collisions = raw.collisions as CollisionRule
  }
  const definition: GravityDefinition = {
    units,
    bodies: [],
    duration: raw.duration,
    collisions,
    trails: true,
    animate: options.animate !== false,
  }
  if (raw.G !== undefined) {
    // In AU and years G is not a free parameter; a model that writes it there has confused the
    // unit systems, and the figure it wanted is the one without it.
    if (units !== "toy") return bad('G can only be set with units "toy"; astronomical and si fix it')
    if (!finite(raw.G) || raw.G < 0) return bad("G must be zero or a positive number")
    definition.G = raw.G
  }
  if (!Array.isArray(raw.bodies) || raw.bodies.length === 0) return bad("bodies must be a non-empty array")
  if (raw.bodies.length > maxBodies) return bad(`bodies has more than ${maxBodies} entries`)
  const seen = new Set<string>()
  for (const [index, entry] of raw.bodies.entries()) {
    const body = parseBody(entry, index, seen, collisions)
    if (!body.ok) return body
    definition.bodies.push(body.value)
    seen.add(body.value.id)
  }
  if (raw.trails !== undefined) {
    if (typeof raw.trails !== "boolean") return bad("trails must be true or false")
    definition.trails = raw.trails
  }
  if (raw.animate !== undefined) {
    if (typeof raw.animate !== "boolean") return bad("animate must be true or false")
    definition.animate = definition.animate && raw.animate
  }
  if (raw.caption !== undefined) {
    if (typeof raw.caption !== "string") return bad("caption must be a string")
    definition.caption = raw.caption
  }
  const initial = resolveInitial(definition)
  if (!initial.ok) return initial
  return { ok: true, value: { definition, initial: initial.value } }
}
