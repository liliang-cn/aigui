import { describe, expect, it } from "vitest"
import { chartCrowding } from "./crowding"

describe("chartCrowding", () => {
  it("names an axis with more labels than room, a pie of slivers, and nothing about a chart that fits", () => {
    const many = Array.from({ length: 40 }, (_, i) => `c${i}`)
    expect(chartCrowding({ xAxis: { type: "category", data: many }, series: [{ type: "bar", data: [] }] }, 400, 300)).toMatch(/^40 categories on a 400px axis/)
    expect(chartCrowding({ yAxis: { type: "category", data: many }, series: [] }, 900, 300)).toMatch(/^40 categories on a 300px axis/)
    expect(chartCrowding({ series: [{ type: "pie", data: many.slice(0, 14) }] }, 600, 400)).toMatch(/pie of 14 slices/)
    expect(chartCrowding({ xAxis: { type: "category", data: ["A", "B", "C"] }, series: [{ type: "bar", data: [1, 2, 3] }] }, 600, 400)).toBeUndefined()
  })
})
