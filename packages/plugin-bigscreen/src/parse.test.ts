import { describe, expect, it } from "vitest"
import { parseBigscreen } from "./parse"

const kpi = { kind: "kpi", title: "Revenue", value: 1200, span: 3 }
const screen = (panels: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({ title: "Wall", panels, ...extra })

const fail = (source: string, options?: Parameters<typeof parseBigscreen>[1]): string => {
  const result = parseBigscreen(source, options)
  if (result.ok) throw new Error("expected the screen to be refused")
  return result.error.message
}

describe("parseBigscreen", () => {
  it("accepts every panel kind", () => {
    const result = parseBigscreen(screen([
      kpi,
      { kind: "gauge", value: 72, thresholds: [0.6, 0.9], style: "ring" },
      { kind: "rank", items: [{ name: "A", value: 3 }, { name: "B", value: 5 }], top: 5 },
      { kind: "chart", option: { series: [{ type: "bar", data: [1, 2] }] } },
      { kind: "chart3d", type: "bar3D", data: [[0, 0, 1]], xAxis: ["x"], yAxis: ["y"] },
      { kind: "globe", arcs: [{ from: [121.5, 31.2], to: [116.4, 39.9] }] },
      { kind: "timeline", lanes: [{ id: "r", name: "Reuters" }], items: [{ lane: "r", at: "2026-09-01T08:00:00Z", label: "A claim" }] },
      { kind: "graph3d", nodes: [{ id: "a", name: "A" }], edges: [] },
    ]))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.panels.map((p) => p.kind)).toEqual(["kpi", "gauge", "rank", "chart", "chart3d", "globe", "timeline", "graph3d"])
      expect(result.value).toMatchObject({ theme: "dark", columns: 12, title: "Wall" })
    }
  })
  it("refuses a field a panel kind does not have", () => {
    // A model that wrote `sparkline` wanted something on the screen; a panel quietly without it
    // is the wrong screen.
    expect(fail(screen([{ ...kpi, sparkline: [1, 2] }]))).toContain("panels[0].sparkline is not a field of a kpi panel")
    expect(fail(screen([{ kind: "gauge", value: 1, items: [] }]))).toContain("items is not a field of a gauge panel")
    expect(fail(screen([kpi], { refresh: 5 }))).toContain("refresh is not a field")
  })
  it("says how long a string was allowed to be, and how long it was", () => {
    // The message a model has to act on. "must be a short string" says the
    // block was refused and nothing about what to change; observed in the wild
    // as a KPI caption of 54 characters against a limit of 40, written twice in
    // a row by a model that had never been told there was a limit at all.
    const caption = "持仓 14股 | 成本 $699.19 | 现价 $703.41 | 盈亏 +$59.07 (+0.60%)"
    const message = fail(screen([{ ...kpi, label: caption }]))
    expect(message).toContain("panels[0].label must be at most 40 characters")
    expect(message).toContain(`(got ${caption.length})`)

    // A field of the wrong type has no length to report, so it says the limit
    // and stops rather than printing "got undefined".
    expect(fail(screen([{ ...kpi, label: 12 }]))).toContain("panels[0].label must be a string of at most 40 characters")

    // Every length-checked field, so none of them drifts back to the useless
    // wording on its own.
    expect(fail(screen([{ ...kpi, unit: "x".repeat(17) }]))).toContain("at most 16 characters")
    expect(fail(screen([{ ...kpi, prefix: "x".repeat(9) }]))).toContain("at most 8 characters")
    expect(fail(screen([{ ...kpi, title: "x".repeat(81) }]))).toContain("at most 80 characters")
    expect(fail(screen([kpi], { subtitle: "x".repeat(121) }))).toContain("at most 120 characters")
  })
  it("checks the kpi's numbers", () => {
    expect(fail(screen([{ kind: "kpi" }]))).toContain("value must be a number")
    expect(fail(screen([{ ...kpi, decimals: 9 }]))).toContain("decimals must be a whole number from 0 to 6")
    expect(fail(screen([{ ...kpi, delta: "12%" }]))).toContain("delta must be a number")
    expect(fail(screen([{ ...kpi, trend: [1] }]))).toContain("trend must be 2 to 200 numbers")
  })
  it("checks the gauge's range and thresholds", () => {
    expect(fail(screen([{ kind: "gauge", value: 1, max: 0 }]))).toContain("max must be a positive number")
    expect(fail(screen([{ kind: "gauge", value: 1, thresholds: [0.9, 0.6] }]))).toContain("thresholds must be two fractions in order")
    expect(fail(screen([{ kind: "gauge", value: 1, style: "bar" }]))).toContain("style must be dial or ring")
  })
  it("checks rank items", () => {
    expect(fail(screen([{ kind: "rank", items: [] }]))).toContain("items must be 1 to 50 entries")
    expect(fail(screen([{ kind: "rank", items: [{ name: "A" }] }]))).toContain("items[0] must be {name, value}")
    expect(fail(screen([{ kind: "rank", items: [{ name: "A", value: 1, colour: "red" }] }]))).toContain("items[0].colour is not a field")
  })
  it("checks 3D data and axes", () => {
    expect(fail(screen([{ kind: "chart3d", type: "pie3D", data: [[0, 0, 0]] }]))).toContain("type must be one of")
    expect(fail(screen([{ kind: "chart3d", type: "bar3D", data: [[0, 0]] }]))).toContain("data[0] must be [x, y, z]")
    expect(fail(screen([{ kind: "chart3d", type: "bar3D", data: [[0, 0, 1]], xAxis: [] }]))).toContain("xAxis must be a list of category names")
  })
  it("checks the globe's coordinates and needs something to draw", () => {
    expect(fail(screen([{ kind: "globe" }]))).toContain("needs arcs or points")
    expect(fail(screen([{ kind: "globe", arcs: [{ from: [200, 0], to: [0, 0] }] }]))).toContain("arcs[0] must be {from: [lng, lat], to: [lng, lat]}")
    expect(fail(screen([{ kind: "globe", points: [{ coord: [0, 95] }] }]))).toContain("points[0] must be {coord: [lng, lat]}")
    expect(fail(screen([{ kind: "globe", points: [{ coord: [0, 0], value: -1 }] }]))).toContain("value must be zero or a positive number")
  })
  it("keeps a span within the grid", () => {
    expect(fail(screen([{ ...kpi, span: 13 }]))).toContain("span must be a whole number from 1 to 12")
    expect(parseBigscreen(screen([{ ...kpi, span: 13 }], { columns: 16 })).ok).toBe(true)
    expect(fail(screen([kpi], { columns: 30 }))).toContain("columns must be a whole number from 1 to 24")
  })
  it("checks the screen's own fields", () => {
    expect(fail(screen([kpi], { theme: "neon" }))).toContain("theme must be dark or light")
    expect(fail(screen([kpi], { accent: "cyan" }))).toContain("accent must be a hex colour")
    expect(fail(screen([]))).toContain("panels must be a non-empty array")
    expect(fail(screen([kpi, kpi, kpi]), { maxPanels: 2 })).toContain("more than 2")
    expect(parseBigscreen(screen([kpi]), { maxSourceBytes: 5 })).toMatchObject({ ok: false, error: { code: "too-large" } })
    expect(parseBigscreen("{")).toMatchObject({ ok: false, error: { code: "invalid-json" } })
  })
  it("lets the fence's theme win over the host's", () => {
    const result = parseBigscreen(screen([kpi], { theme: "light" }), { theme: "dark" })
    expect(result.ok && result.value.theme).toBe("light")
    const host = parseBigscreen(screen([kpi]), { theme: "light" })
    expect(host.ok && host.value.theme).toBe("light")
  })
})

const LANES = [{ id: "reuters", name: "Reuters" }, { id: "tass", name: "TASS" }]
const CLAIMS = [
  { id: "c1", lane: "reuters", at: "2026-09-01T08:00:00Z", label: "Convoy crossed" },
  { id: "c2", lane: "tass", at: "2026-09-01T09:30:00Z", label: "No convoy crossed" },
]
const timeline = (extra: Record<string, unknown> = {}) => ({ kind: "timeline", lanes: LANES, items: CLAIMS, ...extra })

const NODES = [{ id: "a", name: "A", type: "place" }, { id: "b", name: "B", type: "outlet" }]
const graph = (extra: Record<string, unknown> = {}) => ({ kind: "graph3d", nodes: NODES, edges: [{ from: "a", to: "b" }], ...extra })

describe("a timeline panel", () => {
  it("accepts lanes, claims and the links between them", () => {
    const result = parseBigscreen(screen([timeline({ links: [{ from: "c1", to: "c2", kind: "contradicts" }], from: "2026-09-01T00:00:00Z", to: "2026-09-02T00:00:00Z" })]))
    expect(result.ok).toBe(true)
    if (result.ok) {
      const panel = result.value.panels[0]
      expect(panel.kind).toBe("timeline")
      if (panel.kind !== "timeline") return
      expect(panel.lanes).toHaveLength(2)
      expect(panel.items[0]).toMatchObject({ id: "c1", lane: "reuters", label: "Convoy crossed" })
      expect(panel.links?.[0]).toEqual({ from: "c1", to: "c2", kind: "contradicts" })
    }
  })
  it("counts the lanes and the claims", () => {
    expect(fail(screen([timeline({ lanes: [] })]))).toContain("panels[0].lanes must be 1 to 24 entries")
    expect(fail(screen([timeline({ lanes: Array.from({ length: 25 }, (_, i) => ({ id: `l${i}`, name: `l${i}` })) })]))).toContain("lanes must be 1 to 24 entries")
    expect(fail(screen([timeline({ items: [] })]))).toContain("panels[0].items must be 1 to 500 entries")
    const many = Array.from({ length: 501 }, (_, i) => ({ lane: "reuters", at: "2026-09-01T08:00:00Z", label: `c${i}` }))
    expect(fail(screen([timeline({ items: many })]))).toContain("items must be 1 to 500 entries")
    expect(fail(screen([timeline({ links: Array.from({ length: 501 }, () => ({ from: "c1", to: "c2" })) })]))).toContain("links must be up to 500 entries")
  })
  it("keeps every string inside its limit, and says which", () => {
    expect(fail(screen([timeline({ lanes: [{ id: "a", name: "x".repeat(41) }] })]))).toContain("panels[0].lanes[0].name must be at most 40 characters")
    expect(fail(screen([timeline({ items: [{ ...CLAIMS[0], label: "x".repeat(121) }] })]))).toContain("panels[0].items[0].label must be at most 120 characters")
    expect(fail(screen([timeline({ items: [{ ...CLAIMS[0], detail: "x".repeat(401) }] })]))).toContain("panels[0].items[0].detail must be at most 400 characters")
  })
  it("refuses a lane, a claim or a link nobody defined", () => {
    // A claim on a lane that is not there is silently dropped by every charting library there is,
    // and a timeline missing the claim it was drawn for is worse than no timeline.
    expect(fail(screen([timeline({ items: [{ lane: "afp", at: "2026-09-01T08:00:00Z", label: "x" }] })]))).toContain("panels[0].items[0].lane is not one of the panel's lane ids")
    expect(fail(screen([timeline({ links: [{ from: "c1", to: "c9" }] })]))).toContain("panels[0].links[0].to is not an item id")
    expect(fail(screen([timeline({ links: [{ from: "c9", to: "c1" }] })]))).toContain("panels[0].links[0].from is not an item id")
    expect(fail(screen([timeline({ links: [{ from: "c1", to: "c2", kind: "denies" }] })]))).toContain("panels[0].links[0].kind must be contradicts, follows or same")
    expect(fail(screen([timeline({ lanes: [LANES[0], LANES[0]] })]))).toContain("panels[0].lanes[1].id is a duplicate lane id")
    expect(fail(screen([timeline({ items: [CLAIMS[0], CLAIMS[0]] })]))).toContain("panels[0].items[1].id is a duplicate item id")
  })
  it("needs a real date and an ordinary URL", () => {
    expect(fail(screen([timeline({ items: [{ ...CLAIMS[0], at: "last Tuesday" }] })]))).toContain("panels[0].items[0].at must be an ISO 8601 date-time")
    expect(fail(screen([timeline({ from: "soon" })]))).toContain("panels[0].from must be an ISO 8601 date-time")
    // The click opens this. A `javascript:` URL a model wrote is script the page runs on its say-so.
    expect(fail(screen([timeline({ items: [{ ...CLAIMS[0], url: "javascript:alert(1)" }] })]))).toContain("panels[0].items[0].url must be an http or https URL")
  })
  it("refuses a field a lane, an item or a link does not have", () => {
    expect(fail(screen([timeline({ lanes: [{ id: "a", name: "A", colour: "#fff" }] })]))).toContain("panels[0].lanes[0].colour is not a field of a timeline lane")
    expect(fail(screen([timeline({ items: [{ ...CLAIMS[0], source: "x" }] })]))).toContain("panels[0].items[0].source is not a field of a timeline item")
    expect(fail(screen([timeline({ links: [{ from: "c1", to: "c2", weight: 1 }] })]))).toContain("panels[0].links[0].weight is not a field of a timeline link")
  })
})

describe("a graph3d panel", () => {
  it("accepts entities, typed edges, a palette override and a focus", () => {
    const result = parseBigscreen(screen([graph({ types: { place: "#22d3ee" }, focus: "a", rotate: false })]))
    expect(result.ok).toBe(true)
    if (result.ok) {
      const panel = result.value.panels[0]
      if (panel.kind !== "graph3d") throw new Error("expected a graph3d panel")
      expect(panel.nodes).toHaveLength(2)
      expect(panel.edges[0]).toEqual({ from: "a", to: "b" })
      expect(panel.types).toEqual({ place: "#22d3ee" })
      expect(panel.focus).toBe("a")
      expect(panel.rotate).toBe(false)
    }
  })
  it("draws a graph as a 3D model unless it is asked for the flat one", () => {
    // The default is the thing the panel is for. A knowledge graph laid out on a plane is a
    // hairball with a camera pointed at it; the mode a host has to opt into is the old one.
    const mode = (raw: Record<string, unknown>): string => {
      const result = parseBigscreen(screen([graph(raw)]))
      if (!result.ok) throw new Error(result.error.message)
      const panel = result.value.panels[0]
      if (panel.kind !== "graph3d") throw new Error("expected a graph3d panel")
      return panel.mode ?? "(unset)"
    }
    expect(mode({})).toBe("orbit")
    expect(mode({ mode: "orbit" })).toBe("orbit")
    expect(mode({ mode: "flat" })).toBe("flat")
    expect(fail(screen([graph({ mode: "globe" })]))).toContain("panels[0].mode must be orbit or flat")
    expect(fail(screen([graph({ mode: true })]))).toContain("panels[0].mode must be orbit or flat")
  })
  it("counts the nodes, the edges and the type colours", () => {
    expect(fail(screen([graph({ nodes: [] })]))).toContain("panels[0].nodes must be 1 to 2000 entries")
    const nodes = Array.from({ length: 2001 }, (_, i) => ({ id: `n${i}`, name: `n${i}` }))
    expect(fail(screen([graph({ nodes, edges: [] })]))).toContain("nodes must be 1 to 2000 entries")
    // Five thousand edges is about a hundred kilobytes of JSON, so the size check fires first
    // under the default 64 KiB. A host that wants graphs this big raises `maxSourceBytes`; the
    // edge limit is what it then runs into.
    const edges = Array.from({ length: 5001 }, () => ({ from: "a", to: "b" }))
    expect(fail(screen([graph({ edges })]), { maxSourceBytes: 1024 * 1024 })).toContain("edges must be up to 5000 entries")
    expect(parseBigscreen(screen([graph({ edges })]))).toMatchObject({ ok: false, error: { code: "too-large" } })
    const types = Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`t${i}`, "#22d3ee"]))
    expect(fail(screen([graph({ types })]))).toContain("types must be up to 32 entries")
  })
  it("keeps a name and a type inside their limits", () => {
    expect(fail(screen([graph({ nodes: [{ id: "a", name: "x".repeat(81) }] })]))).toContain("panels[0].nodes[0].name must be at most 80 characters")
    expect(fail(screen([graph({ nodes: [{ id: "a", name: "A", type: "x".repeat(33) }] })]))).toContain("panels[0].nodes[0].type must be at most 32 characters")
    expect(fail(screen([graph({ edges: [{ from: "a", to: "b", type: "x".repeat(33) }] })]))).toContain("panels[0].edges[0].type must be at most 32 characters")
  })
  it("refuses an edge or a focus that points at no node", () => {
    expect(fail(screen([graph({ edges: [{ from: "a", to: "zz" }] })]))).toContain("panels[0].edges[0].to is not a node id")
    expect(fail(screen([graph({ edges: [{ from: "zz", to: "a" }] })]))).toContain("panels[0].edges[0].from is not a node id")
    expect(fail(screen([graph({ focus: "zz" })]))).toContain("panels[0].focus is not a node id")
    expect(fail(screen([graph({ nodes: [NODES[0], NODES[0]] })]))).toContain("panels[0].nodes[1].id is a duplicate node id")
  })
  it("needs the type colours to be colours, and refuses a field a node does not have", () => {
    expect(fail(screen([graph({ types: { place: "cyan" } })]))).toContain("panels[0].types.place must be a hex colour like #22d3ee")
    expect(fail(screen([graph({ nodes: [{ id: "a", name: "A", colour: "#fff" }] })]))).toContain("panels[0].nodes[0].colour is not a field of a graph3d node")
    expect(fail(screen([graph({ edges: [{ from: "a", to: "b", weight: 2 }] })]))).toContain("panels[0].edges[0].weight is not a field of a graph3d edge")
  })
})
