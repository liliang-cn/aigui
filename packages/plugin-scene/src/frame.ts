import type * as THREE from "three"
import type { Vec3 } from "./types"

/** Pixels kept clear on each side of the canvas: room for the labels, and a little air. */
export interface Margins {
  left: number
  right: number
  top: number
  bottom: number
}

/** Where `points` land on a `width` × `height` canvas, in CSS pixels, seen through `camera`. */
export function projectToScreen(three: typeof THREE, camera: THREE.PerspectiveCamera, points: readonly THREE.Vector3[], width: number, height: number): Array<{ x: number; y: number; inFront: boolean }> {
  const view = new three.Vector3()
  const ndc = new three.Vector3()
  return points.map((point) => {
    view.copy(point).applyMatrix4(camera.matrixWorldInverse)
    ndc.copy(point).project(camera)
    return { x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height, inFront: view.z < -camera.near }
  })
}

/**
 * Stand the camera so that every point fills the canvas inside `margins`.
 *
 * The bounding-sphere distance the scene used to use is a safe bound, not a fit: a row of boxes is
 * far wider than it is tall, and the sphere around it leaves most of the picture empty. This looks
 * along `direction` at the points, measures what they actually cover on screen, and walks the
 * camera in (or out) and sideways until that outline fills the free area. Perspective makes the
 * relation between distance and size not quite linear, so it takes a few rounds.
 */
export function fitCamera(
  three: typeof THREE,
  camera: THREE.PerspectiveCamera,
  points: readonly THREE.Vector3[],
  options: {
    direction: Vec3
    width: number
    height: number
    margins: Margins
    /**
     * A view the author chose. Its target and direction stand, and it is only ever moved back —
     * far enough that the objects clear the margins — never closer than `minDistance`.
     */
    fixed?: { target: THREE.Vector3; minDistance: number }
  },
): { position: THREE.Vector3; target: THREE.Vector3 } {
  const { width, height, margins, fixed } = options
  const box = new three.Box3().setFromPoints(points as THREE.Vector3[])
  const target = fixed ? fixed.target.clone() : box.getCenter(new three.Vector3())
  const radius = Math.max(points.reduce((max, p) => Math.max(max, p.distanceTo(target)), 0), 0.25)
  const direction = new three.Vector3(...options.direction).normalize()
  const half = (camera.fov * Math.PI) / 360
  // Never closer than the farthest point: the camera must stay outside what it is looking at. An
  // author's camera may stand inside a big scene on purpose, so there only its own distance counts.
  const nearest = fixed ? fixed.minDistance : radius * 1.05
  let distance = fixed ? nearest : Math.max(nearest, (radius / Math.sin(half)) * 1.1)
  const usableWidth = Math.max(40, width - margins.left - margins.right)
  const usableHeight = Math.max(40, height - margins.top - margins.bottom)
  const right = new three.Vector3()
  const up = new three.Vector3()

  const place = () => {
    camera.position.copy(direction).multiplyScalar(distance).add(target)
    camera.lookAt(target)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
  }
  for (let round = 0; round < 12; round++) {
    place()
    const screen = projectToScreen(three, camera, points, width, height)
    const xs = screen.map((p) => p.x)
    const ys = screen.map((p) => p.y)
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    // A fixed target stays in the middle of the canvas, so each side has to clear on its own.
    const cx = width / 2
    const cy = height / 2
    const scale = fixed
      ? Math.max((cx - minX) / (cx - margins.left), (maxX - cx) / (width - margins.right - cx), (cy - minY) / (cy - margins.top), (maxY - cy) / (height - margins.bottom - cy))
      : Math.max((maxX - minX) / usableWidth, (maxY - minY) / usableHeight)
    // How much world one pixel is at the target's depth: what turns a pixel offset into a pan.
    const perPixel = (2 * distance * Math.tan(half)) / height
    const dx = (minX + maxX) / 2 - (margins.left + usableWidth / 2)
    const dy = (minY + maxY) / 2 - (margins.top + usableHeight / 2)
    right.setFromMatrixColumn(camera.matrixWorld, 0)
    up.setFromMatrixColumn(camera.matrixWorld, 1)
    if (!fixed) target.addScaledVector(right, dx * perPixel).addScaledVector(up, -dy * perPixel)
    const next = Math.max(nearest, distance * scale)
    if (Math.abs(next - distance) < distance * 0.002 && (fixed || (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5))) break
    distance = next
  }
  place()
  return { position: camera.position.clone(), target }
}
