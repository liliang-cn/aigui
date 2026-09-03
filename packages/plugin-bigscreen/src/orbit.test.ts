import { describe, expect, it } from "vitest"
import { typeColour } from "./graph3d"
import { createLayout } from "./layout3d"
import { graphOrbitData, graphOrbitOption, orbitFrame, EDGE_VERTICES, ORBIT_BOX, ORBIT_DISTANCE, ORBIT_EXTENT, ORBIT_FOV } from "./orbit"
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

/** The panel, settled. */
function settled(panel: Graph3dPanel = PANEL): Float32Array {
  const layout = createLayout(panel.nodes, panel.edges)
  layout.step(layout.steps)
  return layout.positions()
}

const POSITIONS = settled()
const option = graphOrbitOption(PANEL, dark, true, POSITIONS) as Record<string, any>

describe("orbitFrame", () => {
  it("fits the graph's longest side to the box, whatever units the layout worked in", () => {
    // The layout's units depend on the number of entities, and the camera's distance does not.
    // Without this a graph of six is a speck and a graph of six hundred fills the room.
    expect(orbitFrame(new Float32Array([10, 0, 0, -10, 0, 0])).scale).toBeCloseTo(ORBIT_EXTENT / 10)
    expect(orbitFrame(new Float32Array([0.1, 0, 0, -0.1, 0, 0])).scale).toBeCloseTo(ORBIT_EXTENT / 0.1)
    // The longest side, not the radius: a graph that is wide and shallow still fills the frame.
    expect(orbitFrame(new Float32Array([-40, -2, 0, 40, 2, 0])).scale).toBeCloseTo(ORBIT_EXTENT / 40)
  })
  it("puts the middle of the graph in the middle of the panel", () => {
    // A settled layout does not centre itself on the origin, and one that sits off to one side is
    // half a panel of empty space with the graph crowded into the other half.
    expect(orbitFrame(new Float32Array([80, 0, 0, 100, 0, 0])).centre).toEqual([90, 0, 0])
    expect(orbitFrame(new Float32Array([-10, 2, 6, 10, 4, 8])).centre).toEqual([0, 3, 7])
  })
  it("does not divide by a graph that is all in one place", () => {
    expect(orbitFrame(new Float32Array([3, 3, 3])).scale).toBe(1)
    expect(orbitFrame(new Float32Array([3, 3, 3])).centre).toEqual([3, 3, 3])
    expect(orbitFrame(new Float32Array())).toEqual({ centre: [0, 0, 0], scale: 1 })
  })
})

describe("graphOrbitOption", () => {
  it("is a real 3D scene: a box, entities in it, and edges through it", () => {
    expect(option.grid3D).toBeDefined()
    expect(option.series.map((s: any) => s.type)).toEqual(["line3D", "scatter3D"])
    for (const series of option.series) expect(series.coordinateSystem).toBe("cartesian3D")
  })

  it("hides the box whole, and keeps it a cube so nothing distorts the shape", () => {
    // A knowledge graph has no axes to read; the box is only there to hold a coordinate system.
    // And it has to be a cube with the same range on all three sides, or the layout — which is
    // isotropic — is squashed along whichever axis happened to be shorter.
    expect(option.grid3D.show).toBe(false)
    expect(option.grid3D.boxWidth).toBe(option.grid3D.boxHeight)
    expect(option.grid3D.boxHeight).toBe(option.grid3D.boxDepth)
    for (const key of ["xAxis3D", "yAxis3D", "zAxis3D"]) {
      const axis = option[key]
      expect(axis.min).toBe(-ORBIT_EXTENT)
      expect(axis.max).toBe(ORBIT_EXTENT)
    }
  })

  it("never switches an axis line off, which is the way that does not work", () => {
    // echarts-gl saves the axis line's endpoints only while it draws it, and the camera-change
    // handler reads them back to align the labels. `axisLine: {show: false}` therefore throws
    // `Cannot read properties of null` on every frame an auto-rotating panel renders — hundreds
    // of uncaught errors a second behind a picture that otherwise looks fine.
    for (const key of ["xAxis3D", "yAxis3D", "zAxis3D"]) {
      expect(option[key].axisLine?.show).not.toBe(false)
    }
  })

  it("turns by itself, and lights the far side well enough to read", () => {
    expect(option.grid3D.viewControl.autoRotate).toBe(true)
    expect(option.grid3D.viewControl.autoRotateSpeed).toBeGreaterThan(0)
    expect(option.grid3D.viewControl.distance).toBeGreaterThan(0)
    expect(option.grid3D.light.ambient.intensity).toBeGreaterThan(0.3)
    // Still when the host says nothing may move, and still when the panel says so.
    expect((graphOrbitOption(PANEL, dark, false, POSITIONS) as any).grid3D.viewControl.autoRotate).toBe(false)
    expect((graphOrbitOption({ ...PANEL, rotate: false }, dark, true, POSITIONS) as any).grid3D.viewControl.autoRotate).toBe(false)
  })

  it("stands far enough back that the near side of the graph is still in frame", () => {
    // The graph is fitted to the box, so an entity sits half a box from the middle — and half a
    // revolution later that entity is on the *near* side, where the same offset subtends a much
    // wider angle. Framing for the middle crops the graph twice a turn, which is what a camera at
    // 180 did: an entity and its edge walked off the bottom of the panel and back again.
    const half = ORBIT_BOX / 2
    const halfHeightAtNearFace = (ORBIT_DISTANCE - half) * Math.tan(((ORBIT_FOV / 2) * Math.PI) / 180)
    expect(halfHeightAtNearFace).toBeGreaterThan(half)
    // And not so far back that the graph is a speck in the middle of an empty panel.
    expect(ORBIT_DISTANCE).toBeLessThan(half * 5)
  })

  it("says the name, the type and the degree on hover, escaped", () => {
    const formatter = option.tooltip.formatter as (p: any) => string
    const said = formatter({ data: { name: "Convoy crossing", nodeType: "event", degree: 3 } })
    expect(said).toContain("Convoy crossing")
    expect(said).toContain("event")
    expect(said).toContain("3")
    expect(formatter({ data: { name: "<img src=x>", degree: 0 } })).not.toContain("<img")
  })
})

describe("graphOrbitData", () => {
  const data = graphOrbitData(PANEL, dark, POSITIONS)
  const byId = Object.fromEntries(data.nodes.map((n) => [n.id, n]))

  it("gives every entity a place in space and a size, and keeps it inside the box", () => {
    for (const node of data.nodes) {
      expect(node.value).toHaveLength(4)
      for (const axis of node.value.slice(0, 3)) expect(Math.abs(axis)).toBeLessThanOrEqual(ORBIT_EXTENT + 1e-3)
      expect(node.value[3]).toBeGreaterThan(0)
    }
    // And it fills the frame in its longest direction rather than sitting in a corner of it.
    const spans = [0, 1, 2].map((axis) => {
      const v = data.nodes.map((n) => n.value[axis])
      return Math.max(...v) - Math.min(...v)
    })
    expect(Math.max(...spans)).toBeCloseTo(ORBIT_EXTENT * 2)
    // Three dimensions, not a plane with a third column of zeroes.
    expect(new Set(data.nodes.map((n) => Math.round(n.value[2]))).size).toBeGreaterThan(1)
    // The size is the fourth value, which is what `symbolSize` reads.
    const symbolSize = (option.series[1].symbolSize as (value: number[]) => number)(byId.convoy.value)
    expect(symbolSize).toBe(byId.convoy.value[3])
    expect(byId.convoy.value[3]).toBeGreaterThan(byId.kyiv.value[3])
  })

  it("colours an entity by its type and the focus by the accent", () => {
    expect(byId.reuters.itemStyle.color).toBe(typeColour("outlet", dark))
    expect(byId.tass.itemStyle.color).toBe(typeColour("outlet", dark))
    expect(byId.kyiv.itemStyle.color).toBe(typeColour("place", dark))
    expect(byId.convoy.itemStyle.color).toBe(dark.accent)
    const painted = graphOrbitData({ ...PANEL, types: { outlet: "#ff00ff" } }, dark, POSITIONS)
    expect(painted.nodes.find((n) => n.id === "reuters")?.itemStyle.color).toBe("#ff00ff")
  })

  it("draws each edge between the two places its ends ended up, in its own colour", () => {
    expect(data.edges).toHaveLength(PANEL.edges.length * EDGE_VERTICES)
    const edge = (n: number) => data.edges.slice(n * EDGE_VERTICES, (n + 1) * EDGE_VERTICES)
    const first = edge(0)
    expect(first.map((p) => p.value)).toEqual([
      byId.reuters.value.slice(0, 3),
      byId.reuters.value.slice(0, 3),
      byId.convoy.value.slice(0, 3),
      byId.convoy.value.slice(0, 3),
    ])
    expect(first.map((p) => p.lineStyle.color)).toEqual(Array(4).fill(typeColour("reported", dark)))
    expect(edge(4)[1].lineStyle.color).toBe(typeColour("contradicts", dark))
  })

  it("puts an edge's colour where `line3D` actually looks for it", () => {
    // `line3D` declares `visualStyleAccessPath: "lineStyle"`. Under `itemStyle` the colour is read
    // by nothing: every edge comes out in the series' single colour, and — far worse — so do the
    // joins that are only invisible because they were meant to be transparent.
    expect(data.edges[0].lineStyle).toBeDefined()
    expect((data.edges[0] as { itemStyle?: unknown }).itemStyle).toBeUndefined()
  })

  it("hides the thread the edges are strung on, at both of its ends", () => {
    // One `line3D` is one polyline, so every edge is joined to the next by a segment nobody asked
    // for. It is invisible only because the vertices on either side of it are fully transparent —
    // a gradient from opaque to nothing would draw a comet tail off every entity instead.
    const edge = (n: number) => data.edges.slice(n * EDGE_VERTICES, (n + 1) * EDGE_VERTICES)
    expect(edge(0).map((p) => p.lineStyle.opacity)).toEqual([0, 0.6, 0.6, 0])
    // Which is to say: the last vertex of one edge and the first of the next are both at zero.
    expect(edge(0)[EDGE_VERTICES - 1].lineStyle.opacity).toBe(0)
    expect(edge(1)[0].lineStyle.opacity).toBe(0)
    expect(edge(0)[1].lineStyle.opacity).toBeGreaterThan(0)
    expect(edge(0)[1].lineStyle.opacity).toBeLessThan(1)
  })

  it("labels the busiest few and the focus, and nothing else", () => {
    const lonely: Graph3dPanel = {
      kind: "graph3d",
      focus: "z",
      nodes: [...Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, name: `n${i}` })), { id: "z", name: "Z" }],
      edges: Array.from({ length: 29 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` })),
    }
    const many = graphOrbitData(lonely, dark, settled(lonely))
    expect(many.nodes.filter((n) => n.labelled)).toHaveLength(21)
    expect(many.nodes.find((n) => n.id === "z")?.labelled).toBe(true)
    // Which is what the series' own formatter writes, and the only thing it writes.
    const formatter = option.series[1].label.formatter as (p: any) => string
    expect(formatter({ data: { labelled: true, name: "Kyiv" } })).toBe("Kyiv")
    expect(formatter({ data: { labelled: false, name: "Kyiv" } })).toBe("")
    // On hover every entity says its name, labelled or not.
    expect((option.series[1].emphasis.label.formatter as (p: any) => string)({ data: { labelled: false, name: "Kyiv" } })).toBe("Kyiv")
  })

  it("keeps the node itself on the item, for the host's click", () => {
    expect(byId.convoy.node).toBe(PANEL.nodes[4])
    expect(byId.convoy.degree).toBe(3)
    expect(byId.convoy.nodeType).toBe("event")
  })

  it("is the same shape the frame loop pushes back in", () => {
    // The settling loop replaces both series' data every frame, so what it builds has to be
    // exactly what the option was built from — same order, same series.
    const next = graphOrbitData(PANEL, dark, POSITIONS)
    expect(option.series[0].data).toEqual(next.edges)
    expect(option.series[1].data).toEqual(next.nodes)
  })
})
