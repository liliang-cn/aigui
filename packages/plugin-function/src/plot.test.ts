import { describe, expect, it } from "vitest"
import { parseExpression } from "./expr"
import { autoView, compileCurves, derivativeCurve, polylines, riemann, sample, tangent } from "./plot"
import type { Curve } from "./plot"

const curve = (expr: string, domain: [number, number] = [-3, 3]): Curve => ({
  id: "f",
  fn: parseExpression(expr),
  domain,
})

describe("sample", () => {
  it("covers the domain end to end", () => {
    const points = sample(curve("x", [0, 1]), 10)
    expect(points).toHaveLength(11)
    expect(points[0]).toMatchObject({ x: 0 })
    expect(points[10]).toMatchObject({ x: 1 })
  })
  it("leaves a gap where the function has no finite value", () => {
    const points = sample(curve("sqrt(x)", [-1, 1]), 10)
    expect(points.slice(0, 5).every((point) => point === null)).toBe(true)
    expect(points.at(-1)).toMatchObject({ y: 1 })
  })
})

describe("polylines", () => {
  it("breaks the line at a pole instead of drawing through it", () => {
    // 1/x is finite either side of zero. Joined up, the figure grows a vertical line that reads as
    // part of the graph.
    const lines = polylines(sample(curve("1/x", [-2, 2]), 200), { x: [-2, 2], y: [-5, 5] })
    expect(lines.length).toBeGreaterThanOrEqual(2)
    for (const line of lines) {
      const signs = new Set(line.map((point) => Math.sign(point.y)))
      expect(signs.size).toBe(1)
    }
  })
  it("keeps a continuous curve in one piece", () => {
    expect(polylines(sample(curve("x^2"), 100), { x: [-3, 3], y: [0, 9] })).toHaveLength(1)
  })
})

describe("autoView", () => {
  it("frames a curve without being dragged out by a pole", () => {
    // A naive min/max over 1/x near zero gives a y range of millions, flattening the curve to a
    // horizontal line at the axis.
    const view = autoView([curve("1/x", [-3, 3])], { plot: [] }, 200)
    expect(view.y[1] - view.y[0]).toBeLessThan(40)
  })
  it("uses the range the definition gives", () => {
    const view = autoView([curve("x^2")], { plot: [], view: { x: [-1, 1], y: [-2, 2] } }, 100)
    expect(view).toEqual({ x: [-1, 1], y: [-2, 2] })
  })
  it("reads an interval written as a constant expression", () => {
    const view = autoView([curve("sin(x)", [0, 2 * Math.PI])], { plot: [], view: { x: [0, "2*pi"] } }, 100)
    expect(view.x[1]).toBeCloseTo(2 * Math.PI)
  })
})

describe("tangent", () => {
  it("measures the slope rather than taking it from the model", () => {
    const line = tangent(curve("x^2"), 1, { x: [-3, 3], y: [-2, 9] })!
    expect(line.slope).toBeCloseTo(2, 5)
    expect(line.y0).toBe(1)
    // The line really passes through the point of tangency.
    const atX = (x: number) => line.from.y + ((line.to.y - line.from.y) / (line.to.x - line.from.x)) * (x - line.from.x)
    expect(atX(1)).toBeCloseTo(1, 6)
  })
  it("gives nothing where the curve has no value", () => {
    expect(tangent(curve("sqrt(x)", [0, 4]), -1, { x: [-1, 4], y: [0, 2] })).toBeUndefined()
  })
})

describe("riemann", () => {
  it("sums to the textbook value for a left rule", () => {
    // ∫₀¹x² = 1/3, and 8 left rectangles under an increasing curve must undershoot it.
    const { rects, total } = riemann(curve("x^2", [0, 1]), 0, 1, 8, "left")
    expect(rects).toHaveLength(8)
    expect(total).toBeLessThan(1 / 3)
    expect(total).toBeCloseTo(0.2734, 3)
  })
  it("overshoots with a right rule and lands closest with the midpoint", () => {
    const left = riemann(curve("x^2", [0, 1]), 0, 1, 8, "left").total
    const right = riemann(curve("x^2", [0, 1]), 0, 1, 8, "right").total
    const mid = riemann(curve("x^2", [0, 1]), 0, 1, 8, "mid").total
    expect(right).toBeGreaterThan(1 / 3)
    expect(Math.abs(mid - 1 / 3)).toBeLessThan(Math.abs(left - 1 / 3))
  })
  it("converges as the rectangles get thinner", () => {
    expect(riemann(curve("x^2", [0, 1]), 0, 1, 200, "left").total).toBeCloseTo(1 / 3, 2)
  })
})

describe("derivativeCurve", () => {
  it("is the derivative, sampled the same way the curve is", () => {
    const d = derivativeCurve(curve("sin(x)", [0, Math.PI]))
    expect(d.fn(0)).toBeCloseTo(1, 4)
    expect(d.fn(Math.PI / 2)).toBeCloseTo(0, 4)
    expect(d.domain).toEqual([0, Math.PI])
  })
})

describe("compileCurves", () => {
  it("falls back to the view's x range when a curve gives no domain", () => {
    const curves = compileCurves({ plot: [{ id: "f", expr: "x" }] }, [-2, 5])
    expect(curves[0].domain).toEqual([-2, 5])
  })
})
