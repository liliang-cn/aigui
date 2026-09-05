import { describe, expect, it } from "vitest"
import { palette } from "./palette"
import { parseGraph } from "./parse"
import { renderGraphSVG } from "./render2d"
import type { GraphDefinition, GraphLayer } from "./types"

const def = (raw: unknown): GraphDefinition => {
  const parsed = parseGraph(JSON.stringify(raw))
  if (!parsed.ok) throw new Error(parsed.error.message)
  return parsed.value
}
const draw = (d: GraphDefinition, layer: GraphLayer = d.layer, labelBudget = 20) => renderGraphSVG(d, layer, palette("light"), { width: 600, height: 400, labelBudget })
const count = (svg: string, pattern: RegExp) => (svg.match(pattern) ?? []).length

const ZOO = def({
  classes: [{ id: "Animal", color: "#111111" }, { id: "Dog", subClassOf: "Animal" }, { id: "Food" }],
  properties: [{ id: "eats", domain: "Animal", range: "Food" }],
  entities: [{ id: "rex", name: "Rex <b>", type: "Dog", attrs: { age: 3 } }, { id: "bone", name: "Bone", type: "Food" }, { id: "rock" }],
  relations: [{ from: "rex", to: "bone", type: "eats" }, { from: "bone", to: "rex", type: "eats" }, { from: "rock", to: "rex" }],
  focus: "rock",
})

describe("renderGraphSVG — instances", () => {
  const { svg, width, height } = draw(ZOO)
  it("draws one node per entity and one edge per relation", () => {
    expect(count(svg, /data-graph-node="/g)).toBe(3)
    expect(count(svg, /data-graph-edge="/g)).toBe(3)
    expect(width).toBe(600)
    expect(height).toBe(400)
  })
  it("colours a node by its class, inherited, and an untyped one muted", () => {
    expect(svg).toMatch(/data-graph-node="rex"[^>]*fill="#111111"/)
    expect(svg).toMatch(/data-graph-node="rock"[^>]*fill="#94a3b8"/)
  })
  it("marks the relation that breaks the ontology red and dashed", () => {
    expect(svg).toMatch(/data-graph-edge="1"[^>]*data-violation=""/)
    expect(svg).toMatch(/data-graph-edge="1"[^>]*stroke-dasharray/)
    expect(svg).not.toMatch(/data-graph-edge="0"[^>]*data-violation/)
  })
  it("labels the focused entity and rings it", () => {
    expect(svg).toMatch(/data-graph-focus="rock"/)
    expect(svg).toContain(">rock</text>")
  })
  it("escapes every name it writes", () => {
    expect(svg).toContain("Rex &lt;b&gt;")
    expect(svg).not.toContain("<b>")
  })
  it("draws an arrowhead so the direction can be read", () => {
    expect(svg).toContain("<marker")
    expect(svg).toMatch(/data-graph-edge="0"[^>]*marker-end/)
  })
  it("lists the classes present in a legend", () => {
    expect(svg).toMatch(/data-graph-legend/)
    expect(svg).toContain(">Dog</text>")
    expect(svg).toContain(">Food</text>")
    expect(svg).not.toContain(">Animal</text>")
  })
})

describe("renderGraphSVG — label budget", () => {
  it("writes at most the budget of labels, plus the focus", () => {
    const many = def({
      entities: Array.from({ length: 30 }, (_, i) => ({ id: `e${i}`, name: `Entity${i}` })),
      relations: Array.from({ length: 29 }, (_, i) => ({ from: "e0", to: `e${i + 1}` })),
      focus: "e29",
    })
    const { svg } = draw(many, "instances", 5)
    expect(count(svg, /data-graph-label="/g)).toBeLessThanOrEqual(6)
    expect(svg).toContain(">Entity0</text>") // highest degree
    expect(svg).toContain(">Entity29</text>") // the focus
  })
})

describe("renderGraphSVG — ontology", () => {
  const { svg } = draw(ZOO, "ontology")
  it("draws a box per class and the subClassOf and property edges", () => {
    expect(count(svg, /data-graph-class="/g)).toBe(3)
    expect(count(svg, /data-edge-type="subClassOf"/g)).toBe(1)
    expect(count(svg, /data-edge-type="eats"/g)).toBe(1)
    expect(svg).toContain(">eats</text>")
  })
  it("puts the root above its subclass", () => {
    const y = (id: string) => Number(svg.match(new RegExp(`data-graph-class="${id}"[^>]*\\sy="([-\\d.]+)"`))![1])
    expect(y("Animal")).toBeLessThan(y("Dog"))
  })
  it("legends the properties rather than the classes", () => {
    expect(svg).toMatch(/data-graph-legend/)
    expect(svg).toContain(">subClassOf</text>")
  })
})
