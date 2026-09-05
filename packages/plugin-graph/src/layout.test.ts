import { describe, expect, it } from "vitest"
import { createLayout, hash, layoutSteps, settle } from "./layout"

const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `n${i}` }))
const chain = (n: number) => Array.from({ length: n - 1 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}`, type: undefined }))
const at = (positions: Float32Array, i: number): [number, number, number] => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]
const distance = (positions: Float32Array, a: number, b: number) => Math.hypot(...at(positions, a).map((v, k) => v - at(positions, b)[k]))

describe("hash", () => {
  it("is FNV-1a: stable, and different for neighbouring strings", () => {
    expect(hash("Person")).toBe(hash("Person"))
    expect(hash("a")).not.toBe(hash("b"))
    expect(hash("")).toBe(2166136261)
  })
})

describe("layoutSteps", () => {
  it("spends fewer steps on a bigger graph, through the three anchors", () => {
    expect(layoutSteps(1)).toBe(300)
    expect(layoutSteps(50)).toBe(300)
    expect(layoutSteps(500)).toBe(120)
    expect(layoutSteps(2000)).toBe(40)
    expect(layoutSteps(5000)).toBe(40)
    expect(layoutSteps(150)).toBeLessThan(300)
    expect(layoutSteps(150)).toBeGreaterThan(120)
  })
})

describe("the force layout", () => {
  it("is deterministic: the same graph settles into the same picture", () => {
    const a = settle(ids(12), chain(12), 3)
    const b = settle(ids(12), chain(12), 3)
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it("stays in the plane when asked for two dimensions", () => {
    const positions = settle(ids(9), chain(9), 2)
    for (let i = 0; i < 9; i++) expect(at(positions, i)[2]).toBe(0)
    // and is not degenerate: the nodes are spread out
    expect(distance(positions, 0, 8)).toBeGreaterThan(0.5)
  })

  it("pulls connected nodes closer than unconnected ones", () => {
    const nodes = ids(9)
    const links = [
      ...chain(3),
      { from: "n3", to: "n4", type: undefined },
      { from: "n4", to: "n5", type: undefined },
      { from: "n6", to: "n7", type: undefined },
      { from: "n7", to: "n8", type: undefined },
    ]
    const positions = settle(nodes, links, 3)
    const linked = links.map((l) => distance(positions, Number(l.from.slice(1)), Number(l.to.slice(1))))
    const unlinked = [distance(positions, 0, 4), distance(positions, 1, 7), distance(positions, 3, 8), distance(positions, 0, 6)]
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
    expect(mean(linked)).toBeLessThan(mean(unlinked))
  })

  it("never produces NaN, even for a single node, a self edge or an edge to nothing", () => {
    const positions = settle([{ id: "only" }], [{ from: "only", to: "only", type: undefined }, { from: "only", to: "ghost", type: undefined }], 3)
    expect(Array.from(positions).every(Number.isFinite)).toBe(true)
  })

  it("is normalised into a unit ball", () => {
    const positions = settle(ids(30), chain(30), 3)
    let largest = 0
    for (let i = 0; i < 30; i++) largest = Math.max(largest, Math.hypot(...at(positions, i)))
    expect(largest).toBeCloseTo(1, 5)
  })

  it("can be stepped a few at a time and knows when it is done", () => {
    const layout = createLayout(ids(4), chain(4), { dimensions: 3 })
    expect(layout.steps).toBe(300)
    expect(layout.done).toBe(false)
    layout.step(10)
    expect(layout.taken).toBe(10)
    layout.step(1000)
    expect(layout.taken).toBe(300)
    expect(layout.done).toBe(true)
    expect(layout.positions()).toHaveLength(12)
  })
})
