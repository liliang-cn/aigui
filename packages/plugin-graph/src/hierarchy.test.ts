import { describe, expect, it } from "vitest"
import { hierarchyLayout } from "./hierarchy"
import { parseGraph } from "./parse"
import type { GraphDefinition } from "./types"

const def = (classes: unknown[]): GraphDefinition => {
  const parsed = parseGraph(JSON.stringify({ classes }))
  if (!parsed.ok) throw new Error(parsed.error.message)
  return parsed.value
}

describe("hierarchyLayout", () => {
  it("puts roots on the top row and each class one row below its parent", () => {
    const layout = hierarchyLayout(def([{ id: "Animal" }, { id: "Mammal", subClassOf: "Animal" }, { id: "Dog", subClassOf: "Mammal" }, { id: "Cat", subClassOf: "Mammal" }]))
    expect(layout.rows).toBe(3)
    expect(layout.at.get("Animal")![1]).toBe(0)
    expect(layout.at.get("Mammal")![1]).toBe(0.5)
    expect(layout.at.get("Dog")![1]).toBe(1)
    expect(layout.at.get("Cat")![1]).toBe(1)
  })

  it("centres a parent over its children and keeps siblings apart", () => {
    const layout = hierarchyLayout(def([{ id: "Animal" }, { id: "Mammal", subClassOf: "Animal" }, { id: "Dog", subClassOf: "Mammal" }, { id: "Cat", subClassOf: "Mammal" }]))
    const [dog] = layout.at.get("Dog")!
    const [cat] = layout.at.get("Cat")!
    const [mammal] = layout.at.get("Mammal")!
    expect(dog).not.toBe(cat)
    expect(mammal).toBeCloseTo((dog + cat) / 2, 6)
  })

  it("lays two roots side by side, in order of declaration", () => {
    const layout = hierarchyLayout(def([{ id: "A" }, { id: "B" }, { id: "C", subClassOf: "B" }]))
    expect(layout.at.get("A")![1]).toBe(0)
    expect(layout.at.get("B")![1]).toBe(0)
    expect(layout.at.get("A")![0]).toBeLessThan(layout.at.get("B")![0])
    expect(layout.columns).toBe(2)
  })

  it("places every class exactly once, in a unit box", () => {
    const layout = hierarchyLayout(def([{ id: "A" }, { id: "B", subClassOf: "A" }, { id: "C", subClassOf: "A" }, { id: "D", subClassOf: "C" }, { id: "E" }]))
    expect(layout.at.size).toBe(5)
    for (const [x, y] of layout.at.values()) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(1)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(1)
    }
  })

  it("puts a single class in the middle", () => {
    const layout = hierarchyLayout(def([{ id: "A" }]))
    expect(layout.at.get("A")).toEqual([0.5, 0])
    expect(layout.rows).toBe(1)
    expect(layout.columns).toBe(1)
  })
})
