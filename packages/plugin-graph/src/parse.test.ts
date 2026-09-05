import { describe, expect, it } from "vitest"
import { parseGraph } from "./parse"

const ok = (raw: unknown, options?: Parameters<typeof parseGraph>[1]) => {
  const result = parseGraph(JSON.stringify(raw), options)
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}
const fail = (raw: unknown, options?: Parameters<typeof parseGraph>[1]) => {
  const result = parseGraph(typeof raw === "string" ? raw : JSON.stringify(raw), options)
  if (result.ok) throw new Error("expected the definition to be refused")
  return result.error
}

const COMPANY = {
  classes: [
    { id: "Agent", name: "主体" },
    { id: "Person", name: "人", subClassOf: "Agent", color: "#2563eb" },
    { id: "Organization", name: "组织", subClassOf: "Agent" },
  ],
  properties: [{ id: "worksAt", name: "任职于", domain: "Person", range: "Organization" }],
  entities: [
    { id: "alice", name: "Alice", type: "Person", attrs: { born: 1990, remote: true, city: "Wien" } },
    { id: "acme", name: "Acme", type: "Organization" },
  ],
  relations: [{ from: "alice", to: "acme", type: "worksAt" }],
  caption: "who works where",
}

describe("parseGraph", () => {
  it("accepts a graph with both layers and fills the defaults", () => {
    const def = ok(COMPANY)
    expect(def.classes.map((c) => c.id)).toEqual(["Agent", "Person", "Organization"])
    expect(def.properties[0]).toMatchObject({ id: "worksAt", domain: "Person", range: "Organization" })
    expect(def.entities[0].attrs).toEqual({ born: 1990, remote: true, city: "Wien" })
    expect(def.relations[0]).toEqual({ from: "alice", to: "acme", type: "worksAt" })
    expect(def.view).toBe("2d")
    expect(def.layer).toBe("instances")
    expect(def.rotate).toBe(true)
    expect(def.caption).toBe("who works where")
  })

  it("accepts a plain entity graph with no ontology at all", () => {
    const def = ok({ entities: [{ id: "a", name: "A" }, { id: "b", name: "B" }], relations: [{ from: "a", to: "b" }] })
    expect(def.classes).toEqual([])
    expect(def.properties).toEqual([])
    expect(def.relations[0].type).toBeUndefined()
  })

  it("accepts a pure ontology with no instances", () => {
    const def = ok({ classes: [{ id: "A", name: "A" }, { id: "B", name: "B", subClassOf: "A" }] })
    expect(def.entities).toEqual([])
    expect(def.layer).toBe("ontology")
  })

  it("refuses a graph with nothing to draw", () => {
    expect(fail({}).message).toContain("classes or entities")
    expect(fail({ entities: [], classes: [] }).message).toContain("classes or entities")
  })

  it("names an unknown field at every level", () => {
    expect(fail({ ...COMPANY, nodes: [] }).message).toContain("nodes is not a field")
    expect(fail({ entities: [{ id: "a", name: "A", label: "x" }] }).message).toContain("entities[0].label is not a field")
    expect(fail({ classes: [{ id: "A", name: "A", parent: "B" }] }).message).toContain("classes[0].parent is not a field")
    expect(fail({ classes: [{ id: "A", name: "A" }], properties: [{ id: "p", name: "p", inverse: "q" }] }).message).toContain("properties[0].inverse")
    expect(fail({ entities: [{ id: "a", name: "A" }], relations: [{ from: "a", to: "a", weight: 1 }] }).message).toContain("relations[0].weight")
  })

  it("requires short ids and names", () => {
    expect(fail({ entities: [{ name: "A" }] }).message).toContain("entities[0].id")
    expect(fail({ entities: [{ id: "", name: "A" }] }).message).toContain("entities[0].id")
    expect(fail({ entities: [{ id: "x".repeat(65), name: "A" }] }).message).toContain("entities[0].id")
    expect(fail({ entities: [{ id: "a", name: "x".repeat(81) }] }).message).toContain("entities[0].name")
    expect(fail({ classes: [{ id: "A", name: "A", description: "x".repeat(401) }] }).message).toContain("classes[0].description")
  })

  it("uses the id as the name when none is given", () => {
    const def = ok({ entities: [{ id: "alice" }], classes: [{ id: "Person" }] })
    expect(def.entities[0].name).toBe("alice")
    expect(def.classes[0].name).toBe("Person")
  })

  it("refuses an id used twice within a list", () => {
    expect(fail({ entities: [{ id: "a", name: "A" }, { id: "a", name: "B" }] }).message).toContain("entities[1].id a is used twice")
    expect(fail({ classes: [{ id: "A" }, { id: "A" }] }).message).toContain("classes[1].id A is used twice")
    expect(fail({ classes: [{ id: "A" }], properties: [{ id: "p" }, { id: "p" }] }).message).toContain("properties[1].id p is used twice")
  })

  it("refuses a relation whose end is not an entity", () => {
    expect(fail({ entities: [{ id: "a" }], relations: [{ from: "a", to: "ghost" }] }).message).toContain("relations[0].to refers to ghost")
    expect(fail({ entities: [{ id: "a" }], relations: [{ from: "ghost", to: "a" }] }).message).toContain("relations[0].from refers to ghost")
  })

  it("declares a class implicitly when an entity names one that was never declared", () => {
    const def = ok({ entities: [{ id: "a", type: "Person" }] })
    expect(def.classes).toEqual([{ id: "Person", name: "Person", implicit: true }])
  })

  it("declares a property implicitly when a relation names one that was never declared", () => {
    const def = ok({ entities: [{ id: "a" }, { id: "b" }], relations: [{ from: "a", to: "b", type: "knows" }] })
    expect(def.properties).toEqual([{ id: "knows", name: "knows", implicit: true }])
  })

  it("declares the classes subClassOf, domain and range point at, in order of appearance", () => {
    const def = ok({
      classes: [{ id: "Dog", subClassOf: "Animal" }],
      properties: [{ id: "eats", domain: "Animal", range: "Food" }],
    })
    expect(def.classes.map((c) => [c.id, c.implicit ?? false])).toEqual([
      ["Dog", false],
      ["Animal", true],
      ["Food", true],
    ])
  })

  it("refuses a subClassOf cycle", () => {
    expect(fail({ classes: [{ id: "A", subClassOf: "B" }, { id: "B", subClassOf: "A" }] }).message).toContain("cycle")
    expect(fail({ classes: [{ id: "A", subClassOf: "A" }] }).message).toContain("cycle")
  })

  it("validates view, layer and rotate", () => {
    expect(ok({ ...COMPANY, view: "3d" }).view).toBe("3d")
    expect(fail({ ...COMPANY, view: "iso" }).message).toContain("view must be")
    expect(ok({ ...COMPANY, layer: "ontology" }).layer).toBe("ontology")
    expect(fail({ ...COMPANY, layer: "schema" }).message).toContain("layer must be")
    expect(ok({ ...COMPANY, rotate: false }).rotate).toBe(false)
    expect(fail({ ...COMPANY, rotate: "no" }).message).toContain("rotate must be")
  })

  it("keeps a focus that names an entity or a class and drops one that names nothing", () => {
    expect(ok({ ...COMPANY, focus: "alice" }).focus).toBe("alice")
    expect(ok({ ...COMPANY, focus: "Person" }).focus).toBe("Person")
    expect(ok({ ...COMPANY, focus: "nobody" }).focus).toBeUndefined()
    expect(fail({ ...COMPANY, focus: 3 }).message).toContain("focus must be")
  })

  it("accepts flat attrs of primitives and refuses anything else", () => {
    expect(fail({ entities: [{ id: "a", attrs: { nested: { x: 1 } } }] }).message).toContain("entities[0].attrs.nested")
    expect(fail({ entities: [{ id: "a", attrs: [1] }] }).message).toContain("entities[0].attrs must be an object")
    expect(fail({ entities: [{ id: "a", attrs: { long: "x".repeat(201) } }] }).message).toContain("entities[0].attrs.long")
    const many = Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`k${i}`, i]))
    expect(fail({ entities: [{ id: "a", attrs: many }] }).message).toContain("entities[0].attrs has more than 32")
  })

  it("accepts a numeric value on an entity", () => {
    expect(ok({ entities: [{ id: "a", value: 3 }] }).entities[0].value).toBe(3)
    expect(fail({ entities: [{ id: "a", value: -1 }] }).message).toContain("entities[0].value")
  })

  it("only takes hex colours", () => {
    expect(ok({ classes: [{ id: "A", color: "#ABC" }] }).classes[0].color).toBe("#abc")
    expect(fail({ classes: [{ id: "A", color: "blue" }] }).message).toContain("classes[0].color")
  })

  it("stops at the limits and says which", () => {
    expect(fail({ entities: [{ id: "a" }, { id: "b" }, { id: "c" }] }, { maxEntities: 2 }).message).toContain("entities has more than 2")
    expect(fail({ entities: [{ id: "a" }], relations: [{ from: "a", to: "a" }, { from: "a", to: "a" }] }, { maxRelations: 1 }).message).toContain("relations has more than 1")
    expect(fail({ classes: [{ id: "A" }, { id: "B" }] }, { maxClasses: 1 }).message).toContain("classes has more than 1")
    expect(fail({ classes: [{ id: "A" }], properties: [{ id: "p" }, { id: "q" }] }, { maxProperties: 1 }).message).toContain("properties has more than 1")
    expect(fail(JSON.stringify(COMPANY), { maxSourceBytes: 32 }).code).toBe("too-large")
  })

  it("refuses what is not JSON, or not an object", () => {
    expect(fail("{").code).toBe("invalid-json")
    expect(fail([1]).message).toContain("must be a JSON object")
  })
})
