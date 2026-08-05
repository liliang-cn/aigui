/**
 * The physics the model is not asked to do.
 *
 * Where the image lands, how big it is, whether it is upright or inverted, real or virtual, what
 * the refraction angle is and whether the light gets out at all — every one of these follows from
 * the conditions, and every one of them is something a model states wrongly often enough to matter.
 * Computing them here is what keeps a confident wrong answer out of the figure.
 */

export type ImagingElement = "convex-lens" | "concave-lens" | "concave-mirror" | "convex-mirror" | "plane-mirror"

export interface ImageResult {
  /** Image distance from the element, signed by the thin-lens convention. */
  v: number
  /** Where the image sits on the axis, with the element at 0 and light travelling right. */
  x: number
  /** Signed height: negative is inverted. */
  height: number
  magnification: number
  real: boolean
  inverted: boolean
  /** True when the object sits at the focal point and no image forms. */
  atInfinity: boolean
}

/**
 * Solve `1/u + 1/v = 1/f`.
 *
 * A mirror sends light back the way it came, so a real image forms in front of it — on the same
 * side as the object — while a lens forms one behind. That is the whole difference between the two
 * cases, and getting it backwards puts the image on the wrong side of a figure that otherwise looks
 * completely reasonable.
 */
export function imageOf(element: ImagingElement, focal: number, distance: number, height: number): ImageResult {
  if (element === "plane-mirror") {
    return { v: -distance, x: distance, height, magnification: 1, real: false, inverted: false, atInfinity: false }
  }
  const u = distance
  if (Math.abs(u - focal) < 1e-9) {
    return { v: Number.POSITIVE_INFINITY, x: Number.POSITIVE_INFINITY, height: 0, magnification: Number.POSITIVE_INFINITY, real: true, inverted: true, atInfinity: true }
  }
  const v = (u * focal) / (u - focal)
  const magnification = -v / u
  const mirror = element === "concave-mirror" || element === "convex-mirror"
  return {
    v,
    x: mirror ? -v : v,
    height: height * magnification,
    magnification,
    real: v > 0,
    inverted: magnification < 0,
    atInfinity: false,
  }
}

/** Where the focal points sit on the axis. A mirror's focus is in front of it. */
export function focalPoints(element: ImagingElement, focal: number): { near: number; far: number } | undefined {
  if (element === "plane-mirror") return undefined
  const mirror = element === "concave-mirror" || element === "convex-mirror"
  // For a lens the two foci straddle the element; for a mirror both sit on the reflecting side.
  return mirror ? { near: -focal, far: -focal } : { near: -focal, far: focal }
}

export interface RefractionResult {
  /** Refraction angle in degrees, or undefined under total internal reflection. */
  refraction?: number
  /** The critical angle, when one exists (going from denser to rarer). */
  critical?: number
  totalInternalReflection: boolean
}

/** Snell's law, and the case where it has no solution. */
export function refract(n1: number, n2: number, incidenceDegrees: number): RefractionResult {
  const incidence = (incidenceDegrees * Math.PI) / 180
  const critical = n1 > n2 ? (Math.asin(n2 / n1) * 180) / Math.PI : undefined
  const sine = (n1 * Math.sin(incidence)) / n2
  if (sine > 1) return { totalInternalReflection: true, critical }
  return { refraction: (Math.asin(sine) * 180) / Math.PI, critical, totalInternalReflection: false }
}

export interface Point {
  x: number
  y: number
}

export interface Ray {
  points: Point[]
  /** A virtual ray is the backward extension the eye infers, and is drawn dashed. */
  virtual?: boolean
}

/**
 * The three rays a textbook draws, for a lens.
 *
 * Each one is a rule the reader is meant to learn — parallel in, through the focus out — so they
 * are constructed from those rules rather than by joining the object to the computed image. The
 * two agree when the arithmetic is right, which is the point: the figure checks itself.
 */
export function lensRays(focal: number, distance: number, height: number, image: ImageResult, span: number): Ray[] {
  const top: Point = { x: -distance, y: height }
  const imageTop: Point = { x: image.x, y: image.height }
  const rays: Ray[] = []
  const beyond = (from: Point, through: Point, toX: number): Point => {
    const t = (toX - from.x) / (through.x - from.x)
    return { x: toX, y: from.y + (through.y - from.y) * t }
  }

  // Parallel to the axis, then through the far focus.
  const hitParallel: Point = { x: 0, y: height }
  rays.push({ points: [top, hitParallel, beyond(hitParallel, imageTop, span)] })
  if (!image.real) rays.push({ points: [hitParallel, imageTop], virtual: true })

  // Straight through the optical centre.
  const centre: Point = { x: 0, y: 0 }
  rays.push({ points: [top, centre, beyond(top, centre, span)] })
  if (!image.real) rays.push({ points: [centre, imageTop], virtual: true })

  // Through the near focus, then parallel to the axis.
  if (Math.abs(distance - Math.abs(focal)) > 1e-6) {
    const nearFocus: Point = { x: focal > 0 ? -focal : focal, y: 0 }
    const hitFocal = focal > 0
      ? beyond(top, nearFocus, 0)
      : beyond(top, { x: -focal, y: 0 }, 0)
    if (Number.isFinite(hitFocal.y)) {
      rays.push({ points: [top, hitFocal, { x: span, y: hitFocal.y }] })
    }
  }
  return rays
}

/** The same construction for a mirror, where every ray comes back to the object's side. */
export function mirrorRays(focal: number, distance: number, height: number, image: ImageResult, span: number): Ray[] {
  const top: Point = { x: -distance, y: height }
  const imageTop: Point = { x: image.x, y: image.height }
  const rays: Ray[] = []
  const hitParallel: Point = { x: 0, y: height }
  const focus: Point = { x: -focal, y: 0 }

  // In parallel, out through the focus — or, for a convex mirror, along a line that appears to come
  // from the focus behind it.
  const outTo = focal > 0
    ? extend(hitParallel, focus, -span)
    : extend(hitParallel, { x: -focal, y: 0 }, -span)
  rays.push({ points: [top, hitParallel, outTo] })
  if (focal < 0) rays.push({ points: [hitParallel, { x: -focal, y: 0 }], virtual: true })

  // To the vertex, reflected symmetrically about the axis.
  const vertex: Point = { x: 0, y: 0 }
  // Bounded like the others: a ray drawn to the edge of the canvas dominates the figure.
  rays.push({ points: [top, vertex, { x: -span, y: (height * span) / distance }] })

  if (!image.real) {
    rays.push({ points: [hitParallel, imageTop], virtual: true })
    rays.push({ points: [vertex, imageTop], virtual: true })
  }
  return rays
}

function extend(from: Point, through: Point, toX: number): Point {
  const t = (toX - from.x) / (through.x - from.x)
  return { x: toX, y: from.y + (through.y - from.y) * t }
}
