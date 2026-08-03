import { describe, expect, it } from "vitest"
import { parseSolid } from "./parse"

const parse = (value: unknown) => parseSolid(typeof value === "string" ? value : JSON.stringify(value))
const reason = (value: unknown): string => {
  const result = parse(value)
  if (result.ok) throw new Error("expected the definition to be rejected")
  return result.error.message
}

describe("parseSolid", () => {
  it("accepts the figure a question about plane AB1D1 produces", () => {
    const result = parse({
      solid: "cube",
      label: "ABCD-A1B1C1D1",
      edge: 2,
      section: { through: ["A", "B1", "D1"] },
      highlight: [{ plane: ["A", "B1", "D1"] }],
      caption: "平面 AB1D1 截正方体所得的截面",
    })
    expect(result.ok).toBe(true)
  })
  it("rejects source that is not JSON, and says so plainly", () => {
    const result = parseSolid("{ solid: cube }")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("invalid-json")
  })
  it("rejects a solid it does not know", () => {
    expect(reason({ solid: "torus", label: "T" })).toContain("solid must be one of")
  })
  it("requires the sizes each solid is described by", () => {
    expect(reason({ solid: "cube", label: "ABCD-A1B1C1D1" })).toContain("edge")
    expect(reason({ solid: "cuboid", label: "ABCD-A1B1C1D1", size: [4, 3] })).toContain("size")
    expect(reason({ solid: "cube", label: "ABCD-A1B1C1D1", edge: -1 })).toContain("edge")
  })
})

describe("the mistakes a model actually makes", () => {
  it("rejects highlight written as a bare object, and names the shape", () => {
    // Measured: with no worked example using `highlight`, nearly half the answers wrote it as an
    // object, because the field list showed a bare object. The message has to be actionable.
    const message = reason({ solid: "cube", label: "ABCD-A1B1C1D1", edge: 2, highlight: { line: ["A", "C1"] } })
    expect(message).toContain("highlight must be an array")
  })
  it("rejects a point that was never defined", () => {
    // The cone case: `{"plane": ["P", "A", "B"]}` is the right shape in every respect, and a cone
    // has no A or B until something puts them on its circle.
    const message = reason({
      solid: "cone",
      label: "P-O",
      radius: 2,
      height: 4,
      highlight: [{ plane: ["P", "A", "B"] }],
    })
    expect(message).toContain("refers to A")
  })
  it("accepts the same figure once the circle points are defined", () => {
    const result = parse({
      solid: "cone",
      label: "P-O",
      radius: 2,
      height: 4,
      points: [
        { id: "A", onCircle: "base", angle: 0 },
        { id: "B", onCircle: "base", angle: 180 },
      ],
      highlight: [{ plane: ["P", "A", "B"] }],
    })
    expect(result.ok).toBe(true)
  })
  it("rejects a section on a cone, where the curve is not a polygon", () => {
    const message = reason({
      solid: "cone",
      label: "P-O",
      radius: 2,
      height: 4,
      points: [{ id: "M", onCircle: "base", angle: 0 }],
      section: { through: ["P", "O", "M"] },
    })
    expect(message).toContain("polyhedra")
  })
  it("rejects a section that does not name exactly three points", () => {
    expect(reason({ solid: "cube", label: "ABCD-A1B1C1D1", edge: 2, section: { through: ["A", "B1"] } })).toContain("exactly three")
  })
  it("rejects coordinates smuggled in as an unknown field", () => {
    // Not by name — anything the protocol does not define is refused, which is what keeps a model's
    // own arithmetic out of the picture.
    expect(reason({ solid: "cube", label: "ABCD-A1B1C1D1", edge: 2, at: 0.5 }).length).toBeGreaterThan(0)
  })
  it("rejects a ratio outside the segment", () => {
    expect(reason({ solid: "cube", label: "ABCD-A1B1C1D1", edge: 2, points: [{ id: "M", on: "AB", at: 1.5 }] })).toContain("between 0 and 1")
  })
  it("rejects a point on a segment that does not exist", () => {
    expect(reason({ solid: "cube", label: "ABCD-A1B1C1D1", edge: 2, points: [{ id: "M", on: "AZ", at: 0.5 }] })).toContain("could not be placed")
  })
  it("refuses a fence larger than the limit before parsing it", () => {
    const result = parseSolid(JSON.stringify({ solid: "cube", label: "x".repeat(40_000) }), { maxSourceBytes: 1024 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("too-large")
  })
  it("caps how many points one figure may introduce", () => {
    const points = Array.from({ length: 30 }, (_, i) => ({ id: "M", on: "AB", at: i / 30 }))
    expect(reason({ solid: "cube", label: "ABCD-A1B1C1D1", edge: 2, points })).toContain("more than")
  })
})

describe("apexOver", () => {
  it("is accepted and puts PA on the vertical", () => {
    const result = parse({ solid: "pyramid", label: "P-ABC", base: 3, edge: 2, height: 3, apexOver: "A" })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const p = result.value.figure.points.get("P")!
      const a = result.value.figure.points.get("A")!
      expect(p.x).toBeCloseTo(a.x)
      expect(p.z).toBeCloseTo(a.z)
    }
  })
})
