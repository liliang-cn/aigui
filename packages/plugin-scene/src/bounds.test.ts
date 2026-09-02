import { describe, expect, it } from "vitest"
import { centerOf, framingDistance, halfExtents, sceneBounds } from "./bounds"
import type { SceneObject } from "./types"

describe("centerOf", () => {
  it("lifts a bottom-anchored object by half its height", () => {
    // This is the sum the protocol takes out of the model's hands.
    expect(centerOf({ shape: "box", size: [1, 2, 1], position: [0, 0, 0], anchor: "bottom" })).toEqual([0, 1, 0])
    expect(centerOf({ shape: "cylinder", radius: 1, height: 3, position: [2, 0.5, 2], anchor: "bottom" })).toEqual([2, 2, 2])
    expect(centerOf({ shape: "sphere", radius: 1, anchor: "bottom" })).toEqual([0, 1, 0])
  })
  it("leaves a centre-anchored object where it was put", () => {
    expect(centerOf({ shape: "box", size: [1, 2, 1], position: [1, 1, 1] })).toEqual([1, 1, 1])
    expect(centerOf({ shape: "box", size: [1, 2, 1] })).toEqual([0, 0, 0])
  })
})

describe("halfExtents", () => {
  it("counts a capsule's caps and a torus's tube", () => {
    expect(halfExtents({ shape: "capsule", radius: 0.5, height: 2 })).toEqual([0.5, 1.5, 0.5])
    expect(halfExtents({ shape: "torus", radius: 1, tube: 0.25 })).toEqual([1.25, 0.25, 1.25])
  })
  it("uses the wider rim of a frustum", () => {
    expect(halfExtents({ shape: "cylinder", radius: 1, height: 2, radiusTop: 3 })[0]).toBe(3)
  })
  it("assumes about a metre for a model with no size, and the promised size otherwise", () => {
    expect(halfExtents({ shape: "model", src: "https://a.example/x.glb" })).toEqual([0.5, 0.5, 0.5])
    expect(halfExtents({ shape: "model", src: "https://a.example/x.glb", size: 4 })).toEqual([2, 2, 2])
  })
  it("gives a plane no height", () => {
    expect(halfExtents({ shape: "plane", size: [4, 6] })).toEqual([2, 0, 3])
  })
})

describe("sceneBounds", () => {
  it("encloses a single object with its half-diagonal", () => {
    const bounds = sceneBounds([{ shape: "box", size: [2, 2, 2], position: [3, 0, 0] }])
    expect(bounds.center).toEqual([3, 0, 0])
    expect(bounds.radius).toBeCloseTo(Math.sqrt(3))
  })
  it("is the same whichever way the object is turned", () => {
    const flat: SceneObject = { shape: "box", size: [4, 1, 1] }
    const turned: SceneObject = { ...flat, rotation: [30, 60, 90] }
    expect(sceneBounds([flat])).toEqual(sceneBounds([turned]))
  })
  it("reaches across a spread of objects", () => {
    const bounds = sceneBounds([
      { shape: "sphere", radius: 1, position: [-5, 0, 0] },
      { shape: "sphere", radius: 1, position: [5, 0, 0] },
    ])
    expect(bounds.center).toEqual([0, 0, 0])
    expect(bounds.radius).toBeCloseTo(6)
  })
  it("honours the anchor when it places the bounds", () => {
    const bounds = sceneBounds([{ shape: "box", size: [2, 4, 2], anchor: "bottom" }])
    expect(bounds.center[1]).toBe(2)
  })
  it("never collapses to nothing", () => {
    expect(sceneBounds([]).radius).toBe(1)
    expect(sceneBounds([{ shape: "sphere", radius: 0.01 }]).radius).toBe(0.5)
  })
})

describe("framingDistance", () => {
  it("stands further back for a narrower field of view", () => {
    const bounds = { center: [0, 0, 0] as const, radius: 1 }
    expect(framingDistance({ ...bounds, center: [0, 0, 0] }, 30, 1)).toBeGreaterThan(framingDistance({ ...bounds, center: [0, 0, 0] }, 60, 1))
  })
  it("fits the tighter axis, so a tall canvas does not crop the sides", () => {
    const bounds = { center: [0, 0, 0] as [number, number, number], radius: 1 }
    expect(framingDistance(bounds, 40, 0.5)).toBeGreaterThan(framingDistance(bounds, 40, 2))
    expect(framingDistance(bounds, 40, 2)).toBeCloseTo(framingDistance(bounds, 40, 1))
  })
})
