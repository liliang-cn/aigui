import { describe, expect, it } from "vitest"
import { ancestors, checkRelations, classColour, instanceGraph, isSubClassOf, ontologyGraph, propertyColour } from "./ontology"
import { palette } from "./palette"
import { parseGraph } from "./parse"
import type { GraphDefinition } from "./types"

const def = (raw: unknown): GraphDefinition => {
  const parsed = parseGraph(JSON.stringify(raw))
  if (!parsed.ok) throw new Error(parsed.error.message)
  return parsed.value
}

const ZOO = def({
  classes: [
    { id: "Animal", color: "#111111" },
    { id: "Mammal", subClassOf: "Animal" },
    { id: "Dog", subClassOf: "Mammal" },
    { id: "Food", color: "#22cc22" },
    { id: "Place" },
  ],
  properties: [
    { id: "eats", domain: "Animal", range: "Food" },
    { id: "livesIn", domain: "Animal", range: "Place" },
    { id: "near" },
  ],
  entities: [
    { id: "rex", type: "Dog" },
    { id: "bone", type: "Food" },
    { id: "wien", type: "Place" },
    { id: "rock" },
  ],
  relations: [
    { from: "rex", to: "bone", type: "eats" }, // fine: Dog ⊂ Animal
    { from: "bone", to: "rex", type: "eats" }, // domain and range both wrong
    { from: "rex", to: "wien", type: "livesIn" }, // fine
    { from: "rock", to: "wien", type: "livesIn" }, // untyped subject
    { from: "rex", to: "rock", type: "near" }, // unconstrained
    { from: "rex", to: "rex", type: "ghost" }, // implicit property
    { from: "wien", to: "rock" }, // untyped relation
  ],
})

describe("the class hierarchy", () => {
  it("lists ancestors nearest first", () => {
    expect(ancestors(ZOO, "Dog")).toEqual(["Mammal", "Animal"])
    expect(ancestors(ZOO, "Animal")).toEqual([])
    expect(ancestors(ZOO, "nothing")).toEqual([])
  })
  it("treats subClassOf as reflexive and transitive", () => {
    expect(isSubClassOf(ZOO, "Dog", "Dog")).toBe(true)
    expect(isSubClassOf(ZOO, "Dog", "Animal")).toBe(true)
    expect(isSubClassOf(ZOO, "Animal", "Dog")).toBe(false)
    expect(isSubClassOf(ZOO, "Food", "Animal")).toBe(false)
  })
})

describe("colours", () => {
  const c = palette("light")
  it("inherits an explicit colour down the chain", () => {
    expect(classColour(ZOO, "Dog", c)).toBe("#111111")
    expect(classColour(ZOO, "Food", c)).toBe("#22cc22")
  })
  it("hashes a class with no colour anywhere above it, the same way every time", () => {
    const colour = classColour(ZOO, "Place", c)
    expect(c.series).toContain(colour)
    expect(classColour(ZOO, "Place", c)).toBe(colour)
  })
  it("gives an untyped entity the muted colour", () => {
    expect(classColour(ZOO, undefined, c)).toBe(c.muted)
  })
  it("colours properties the same way, from their own colour or a hash", () => {
    expect(propertyColour(def({ classes: [{ id: "A" }], properties: [{ id: "p", color: "#abcdef" }] }), "p", c)).toBe("#abcdef")
    expect(c.series).toContain(propertyColour(ZOO, "eats", c))
    expect(propertyColour(ZOO, undefined, c)).toBe(c.edge)
  })
})

describe("checkRelations", () => {
  const violations = checkRelations(ZOO)
  it("passes a relation whose ends are subclasses of the domain and range", () => {
    expect(violations.filter((v) => v.relation === 0)).toEqual([])
    expect(violations.filter((v) => v.relation === 2)).toEqual([])
  })
  it("reports both sides when both are wrong", () => {
    expect(violations.filter((v) => v.relation === 1)).toEqual([
      { relation: 1, side: "domain", expected: "Animal", actual: "Food" },
      { relation: 1, side: "range", expected: "Food", actual: "Dog" },
    ])
  })
  it("fails an untyped entity against a constrained property", () => {
    expect(violations.filter((v) => v.relation === 3)).toEqual([{ relation: 3, side: "domain", expected: "Animal", actual: undefined }])
  })
  it("never fails an unconstrained, implicit or untyped relation", () => {
    expect(violations.filter((v) => v.relation >= 4)).toEqual([])
  })
})

describe("the two layers as graphs to lay out", () => {
  it("draws every class once and links subClassOf plus every property", () => {
    const graph = ontologyGraph(ZOO)
    expect(graph.nodes.map((n) => n.id)).toEqual(["Animal", "Mammal", "Dog", "Food", "Place"])
    expect(graph.links).toEqual([
      { from: "Mammal", to: "Animal", type: "subClassOf" },
      { from: "Dog", to: "Mammal", type: "subClassOf" },
      { from: "Animal", to: "Food", type: "eats" },
      { from: "Animal", to: "Place", type: "livesIn" },
    ])
  })
  it("draws every entity once and every relation", () => {
    const graph = instanceGraph(ZOO)
    expect(graph.nodes.map((n) => n.id)).toEqual(["rex", "bone", "wien", "rock"])
    expect(graph.links).toHaveLength(7)
    expect(graph.links[6]).toEqual({ from: "wien", to: "rock", type: undefined })
  })
})
