import { describe, expect, it } from "vitest"
import { createLayout, hash, layoutChunk, layoutRadius, layoutSteps, seedPositions, LAYOUT_SPRING } from "./layout3d"
import type { Graph3dEdge, Graph3dNode } from "./types"

const nodes = (count: number, prefix = "n"): Graph3dNode[] => Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}`, name: `${prefix}${i}` }))

/** Every node's distance from the origin. */
const radii = (positions: Float32Array): number[] => {
  const out: number[] = []
  for (let i = 0; i < positions.length; i += 3) out.push(Math.hypot(positions[i], positions[i + 1], positions[i + 2]))
  return out
}

const distance = (positions: Float32Array, a: number, b: number): number =>
  Math.hypot(positions[a * 3] - positions[b * 3], positions[a * 3 + 1] - positions[b * 3 + 1], positions[a * 3 + 2] - positions[b * 3 + 2])

/** A graph with `count` nodes and `count` random-but-deterministic edges. */
function randomGraph(count: number): { nodes: Graph3dNode[]; edges: Graph3dEdge[] } {
  const list = nodes(count)
  const edges: Graph3dEdge[] = []
  for (let i = 1; i < count; i++) {
    // A spanning tree plus a chord each, from the id hash rather than Math.random, so the
    // benchmark measures the same graph on every run.
    edges.push({ from: `n${i}`, to: `n${hash(`t${i}`) % i}` })
    edges.push({ from: `n${i}`, to: `n${hash(`c${i}`) % count}` })
  }
  return { nodes: list, edges }
}

describe("layoutSteps", () => {
  it("spends the documented number of steps at the sizes the panel is drawn at", () => {
    // The whole point of scaling the step count: the layout is O(n²) per step, so a graph twenty
    // times bigger cannot have the same number of steps spent on it and still settle in front of
    // the reader.
    expect(layoutSteps(50)).toBe(300)
    expect(layoutSteps(500)).toBe(120)
    expect(layoutSteps(2000)).toBe(40)
  })
  it("never spends more on a bigger graph, and stays inside the ends", () => {
    let previous = Number.POSITIVE_INFINITY
    for (let n = 1; n <= 2500; n += 7) {
      const steps = layoutSteps(n)
      expect(steps).toBeLessThanOrEqual(previous)
      expect(steps).toBeGreaterThanOrEqual(40)
      expect(steps).toBeLessThanOrEqual(300)
      previous = steps
    }
    expect(layoutSteps(1)).toBe(300)
    expect(layoutSteps(100000)).toBe(40)
  })
})

describe("layoutChunk", () => {
  it("finishes a small graph in about half a second and never blocks a frame with a big one", () => {
    // Six entities are given three hundred steps; at one step a frame that is five seconds of
    // watching an already-settled graph twitch.
    const frames = (n: number): number => layoutSteps(n) / layoutChunk(n)
    expect(frames(6)).toBeLessThan(60)
    expect(layoutChunk(6)).toBeLessThanOrEqual(8)
    // Past a few hundred a single step is most of a frame already, so there is nothing to batch.
    expect(layoutChunk(500)).toBe(1)
    expect(layoutChunk(2000)).toBe(1)
    // And the settling is always something a reader sits through rather than waits out.
    for (const n of [6, 50, 200, 500, 2000]) expect(frames(n)).toBeLessThanOrEqual(120)
  })
})

describe("seedPositions", () => {
  it("puts the same ids in the same places, every time", () => {
    const a = seedPositions(["kyiv", "moscow", "reuters"])
    const b = seedPositions(["kyiv", "moscow", "reuters"])
    expect([...a]).toEqual([...b])
    // And nowhere near each other: a sphere, not a heap at the origin.
    expect(distance(a, 0, 1)).toBeGreaterThan(0.1)
  })
  it("keeps a node that was already placed exactly where it was", () => {
    const previous = new Map<string, readonly [number, number, number]>([
      ["kyiv", [3, 4, 0]],
      ["moscow", [-3, -4, 0]],
    ])
    const seeded = seedPositions(["kyiv", "moscow"], previous)
    expect([...seeded]).toEqual([3, 4, 0, -3, -4, 0])
  })
  it("drops a new node into the cloud the remembered ones already occupy", () => {
    // A graph that gained three entities must not reshuffle: the ones that were there stay put,
    // and the new ones start at the same scale rather than on a unit sphere inside them.
    const previous = new Map<string, readonly [number, number, number]>([
      ["a", [30, 0, 0]],
      ["b", [-30, 0, 0]],
      ["c", [0, 30, 0]],
    ])
    const seeded = seedPositions(["a", "b", "c", "d"], previous)
    expect([...seeded].slice(0, 9)).toEqual([30, 0, 0, -30, 0, 0, 0, 30, 0])
    expect(Math.hypot(seeded[9], seeded[10], seeded[11])).toBeGreaterThan(10)
    expect(Math.hypot(seeded[9], seeded[10], seeded[11])).toBeLessThan(60)
  })
})

describe("createLayout", () => {
  it("gives two runs over the same graph identical positions", () => {
    // Determinism is the whole reason the seed is a hash of the ids: the same knowledge graph
    // has to draw the same picture twice running, on two machines, in a screenshot test.
    const graph = randomGraph(40)
    const run = (): number[] => {
      const layout = createLayout(graph.nodes, graph.edges)
      layout.step(layout.steps)
      return [...layout.positions()]
    }
    expect(run()).toEqual(run())
  })

  it("settles a triangle into a triangle", () => {
    const layout = createLayout(nodes(3, "t"), [
      { from: "t0", to: "t1" },
      { from: "t1", to: "t2" },
      { from: "t2", to: "t0" },
    ])
    layout.step(layout.steps)
    const p = layout.positions()
    const sides = [distance(p, 0, 1), distance(p, 1, 2), distance(p, 2, 0)]
    expect(Math.max(...sides) / Math.min(...sides)).toBeLessThan(1.1)
    // And at roughly the spring's own length, which is what makes one graph's edges comparable
    // with another's.
    expect(Math.min(...sides)).toBeGreaterThan(LAYOUT_SPRING * 0.5)
  })

  it("holds a disconnected graph together instead of letting it fly apart", () => {
    // Nothing attracts two components to each other, so without the pull to the origin the
    // repulsion between them is unopposed and they leave the panel — one of them for good.
    const layout = createLayout(nodes(7), [
      { from: "n0", to: "n1" },
      { from: "n1", to: "n2" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5" },
    ])
    layout.step(layout.steps)
    const bound = layoutRadius(7) * 2
    for (const r of radii(layout.positions())) {
      expect(Number.isFinite(r)).toBe(true)
      expect(r).toBeLessThan(bound)
    }
    // The lone node is still pushed clear of the two chains rather than sitting on one of them.
    expect(radii(layout.positions())[6]).toBeGreaterThan(LAYOUT_SPRING * 0.5)
  })

  it("stops at its own step count, and ignores anything asked of it after", () => {
    const layout = createLayout(nodes(5), [{ from: "n0", to: "n1" }])
    expect(layout.done).toBe(false)
    layout.step(layout.steps - 1)
    expect(layout.done).toBe(false)
    layout.step(1)
    expect(layout.done).toBe(true)
    const settled = [...layout.positions()]
    layout.step(50)
    expect([...layout.positions()]).toEqual(settled)
  })

  it("lays out five hundred entities inside a frame budget a reader would sit through", () => {
    const graph = randomGraph(500)
    const layout = createLayout(graph.nodes, graph.edges)
    const started = performance.now()
    layout.step(layout.steps)
    const elapsed = performance.now() - started
    expect(layout.done).toBe(true)
    expect(elapsed).toBeLessThan(1500)
    expect(radii(layout.positions()).every(Number.isFinite)).toBe(true)
  })
})
