import { readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { length, sectionPolygon, sub } from "./geometry"
import { parseSolid } from "./parse"

/**
 * The figures a model actually produced, kept as fixtures.
 *
 * These are not invented inputs: they are the 19 blocks `gemini-3.6-flash-high` wrote when given
 * this plugin's own prompt spec and twenty textbook questions, one conversation each. A protocol
 * change that these stop parsing is a protocol change that breaks answers already being written.
 */
const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures")
const fixtures = readdirSync(dir).filter((name) => name.endsWith(".json")).sort()

describe("the model's own figures", () => {
  it("has the whole probe run to check against", () => {
    expect(fixtures.length).toBe(19)
  })
  it.each(fixtures)("%s parses and resolves", (name) => {
    const result = parseSolid(readFileSync(join(dir, name), "utf8"))
    if (!result.ok) throw new Error(`${name}: ${result.error.message}`)
    expect(result.value.figure.points.size).toBeGreaterThan(0)
  })
  it.each(fixtures)("%s draws every point it names", (name) => {
    const result = parseSolid(readFileSync(join(dir, name), "utf8"))
    if (!result.ok) throw new Error(result.error.message)
    const { definition, figure } = result.value
    for (const segment of definition.segments ?? []) {
      expect(figure.points.get(segment.from), `${name} ${segment.from}`).toBeDefined()
      expect(figure.points.get(segment.to), `${name} ${segment.to}`).toBeDefined()
    }
  })
  it.each(fixtures)("%s produces a closed section when it asks for one", (name) => {
    const result = parseSolid(readFileSync(join(dir, name), "utf8"))
    if (!result.ok) throw new Error(result.error.message)
    const { definition, figure } = result.value
    if (!definition.section) return
    const loop = sectionPolygon(figure, definition.section.through)
    expect(loop.length, `${name} section`).toBeGreaterThanOrEqual(3)
  })
})

describe("the answers whose geometry can be checked against a known result", () => {
  const load = (name: string) => {
    const result = parseSolid(readFileSync(join(dir, name), "utf8"))
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }

  it("01: plane AB1D1 cuts an equilateral triangle of side 2√2", () => {
    const { definition, figure } = load("01.json")
    const loop = sectionPolygon(figure, definition.section!.through)
    expect(loop).toHaveLength(3)
    for (let i = 0; i < 3; i++) expect(length(sub(loop[(i + 1) % 3], loop[i]))).toBeCloseTo(2 * Math.SQRT2)
  })
  it("02: plane D1EF through two base midpoints cuts a pentagon", () => {
    // The model was asked only for D1, E and F. How many sides that makes is exactly what a student
    // gets wrong — and what the model would have got wrong had it been asked.
    const { definition, figure } = load("02.json")
    expect(sectionPolygon(figure, definition.section!.through)).toHaveLength(5)
  })
  it("05: the body diagonal of a cube of edge 2 is 2√3", () => {
    const { definition, figure } = load("05.json")
    const [diagonal] = definition.segments!
    expect(length(sub(figure.points.get(diagonal.to)!, figure.points.get(diagonal.from)!))).toBeCloseTo(2 * Math.sqrt(3))
  })
  it("07: the body diagonal of a 4×3×2 cuboid is √29", () => {
    const { definition, figure } = load("07.json")
    const [diagonal] = definition.segments!
    expect(length(sub(figure.points.get(diagonal.to)!, figure.points.get(diagonal.from)!))).toBeCloseTo(Math.sqrt(29))
  })
  it("08: apexOver puts PA on the vertical, so PA ⊥ the base really holds", () => {
    const { figure } = load("08.json")
    const p = figure.points.get("P")!
    const a = figure.points.get("A")!
    expect(p.x).toBeCloseTo(a.x)
    expect(p.z).toBeCloseTo(a.z)
  })
  it("12: the cone's axial section is an isosceles triangle over a diameter", () => {
    const { figure } = load("12.json")
    expect(length(sub(figure.points.get("B")!, figure.points.get("A")!))).toBeCloseTo(4)
    const pa = length(sub(figure.points.get("A")!, figure.points.get("P")!))
    const pb = length(sub(figure.points.get("B")!, figure.points.get("P")!))
    expect(pa).toBeCloseTo(pb)
  })
  it("16: the shortest surface path crosses BB1 at its midpoint", () => {
    // Checked by unfolding: on a cube of edge 2 the straight line of the 4×2 net meets the shared
    // edge halfway up. The model put it there; the figure agrees.
    const { figure } = load("16.json")
    const m = figure.points.get("M")!
    const b = figure.points.get("B")!
    const b1 = figure.points.get("B1")!
    expect(m.y).toBeCloseTo((b.y + b1.y) / 2)
    const total = length(sub(m, figure.points.get("A")!)) + length(sub(figure.points.get("C1")!, m))
    expect(total).toBeCloseTo(2 * Math.sqrt(5))
  })
})
