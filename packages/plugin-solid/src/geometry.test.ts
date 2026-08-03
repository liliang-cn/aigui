import { describe, expect, it } from "vitest"
import { buildFigure, length, resolvePoints, sectionPolygon, sub } from "./geometry"
import type { SolidDefinition } from "./types"

const cube = (extra: Partial<SolidDefinition> = {}): SolidDefinition => ({
  solid: "cube",
  label: "ABCD-A1B1C1D1",
  edge: 2,
  ...extra,
})

const distance = (figure: ReturnType<typeof buildFigure>, a: string, b: string): number =>
  length(sub(figure.points.get(a)!, figure.points.get(b)!))

describe("buildFigure", () => {
  it("places a cube's eight vertices with A1 directly above A", () => {
    const figure = buildFigure(cube())
    expect([...figure.points.keys()]).toEqual(["A", "B", "C", "D", "A1", "B1", "C1", "D1"])
    const a = figure.points.get("A")!
    const a1 = figure.points.get("A1")!
    expect(a1.x).toBeCloseTo(a.x)
    expect(a1.z).toBeCloseTo(a.z)
    expect(a1.y - a.y).toBeCloseTo(2)
  })
  it("gets a cube's edges, face diagonals and body diagonal right", () => {
    const figure = buildFigure(cube())
    expect(distance(figure, "A", "B")).toBeCloseTo(2)
    expect(distance(figure, "A", "C")).toBeCloseTo(2 * Math.SQRT2)
    expect(distance(figure, "A", "C1")).toBeCloseTo(2 * Math.sqrt(3))
    expect(figure.edges).toHaveLength(12)
    expect(figure.faces).toHaveLength(6)
  })
  it("sizes a cuboid by length, width and height", () => {
    const figure = buildFigure({ solid: "cuboid", label: "ABCD-A1B1C1D1", size: [4, 3, 2] })
    // The classic check: the body diagonal of a 4×3×2 box is √29.
    expect(distance(figure, "A", "C1")).toBeCloseTo(Math.sqrt(29))
  })
  it("derives a prism's circumradius from the edge length a question actually gives", () => {
    const figure = buildFigure({ solid: "prism", label: "ABC-A1B1C1", base: 3, edge: 2, height: 3 })
    expect(distance(figure, "A", "B")).toBeCloseTo(2)
    expect(distance(figure, "B", "C")).toBeCloseTo(2)
    expect(distance(figure, "A", "A1")).toBeCloseTo(3)
  })
  it("stands a pyramid's apex over the centre by default", () => {
    const figure = buildFigure({ solid: "pyramid", label: "P-ABCD", base: 4, edge: 2, height: 3 })
    const p = figure.points.get("P")!
    expect(p.x).toBeCloseTo(0)
    expect(p.z).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(3)
    // A regular pyramid: every lateral edge is the same length.
    const lengths = ["A", "B", "C", "D"].map((name) => distance(figure, "P", name))
    for (const l of lengths) expect(l).toBeCloseTo(lengths[0])
  })
  it("stands it over one vertex when asked, which is what makes PA ⊥ 底面 drawable", () => {
    const figure = buildFigure({ solid: "pyramid", label: "P-ABC", base: 3, edge: 2, height: 3, apexOver: "A" })
    const p = figure.points.get("P")!
    const a = figure.points.get("A")!
    expect(p.x).toBeCloseTo(a.x)
    expect(p.z).toBeCloseTo(a.z)
    // PA is now vertical, so it really is perpendicular to the base — and it is the height.
    expect(distance(figure, "P", "A")).toBeCloseTo(3)
  })
})

describe("resolvePoints", () => {
  it("puts a point along a segment at the ratio given, measured from the first letter", () => {
    const figure = buildFigure(cube())
    resolvePoints(figure, [{ id: "M", on: "AB", at: 0.25 }])
    expect(distance(figure, "A", "M")).toBeCloseTo(0.5)
    expect(distance(figure, "M", "B")).toBeCloseTo(1.5)
  })
  it("finds a face centre", () => {
    const figure = buildFigure(cube())
    resolvePoints(figure, [{ id: "O", center: "ABCD" }])
    const o = figure.points.get("O")!
    expect(o.y).toBeCloseTo(0)
    expect(distance(figure, "O", "A")).toBeCloseTo(Math.SQRT2)
  })
  it("drops a perpendicular onto a face", () => {
    const figure = buildFigure({ solid: "pyramid", label: "P-ABC", base: 3, edge: 2, height: 3 })
    resolvePoints(figure, [{ id: "H", foot: { from: "P", to: "ABC" } }])
    expect(figure.points.get("H")!.y).toBeCloseTo(0)
    expect(distance(figure, "P", "H")).toBeCloseTo(3)
  })
  it("places a point on a cone's base circle", () => {
    const figure = buildFigure({ solid: "cone", label: "P-O", radius: 2, height: 4 })
    resolvePoints(figure, [
      { id: "A", onCircle: "base", angle: 0 },
      { id: "B", onCircle: "base", angle: 180 },
    ])
    expect(distance(figure, "A", "B")).toBeCloseTo(4)
    expect(distance(figure, "O", "A")).toBeCloseTo(2)
  })
  it("resolves a point defined against one introduced just before it", () => {
    const figure = buildFigure(cube())
    const { missing } = resolvePoints(figure, [
      { id: "M", on: "A1C1", at: 0.5 },
      { id: "N", on: "BM", at: 0.5 },
    ])
    expect(missing).toEqual([])
    expect(figure.points.has("N")).toBe(true)
  })
  it("reports a point it cannot place instead of guessing one", () => {
    const figure = buildFigure(cube())
    const { missing } = resolvePoints(figure, [{ id: "M", on: "AZ", at: 0.5 }])
    expect(missing).toEqual(["M"])
    expect(figure.points.has("M")).toBe(false)
  })
})

describe("sectionPolygon", () => {
  it("cuts a triangle through three vertices", () => {
    const figure = buildFigure(cube())
    const loop = sectionPolygon(figure, ["A", "B1", "D1"])
    expect(loop).toHaveLength(3)
    // The classic result: plane AB1D1 cuts an equilateral triangle of side 2√2.
    const sides = loop.map((p, i) => length(sub(loop[(i + 1) % loop.length], p)))
    for (const side of sides) expect(side).toBeCloseTo(2 * Math.SQRT2)
  })
  it("cuts a regular hexagon through six edge midpoints", () => {
    // The section every textbook asks about and the one a model most often miscounts: the plane
    // through three alternating edge midpoints meets six faces, not three.
    const figure = buildFigure(cube())
    resolvePoints(figure, [
      { id: "M", on: "AB", at: 0.5 },
      { id: "N", on: "BC", at: 0.5 },
      { id: "K", on: "CC1", at: 0.5 },
    ])
    const loop = sectionPolygon(figure, ["M", "N", "K"])
    expect(loop).toHaveLength(6)
    const sides = loop.map((p, i) => length(sub(loop[(i + 1) % loop.length], p)))
    for (const side of sides) expect(side).toBeCloseTo(Math.SQRT2)
  })
  it("cuts a quadrilateral where the plane is parallel to a pair of edges", () => {
    const figure = buildFigure(cube())
    const loop = sectionPolygon(figure, ["A", "B", "C1"])
    expect(loop).toHaveLength(4)
  })
  it("returns nothing for three points that do not define a plane", () => {
    const figure = buildFigure(cube())
    expect(sectionPolygon(figure, ["A", "B", "B"])).toEqual([])
  })
  it("returns nothing when a named point does not exist", () => {
    const figure = buildFigure(cube())
    expect(sectionPolygon(figure, ["A", "B1", "Z"])).toEqual([])
  })
})
