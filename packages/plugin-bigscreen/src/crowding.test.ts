import { describe, expect, it } from "vitest"
import { crowding } from "./crowding"
import type { Panel } from "./types"

describe("crowding", () => {
  it("names a category axis with more labels than it has room for", () => {
    const panel: Panel = { kind: "chart", option: { xAxis: { type: "category", data: Array.from({ length: 30 }, (_, i) => `c${i}`) }, yAxis: { type: "value" }, series: [{ type: "bar", data: [] }] } }
    expect(crowding(panel, 400, 240)).toMatch(/^30 categories on a 400px axis/)
    expect(crowding(panel, 1400, 240)).toBeUndefined()
  })
  it("sends a pie of slivers to a rank panel", () => {
    const panel: Panel = { kind: "chart", option: { series: [{ type: "pie", data: Array.from({ length: 14 }, (_, i) => ({ name: `s${i}`, value: i + 1 })) }] } }
    expect(crowding(panel, 600, 300)).toMatch(/pie of 14 slices/)
  })
  it("calls a knowledge graph of dots in a card too dense", () => {
    const nodes = Array.from({ length: 99 }, (_, i) => ({ id: `n${i}`, type: "t" }))
    expect(crowding({ kind: "graph3d", nodes, edges: [] } as Panel, 700, 320)).toMatch(/^99 nodes in 700×320px/)
    expect(crowding({ kind: "graph3d", nodes: nodes.slice(0, 12), edges: [] } as Panel, 700, 320)).toBeUndefined()
  })
  it("says a regional arc is invisible on a globe", () => {
    const panel: Panel = { kind: "globe", arcs: [{ from: [116.4, 39.9], to: [121.5, 31.2] }, { from: [116.4, 39.9], to: [-74, 40.7] }] }
    expect(crowding(panel, 500, 400)).toMatch(/^1 arc shorter than 1500 km/)
  })
  it("has nothing to say about a panel that fits, or one not yet sized", () => {
    expect(crowding({ kind: "kpi", value: 1 } as Panel, 300, 120)).toBeUndefined()
    expect(crowding({ kind: "graph3d", nodes: [], edges: [] } as Panel, 0, 0)).toBeUndefined()
  })
})
