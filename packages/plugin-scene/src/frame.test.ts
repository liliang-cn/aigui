import * as THREE from "three"
import { describe, expect, it } from "vitest"
import { fitCamera, projectToScreen } from "./frame"

const W = 760
const H = 456
const margins = { left: 140, right: 160, top: 30, bottom: 12 }

/** Corners of a row of boxes three times wider than it is tall — what a sphere frames badly. */
const row = (): THREE.Vector3[] => {
  const box = new THREE.Box3(new THREE.Vector3(-4.2, 0, -0.6), new THREE.Vector3(4.2, 1.8, 0.6))
  const out: THREE.Vector3[] = []
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) out.push(new THREE.Vector3(x, y, z))
  return out
}

const extent = (camera: THREE.PerspectiveCamera, points: THREE.Vector3[]) => {
  const screen = projectToScreen(THREE, camera, points, W, H)
  const xs = screen.map((p) => p.x)
  const ys = screen.map((p) => p.y)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

describe("fitCamera", () => {
  it("fills the space between the margins, touching it on the tighter axis", () => {
    const camera = new THREE.PerspectiveCamera(40, W / H, 0.01, 1000)
    const points = row()
    fitCamera(THREE, camera, points, { direction: [0.7, 0.55, 0.85], width: W, height: H, margins })
    const e = extent(camera, points)
    expect(e.minX).toBeGreaterThanOrEqual(margins.left - 1)
    expect(e.maxX).toBeLessThanOrEqual(W - margins.right + 1)
    expect(e.minY).toBeGreaterThanOrEqual(margins.top - 1)
    expect(e.maxY).toBeLessThanOrEqual(H - margins.bottom + 1)
    const fillX = (e.maxX - e.minX) / (W - margins.left - margins.right)
    const fillY = (e.maxY - e.minY) / (H - margins.top - margins.bottom)
    expect(Math.max(fillX, fillY)).toBeGreaterThan(0.97)
  })

  it("keeps an author's target and direction, and only ever backs away", () => {
    const camera = new THREE.PerspectiveCamera(40, W / H, 0.01, 1000)
    const target = new THREE.Vector3(0, 1, 0)
    const chosen = new THREE.Vector3(0, 2.6, 8.5)
    const points = row()
    const fitted = fitCamera(THREE, camera, points, { direction: chosen.clone().sub(target).toArray() as [number, number, number], width: W, height: H, margins, fixed: { target, minDistance: chosen.distanceTo(target) } })
    expect(fitted.target.equals(target)).toBe(true)
    expect(fitted.position.distanceTo(target)).toBeGreaterThan(chosen.distanceTo(target))
    expect(fitted.position.clone().sub(target).normalize().dot(chosen.clone().sub(target).normalize())).toBeCloseTo(1, 6)
    const e = extent(camera, points)
    expect(e.minX).toBeGreaterThanOrEqual(margins.left - 1)
    expect(e.maxX).toBeLessThanOrEqual(W - margins.right + 1)

    // Plenty of room already: the author's distance stands.
    const roomy = new THREE.Vector3(0, 6, 30)
    const again = fitCamera(THREE, camera, points, { direction: roomy.clone().sub(target).toArray() as [number, number, number], width: W, height: H, margins, fixed: { target, minDistance: roomy.distanceTo(target) } })
    expect(again.position.distanceTo(roomy)).toBeLessThan(1e-6)
  })
})
