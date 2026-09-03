import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { degrees, graph3dOption, graphLegend, typeColour, GRAPH_LABELS, GRAPH_MAX_STEPS, GRAPH_SETTLE_STEPS } from "./graph3d"
import { palette } from "./palette"
import type { Graph3dPanel } from "./types"

const dark = palette({ theme: "dark" })

const PANEL: Graph3dPanel = {
  kind: "graph3d",
  nodes: [
    { id: "kyiv", name: "Kyiv", type: "place" },
    { id: "moscow", name: "Moscow", type: "place" },
    { id: "reuters", name: "Reuters", type: "outlet" },
    { id: "tass", name: "TASS", type: "outlet" },
    { id: "convoy", name: "Convoy crossing", type: "event" },
    { id: "denial", name: "Denial of crossing", type: "event" },
  ],
  edges: [
    { from: "reuters", to: "convoy", type: "reported" },
    { from: "tass", to: "denial", type: "reported" },
    { from: "convoy", to: "kyiv", type: "located" },
    { from: "denial", to: "moscow", type: "located" },
    { from: "convoy", to: "denial", type: "contradicts" },
    { from: "reuters", to: "kyiv", type: "located" },
    { from: "tass", to: "moscow", type: "located" },
  ],
  focus: "convoy",
}

describe("typeColour", () => {
  it("gives one type one colour, wherever it appears", () => {
    // Two panels on one wall must not colour "outlet" two different ways: the colour is a
    // function of the name, not of the order the types happened to appear in.
    expect(typeColour("outlet", dark)).toBe(typeColour("outlet", dark))
    expect(dark.series).toContain(typeColour("outlet", dark))
    expect(typeColour("outlet", dark)).not.toBe(typeColour("event", dark))
  })
  it("lets the panel name a colour itself", () => {
    expect(typeColour("outlet", dark, { outlet: "#ff00ff" })).toBe("#ff00ff")
    expect(typeColour("event", dark, { outlet: "#ff00ff" })).toBe(typeColour("event", dark))
  })
  it("leaves an untyped node the muted colour rather than borrowing a type's", () => {
    expect(typeColour(undefined, dark)).toBe(dark.muted)
  })
})

describe("degrees", () => {
  it("counts both ends of every edge", () => {
    const count = degrees(PANEL)
    expect(count.get("convoy")).toBe(3)
    expect(count.get("kyiv")).toBe(2)
    expect(count.get("reuters")).toBe(2)
  })
})

describe("graphLegend", () => {
  it("names each node type and each edge type once, in the order they appear", () => {
    const legend = graphLegend(PANEL, dark)
    expect(legend.filter((e) => e.shape === "node").map((e) => e.label)).toEqual(["place", "outlet", "event"])
    expect(legend.filter((e) => e.shape === "edge").map((e) => e.label)).toEqual(["reported", "located", "contradicts"])
    expect(legend[0].colour).toBe(typeColour("place", dark))
  })
  it("is empty when nothing is typed, so no legend is drawn at all", () => {
    expect(graphLegend({ kind: "graph3d", nodes: [{ id: "a", name: "A" }], edges: [] }, dark)).toEqual([])
  })
})

describe("graph3dOption", () => {
  const option = graph3dOption(PANEL, dark, true) as Record<string, any>
  const series = option.series[0]

  it("is a graphGL series laid out by force-atlas2", () => {
    expect(series.type).toBe("graphGL")
    expect(series.layout).toBe("forceAtlas2")
    expect(series.forceAtlas2.steps).toBe(GRAPH_SETTLE_STEPS)
    expect(series.forceAtlas2.maxSteps).toBe(GRAPH_MAX_STEPS)
    // Roughly two seconds of settling at sixty frames a second.
    expect(GRAPH_MAX_STEPS / GRAPH_SETTLE_STEPS).toBeGreaterThan(60)
    expect(GRAPH_MAX_STEPS / GRAPH_SETTLE_STEPS).toBeLessThan(180)
  })

  it("colours every node by its type and every edge by its own", () => {
    const byId = Object.fromEntries(series.nodes.map((n: any) => [n.id, n]))
    expect(byId.reuters.itemStyle.color).toBe(typeColour("outlet", dark))
    expect(byId.tass.itemStyle.color).toBe(typeColour("outlet", dark))
    expect(byId.kyiv.itemStyle.color).toBe(typeColour("place", dark))
    expect(series.edges[0]).toMatchObject({ source: "reuters", target: "convoy" })
    expect(series.edges[0].lineStyle.color).toBe(typeColour("reported", dark))
    expect(series.edges[4].lineStyle.color).toBe(typeColour("contradicts", dark))
  })

  it("takes the panel's own colour for a type", () => {
    const painted = graph3dOption({ ...PANEL, types: { outlet: "#ff00ff" } }, dark, true) as Record<string, any>
    const byId = Object.fromEntries(painted.series[0].nodes.map((n: any) => [n.id, n]))
    expect(byId.reuters.itemStyle.color).toBe("#ff00ff")
    expect(byId.kyiv.itemStyle.color).toBe(typeColour("place", dark))
  })

  it("sizes a node by its degree unless it was given a value", () => {
    const byId = Object.fromEntries(series.nodes.map((n: any) => [n.id, n]))
    expect(byId.convoy.symbolSize).toBeGreaterThan(byId.kyiv.symbolSize)
    const valued = graph3dOption({ ...PANEL, nodes: PANEL.nodes.map((n) => (n.id === "kyiv" ? { ...n, value: 99 } : n)) }, dark, true) as Record<string, any>
    const sized = Object.fromEntries(valued.series[0].nodes.map((n: any) => [n.id, n]))
    expect(sized.kyiv.symbolSize).toBeGreaterThan(sized.convoy.symbolSize)
  })

  it("labels the focus node and the busiest few, and keeps the node for the click", () => {
    const byId = Object.fromEntries(series.nodes.map((n: any) => [n.id, n]))
    expect(byId.convoy.label.show).toBe(true)
    expect(byId.convoy.node).toBe(PANEL.nodes[4])
    expect(series.nodes.filter((n: any) => n.label?.show).length).toBeLessThanOrEqual(GRAPH_LABELS + 1)
  })

  it("always labels the focus even when it is the least connected node there is", () => {
    const lonely: Graph3dPanel = {
      kind: "graph3d",
      focus: "z",
      nodes: [...Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, name: `n${i}` })), { id: "z", name: "Z" }],
      edges: Array.from({ length: 29 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` })),
    }
    const option = graph3dOption(lonely, dark, true) as Record<string, any>
    const byId = Object.fromEntries(option.series[0].nodes.map((n: any) => [n.id, n]))
    expect(byId.z.label.show).toBe(true)
    expect(byId.z.itemStyle.color).toBe(dark.accent)
    expect(option.series[0].nodes.filter((n: any) => n.label?.show).length).toBe(GRAPH_LABELS + 1)
  })

  it("says the name, the type and the degree on hover", () => {
    const formatter = option.tooltip.formatter as (p: any) => string
    expect(formatter({ dataType: "node", data: { name: "Convoy crossing", nodeType: "event", degree: 3 } })).toContain("Convoy crossing")
    expect(formatter({ dataType: "node", data: { name: "Convoy crossing", nodeType: "event", degree: 3 } })).toContain("event")
    expect(formatter({ dataType: "node", data: { name: "Convoy crossing", nodeType: "event", degree: 3 } })).toContain("3")
    expect(formatter({ dataType: "edge", data: { edgeType: "contradicts" } })).toContain("contradicts")
  })

  it("hands over a settled graph at once when nothing is meant to move", () => {
    for (const still of [graph3dOption({ ...PANEL, rotate: false }, dark, true), graph3dOption(PANEL, dark, false)]) {
      const s = (still as Record<string, any>).series[0]
      expect(s.forceAtlas2.steps).toBeGreaterThan(GRAPH_SETTLE_STEPS * 10)
    }
  })

  it("is the same option it was before there was a second mode, byte for byte", () => {
    // `flat` is now something a panel opts into, and a panel that opts into it asked for exactly
    // the picture this used to draw. The fixture is the option as it was serialised the day the
    // 3D model landed; a diff here means the flat mode moved under a fence that pinned it.
    const pinned = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "graph3d-flat.json"), "utf8"))
    const built = graph3dOption({ ...PANEL, mode: "flat" }, dark, true)
    expect(JSON.parse(JSON.stringify(built))).toEqual(pinned)
    expect(JSON.stringify(built)).toBe(JSON.stringify(pinned))
    // And the mode itself changes nothing about it: this builder only ever draws the flat one.
    expect(JSON.stringify(graph3dOption(PANEL, dark, true))).toBe(JSON.stringify(built))
  })
})
