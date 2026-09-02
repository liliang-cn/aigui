import type { Bounds, SceneObject, Vec3 } from "./types"

/** Half the extent of an object along x, y and z in its own frame, before rotation. */
export function halfExtents(object: SceneObject): Vec3 {
  switch (object.shape) {
    case "box":
      return [object.size[0] / 2, object.size[1] / 2, object.size[2] / 2]
    case "sphere":
      return [object.radius, object.radius, object.radius]
    case "cylinder": {
      const r = Math.max(object.radius, object.radiusTop ?? object.radius)
      return [r, object.height / 2, r]
    }
    case "cone":
      return [object.radius, object.height / 2, object.radius]
    case "torus": {
      const r = object.radius + object.tube
      return [r, object.tube, r]
    }
    case "capsule":
      return [object.radius, object.height / 2 + object.radius, object.radius]
    case "plane":
      return [object.size[0] / 2, 0, object.size[1] / 2]
    case "model": {
      // Unknown until the file arrives; `size` is the longest side it will be scaled to, and a
      // file without one is assumed to be about a metre across, which is what most are.
      const half = (object.size ?? 1) / 2
      return [half, half, half]
    }
  }
}

/**
 * Where an object's centre ends up, honouring `anchor`.
 *
 * `bottom` is the anchor a model reaches for when it puts something on the ground, and it means
 * the centre sits half the object's height above `position`. Rotation is applied about the
 * centre, so an object anchored at its base and then tilted lifts a corner — the same thing a
 * tilted crate does.
 */
export function centerOf(object: SceneObject): Vec3 {
  const [x, y, z] = object.position ?? [0, 0, 0]
  if (object.anchor !== "bottom") return [x, y, z]
  return [x, y + halfExtents(object)[1], z]
}

/** The radius of the sphere one object fits inside, whichever way it is turned. */
export function boundingRadius(object: SceneObject): number {
  // A sphere is its own bounding sphere; the half-diagonal of its box would frame it a third too
  // far away.
  if (object.shape === "sphere") return object.radius
  const [hx, hy, hz] = halfExtents(object)
  return Math.hypot(hx, hy, hz)
}

/**
 * The sphere every object fits inside, rotation-proof.
 *
 * Each object contributes the sphere around its own centre with the radius of its half-diagonal,
 * which is the same whichever way it is turned; the union of those is what the camera has to see.
 */
export function sceneBounds(objects: readonly SceneObject[]): Bounds {
  if (objects.length === 0) return { center: [0, 0, 0], radius: 1 }
  const spheres = objects.map((object) => ({ center: centerOf(object), radius: boundingRadius(object) }))
  const low: Vec3 = [Infinity, Infinity, Infinity]
  const high: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const { center, radius } of spheres) {
    for (let axis = 0; axis < 3; axis++) {
      low[axis] = Math.min(low[axis], center[axis] - radius)
      high[axis] = Math.max(high[axis], center[axis] + radius)
    }
  }
  const center: Vec3 = [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2]
  const radius = spheres.reduce((max, sphere) => {
    const d = Math.hypot(sphere.center[0] - center[0], sphere.center[1] - center[1], sphere.center[2] - center[2])
    return Math.max(max, d + sphere.radius)
  }, 0)
  return { center, radius: Math.max(radius, 0.5) }
}

/** The three-quarter view a product photo uses: above, in front, and to one side. */
export const DEFAULT_VIEW: Vec3 = [0.7, 0.55, 0.85]

/**
 * How far back a camera with this field of view must stand to fit the bounding sphere, on whichever
 * of the two axes is tighter — a wide canvas must not shrink the scene to a stamp in the middle.
 */
export function framingDistance(bounds: Bounds, fovDegrees: number, aspect: number): number {
  const vertical = bounds.radius / Math.sin((fovDegrees * Math.PI) / 360)
  const horizontal = vertical / Math.max(1e-6, aspect)
  return Math.max(vertical, horizontal) * 1.25
}
