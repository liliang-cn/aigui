/** A position or velocity in the plane. */
export type Vec2 = [number, number]

/**
 * Which numbers the model is writing.
 *
 * `astronomical` is AU, years and solar masses, with G following from them; it is what every
 * orbit question is posed in and it keeps `5.97e24` out of the model's hands. `si` is metres,
 * seconds and kilograms for the questions that really are in those. `toy` is unit-free with
 * G = 1 unless overridden — the "two point masses attract each other" of a first lesson, and,
 * with G = 0, a plain collision table.
 */
export type UnitSystem = "astronomical" | "si" | "toy"

/** What happens when two bodies touch: nothing (point masses), coalesce, or bounce elastically. */
export type CollisionRule = "none" | "merge" | "bounce"

/**
 * An orbit stated as a condition, so the plugin computes the velocity the model would have
 * had to look up or derive.
 *
 * `distance` is the periapsis distance and the body starts there; `eccentricity` 0 (the
 * default) is a circle. `angle` is where on the circle it starts, in degrees from +x.
 */
export interface OrbitSpec {
  around: string
  distance: number
  eccentricity?: number
  angle?: number
  direction?: "ccw" | "cw"
}

export interface BodyDefinition {
  id: string
  /** Zero is a test particle: it feels gravity and exerts none. */
  mass: number
  position?: Vec2
  velocity?: Vec2
  orbit?: OrbitSpec
  /** Drawn size, and the size that decides a collision. */
  radius?: number
  color?: string
  /** Held in place regardless of what pulls on it. */
  fixed?: boolean
}

export interface GravityDefinition {
  units: UnitSystem
  /** Only with `units: "toy"`. */
  G?: number
  bodies: BodyDefinition[]
  /** How long to run, in the unit system's time unit. */
  duration: number
  collisions: CollisionRule
  trails: boolean
  animate: boolean
  caption?: string
}

export interface GravityOptions {
  /** Figure width in CSS pixels. Default 640. */
  width?: number
  /** Figure height in CSS pixels. Default 400. */
  height?: number
  /** Refuse a scene with more bodies than this. Default 12. */
  maxBodies?: number
  /** Stop integrating after this many steps and say so. Default 200 000. */
  maxSteps?: number
  /** Refuse a fence larger than this, before parsing it. Default 16 KiB. */
  maxSourceBytes?: number
  /** Host-level switch for the moving figure; `false` draws every scene static. Default true. */
  animate?: boolean
}

export interface GravityError {
  code: "invalid-json" | "invalid-definition" | "too-large"
  message: string
}

export type GravityResult<T> = { ok: true; value: T } | { ok: false; error: GravityError }

/** One body as the integrator sees it. */
export interface BodyState {
  id: string
  mass: number
  position: Vec2
  velocity: Vec2
  radius?: number
  color?: string
  fixed: boolean
  alive: boolean
  /** Filled in for a body placed by `orbit`: what was computed from the condition. */
  orbit?: { speed: number; period: number; around: string }
}

/** Positions at one moment; `null` where a body has merged into another. */
export interface Sample {
  time: number
  positions: Array<Vec2 | null>
}

export interface CollisionEvent {
  time: number
  a: string
  b: string
  rule: "merge" | "bounce"
  /** For a merge, the id that carried on. */
  into?: string
}

export interface Simulation {
  initial: BodyState[]
  final: BodyState[]
  samples: Sample[]
  events: CollisionEvent[]
  /** Total mechanical energy at the start and the end, and the relative drift between them. */
  energy: { initial: number; final: number; drift: number }
  /** Whether the step cap ended the run before `duration`. */
  truncated: boolean
  steps: number
}
