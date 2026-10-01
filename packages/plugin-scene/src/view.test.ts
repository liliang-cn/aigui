import { readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import * as THREE from "three"
import { describe, expect, it } from "vitest"
import { sceneBounds } from "./bounds"
import { countLeaderTangles, countOverlaps, layoutLabels, type PlacedLabel } from "./labels"
import { parseScene } from "./parse"
import type { SceneDefinition } from "./types"
import { estimateLabelWidth, frameCamera, geometryFor, labelEntry, labelRequests, placeAt, screenObstacles, type LabelEntry, type Solid } from "./view"

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures")
const W = 728
const H = Math.round(W * 0.6)

/**
 * Everything the renderer does to place labels, minus the drawing: build the objects, stand the
 * camera, lay the labels out. It is the same code the page runs, so a scene that lays out cleanly
 * here lays out cleanly there — the browser tests check that the drawing agrees.
 */
function lay(definition: SceneDefinition) {
  const solids: Solid[] = []
  const labels: LabelEntry[] = []
  for (const [owner, object] of definition.objects.entries()) {
    const geometry = geometryFor(THREE, object)
    if (!geometry) continue
    const mesh = new THREE.Mesh(geometry)
    placeAt(mesh, object)
    mesh.updateMatrixWorld()
    solids.push({ owner, node: mesh, flat: object.shape === "plane" })
    const entry = labelEntry(owner, object, mesh, estimateLabelWidth)
    if (entry) labels.push(entry)
  }
  const camera = new THREE.PerspectiveCamera(40, W / H, 0.01, 1000)
  frameCamera(THREE, camera, { definition, solids, labels, fit: sceneBounds(definition.objects), width: W, height: H })
  camera.updateMatrixWorld()
  const obstacles = screenObstacles(THREE, camera, solids, W, H)
  const { requests } = labelRequests(THREE, camera, labels, W, H)
  const placed = layoutLabels(requests, { width: W, height: H, obstacles })
  return { placed, requests, obstacles, labels }
}

const load = (path: string): SceneDefinition => {
  const result = parseScene(readFileSync(join(fixtures, path), "utf8"), { allowedModelOrigins: ["https://assets.example.com"] })
  if (!result.ok) throw new Error(result.error.message)
  return result.value.definition
}

const onCanvas = (placed: PlacedLabel[]) => placed.every(({ rect }) => rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= W && rect.y + rect.height <= H)

describe("stacked objects with labels (the reported scene)", () => {
  const sided = load("regression/stacked-labels.json")
  const { camera: _camera, ...framed } = sided

  it.each([
    ["with the author's camera", sided],
    ["with the scene framing itself", framed],
  ])("every label is readable, on no object and on no other label — %s", (_name, definition) => {
    const { placed, requests, obstacles } = lay(definition)
    expect(placed).toHaveLength(6)
    expect(countOverlaps(placed, requests, obstacles)).toBe(0)
    expect(onCanvas(placed)).toBe(true)
    for (const { leader } of placed) expect(leader).toBeDefined()
    // And every leader reads unambiguously: no two cross, none runs through another object.
    expect(countLeaderTangles(placed, requests, obstacles)).toBe(0)
  })

  it("hangs the turned cylinder's label from where the cylinder lies, not where it would stand", () => {
    const { labels } = lay(framed)
    const pipe = labels.find((l) => l.text.startsWith("DRBD 复制网络"))!
    const box = new THREE.Box3().setFromObject(pipe.node)
    // Lying along x, 7.2 m long and 0.1 m thick: its top is at 1.4 m, not 1.35 + 3.6.
    expect(box.max.y).toBeCloseTo(1.4, 2)
    expect(box.max.x - box.min.x).toBeCloseTo(7.2, 2)
  })
})

describe("the model's own scenes still lay out", () => {
  const names = readdirSync(fixtures).filter((name) => name.endsWith(".json")).sort()
  it.each(names)("%s keeps every label on the canvas", (name) => {
    const { placed } = lay(load(name))
    expect(onCanvas(placed)).toBe(true)
  })
})
