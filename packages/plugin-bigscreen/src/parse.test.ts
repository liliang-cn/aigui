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
    ]))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.panels.map((p) => p.kind)).toEqual(["kpi", "gauge", "rank", "chart", "chart3d", "globe"])
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
