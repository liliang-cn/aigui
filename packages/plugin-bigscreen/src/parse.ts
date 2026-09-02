import type { BigscreenResult, Chart3dPanel, GaugePanel, GlobePanel, KpiPanel, Panel, PanelKind, RankPanel, ScreenDefinition, ScreenTheme } from "./types"

const SCREEN_FIELDS = new Set(["title", "subtitle", "theme", "accent", "columns", "panels"])
const COMMON = ["kind", "title", "span", "height"]
const FIELDS: Record<PanelKind, string[]> = {
  kpi: ["value", "unit", "prefix", "decimals", "delta", "upIsGood", "trend", "label"],
  gauge: ["value", "max", "unit", "style", "thresholds"],
  rank: ["items", "unit", "top"],
  chart: ["option"],
  chart3d: ["type", "data", "xAxis", "yAxis", "rotate"],
  globe: ["arcs", "points", "rotate"],
}
const KINDS = new Set<PanelKind>(["kpi", "gauge", "rank", "chart", "chart3d", "globe"])
const CHART3D_TYPES = new Set(["bar3D", "scatter3D", "surface", "line3D"])
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const MAX_POINTS = 5000
const MAX_ITEMS = 50
const MAX_ARCS = 300

const bad = (message: string): BigscreenResult<never> => ({ ok: false, error: { code: "invalid-definition", message } })
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const text = (value: unknown, max = 120): value is string => typeof value === "string" && value.length <= max
const lngLat = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every(finite) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90

function parseKpi(raw: Record<string, unknown>, at: string): BigscreenResult<KpiPanel> {
  if (!finite(raw.value)) return bad(`${at}.value must be a number`)
  const panel: KpiPanel = { kind: "kpi", value: raw.value }
  if (raw.unit !== undefined) {
    if (!text(raw.unit, 16)) return bad(`${at}.unit must be a short string`)
    panel.unit = raw.unit
  }
  if (raw.prefix !== undefined) {
    if (!text(raw.prefix, 8)) return bad(`${at}.prefix must be a short string`)
    panel.prefix = raw.prefix
  }
  if (raw.decimals !== undefined) {
    if (!Number.isInteger(raw.decimals) || (raw.decimals as number) < 0 || (raw.decimals as number) > 6) return bad(`${at}.decimals must be a whole number from 0 to 6`)
    panel.decimals = raw.decimals as number
  }
  if (raw.delta !== undefined) {
    if (!finite(raw.delta)) return bad(`${at}.delta must be a number (a fraction: 0.12 is +12%)`)
    panel.delta = raw.delta
  }
  if (raw.upIsGood !== undefined) {
    if (typeof raw.upIsGood !== "boolean") return bad(`${at}.upIsGood must be true or false`)
    panel.upIsGood = raw.upIsGood
  }
  if (raw.trend !== undefined) {
    if (!Array.isArray(raw.trend) || raw.trend.length < 2 || raw.trend.length > 200 || !raw.trend.every(finite)) return bad(`${at}.trend must be 2 to 200 numbers`)
    panel.trend = raw.trend as number[]
  }
  if (raw.label !== undefined) {
    if (!text(raw.label, 40)) return bad(`${at}.label must be a short string`)
    panel.label = raw.label
  }
  return { ok: true, value: panel }
}

function parseGauge(raw: Record<string, unknown>, at: string): BigscreenResult<GaugePanel> {
  if (!finite(raw.value)) return bad(`${at}.value must be a number`)
  const panel: GaugePanel = { kind: "gauge", value: raw.value }
  if (raw.max !== undefined) {
    if (!finite(raw.max) || raw.max <= 0) return bad(`${at}.max must be a positive number`)
    panel.max = raw.max
  }
  if (raw.unit !== undefined) {
    if (!text(raw.unit, 16)) return bad(`${at}.unit must be a short string`)
    panel.unit = raw.unit
  }
  if (raw.style !== undefined) {
    if (raw.style !== "dial" && raw.style !== "ring") return bad(`${at}.style must be dial or ring`)
    panel.style = raw.style
  }
  if (raw.thresholds !== undefined) {
    const t = raw.thresholds
    if (!Array.isArray(t) || t.length !== 2 || !t.every(finite) || !(t[0] >= 0 && t[0] <= t[1] && t[1] <= 1)) return bad(`${at}.thresholds must be two fractions in order, e.g. [0.6, 0.85]`)
    panel.thresholds = [t[0], t[1]]
  }
  return { ok: true, value: panel }
}

function parseRank(raw: Record<string, unknown>, at: string): BigscreenResult<RankPanel> {
  if (!Array.isArray(raw.items) || raw.items.length === 0 || raw.items.length > MAX_ITEMS) return bad(`${at}.items must be 1 to ${MAX_ITEMS} entries`)
  const items: RankPanel["items"] = []
  for (const [index, item] of raw.items.entries()) {
    if (!isRecord(item) || !text(item.name, 40) || !finite(item.value)) return bad(`${at}.items[${index}] must be {name, value}`)
    for (const key of Object.keys(item)) {
      if (key !== "name" && key !== "value") return bad(`${at}.items[${index}].${key} is not a field of a rank item`)
    }
    items.push({ name: item.name, value: item.value })
  }
  const panel: RankPanel = { kind: "rank", items }
  if (raw.unit !== undefined) {
    if (!text(raw.unit, 16)) return bad(`${at}.unit must be a short string`)
    panel.unit = raw.unit
  }
  if (raw.top !== undefined) {
    if (!Number.isInteger(raw.top) || (raw.top as number) < 1 || (raw.top as number) > MAX_ITEMS) return bad(`${at}.top must be a whole number from 1 to ${MAX_ITEMS}`)
    panel.top = raw.top as number
  }
  return { ok: true, value: panel }
}

function parseChart3d(raw: Record<string, unknown>, at: string): BigscreenResult<Chart3dPanel> {
  if (typeof raw.type !== "string" || !CHART3D_TYPES.has(raw.type)) return bad(`${at}.type must be one of ${[...CHART3D_TYPES].join(", ")}`)
  if (!Array.isArray(raw.data) || raw.data.length === 0 || raw.data.length > MAX_POINTS) return bad(`${at}.data must be 1 to ${MAX_POINTS} points`)
  const data: Chart3dPanel["data"] = []
  for (const [index, point] of raw.data.entries()) {
    if (!Array.isArray(point) || point.length !== 3 || !point.every(finite)) return bad(`${at}.data[${index}] must be [x, y, z]`)
    data.push([point[0], point[1], point[2]])
  }
  const panel: Chart3dPanel = { kind: "chart3d", type: raw.type as Chart3dPanel["type"], data }
  for (const axis of ["xAxis", "yAxis"] as const) {
    const categories = raw[axis]
    if (categories === undefined) continue
    if (!Array.isArray(categories) || categories.length === 0 || categories.length > 200 || !categories.every((c) => text(c, 40))) return bad(`${at}.${axis} must be a list of category names`)
    panel[axis] = categories as string[]
  }
  if (raw.rotate !== undefined) {
    if (typeof raw.rotate !== "boolean") return bad(`${at}.rotate must be true or false`)
    panel.rotate = raw.rotate
  }
  return { ok: true, value: panel }
}

function parseGlobe(raw: Record<string, unknown>, at: string): BigscreenResult<GlobePanel> {
  const panel: GlobePanel = { kind: "globe" }
  if (raw.arcs !== undefined) {
    if (!Array.isArray(raw.arcs) || raw.arcs.length > MAX_ARCS) return bad(`${at}.arcs must be up to ${MAX_ARCS} entries`)
    panel.arcs = []
    for (const [index, arc] of raw.arcs.entries()) {
      if (!isRecord(arc) || !lngLat(arc.from) || !lngLat(arc.to)) return bad(`${at}.arcs[${index}] must be {from: [lng, lat], to: [lng, lat]}`)
      const entry: NonNullable<GlobePanel["arcs"]>[number] = { from: arc.from, to: arc.to }
      if (arc.label !== undefined) {
        if (!text(arc.label, 40)) return bad(`${at}.arcs[${index}].label must be a short string`)
        entry.label = arc.label
      }
      panel.arcs.push(entry)
    }
  }
  if (raw.points !== undefined) {
    if (!Array.isArray(raw.points) || raw.points.length > MAX_ARCS) return bad(`${at}.points must be up to ${MAX_ARCS} entries`)
    panel.points = []
    for (const [index, point] of raw.points.entries()) {
      if (!isRecord(point) || !lngLat(point.coord)) return bad(`${at}.points[${index}] must be {coord: [lng, lat]}`)
      const entry: NonNullable<GlobePanel["points"]>[number] = { coord: point.coord }
      if (point.label !== undefined) {
        if (!text(point.label, 40)) return bad(`${at}.points[${index}].label must be a short string`)
        entry.label = point.label
      }
      if (point.value !== undefined) {
        if (!finite(point.value) || point.value < 0) return bad(`${at}.points[${index}].value must be zero or a positive number`)
        entry.value = point.value
      }
      panel.points.push(entry)
    }
  }
  if (!panel.arcs?.length && !panel.points?.length) return bad(`${at} needs arcs or points`)
  if (raw.rotate !== undefined) {
    if (typeof raw.rotate !== "boolean") return bad(`${at}.rotate must be true or false`)
    panel.rotate = raw.rotate
  }
  return { ok: true, value: panel }
}

function parsePanel(raw: unknown, index: number, columns: number): BigscreenResult<Panel> {
  const at = `panels[${index}]`
  if (!isRecord(raw)) return bad(`${at} must be an object`)
  if (typeof raw.kind !== "string" || !KINDS.has(raw.kind as PanelKind)) return bad(`${at}.kind must be one of ${[...KINDS].join(", ")}`)
  const kind = raw.kind as PanelKind
  const allowed = new Set([...COMMON, ...FIELDS[kind]])
  // An unknown key is something the model wanted on the screen; dropping it quietly shows a
  // panel missing the very thing it was asked for.
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) return bad(`${at}.${key} is not a field of a ${kind} panel`)
  }
  let parsed: BigscreenResult<Panel>
  switch (kind) {
    case "kpi":
      parsed = parseKpi(raw, at)
      break
    case "gauge":
      parsed = parseGauge(raw, at)
      break
    case "rank":
      parsed = parseRank(raw, at)
      break
    case "chart":
      if (!isRecord(raw.option)) return bad(`${at}.option must be an ECharts option object`)
      parsed = { ok: true, value: { kind: "chart", option: raw.option } }
      break
    case "chart3d":
      parsed = parseChart3d(raw, at)
      break
    case "globe":
      parsed = parseGlobe(raw, at)
      break
  }
  if (!parsed.ok) return parsed
  const panel = parsed.value
  if (raw.title !== undefined) {
    if (!text(raw.title, 80)) return bad(`${at}.title must be a short string`)
    panel.title = raw.title
  }
  if (raw.span !== undefined) {
    if (!Number.isInteger(raw.span) || (raw.span as number) < 1 || (raw.span as number) > columns) return bad(`${at}.span must be a whole number from 1 to ${columns}`)
    panel.span = raw.span as number
  }
  if (raw.height !== undefined) {
    if (!finite(raw.height) || raw.height < 80 || raw.height > 900) return bad(`${at}.height must be from 80 to 900 pixels`)
    panel.height = raw.height
  }
  return { ok: true, value: panel }
}

/** Validate one `bigscreen` fence, or explain why it cannot be shown. */
export function parseBigscreen(
  source: string,
  options: { maxPanels?: number; maxSourceBytes?: number; theme?: ScreenTheme } = {},
): BigscreenResult<ScreenDefinition> {
  const maxPanels = options.maxPanels ?? 24
  const maxSourceBytes = options.maxSourceBytes ?? 64 * 1024
  if (new TextEncoder().encode(source).byteLength > maxSourceBytes) {
    return { ok: false, error: { code: "too-large", message: "Screen definition is too large." } }
  }
  let raw: unknown
  try {
    raw = JSON.parse(source)
  } catch {
    return { ok: false, error: { code: "invalid-json", message: "Screen definition is not valid JSON." } }
  }
  if (!isRecord(raw)) return bad("A screen definition must be a JSON object")
  for (const key of Object.keys(raw)) {
    if (!SCREEN_FIELDS.has(key)) return bad(`${key} is not a field of a screen definition`)
  }
  const definition: ScreenDefinition = { theme: options.theme ?? "dark", columns: 12, panels: [] }
  if (raw.title !== undefined) {
    if (!text(raw.title, 80)) return bad("title must be a short string")
    definition.title = raw.title
  }
  if (raw.subtitle !== undefined) {
    if (!text(raw.subtitle, 120)) return bad("subtitle must be a short string")
    definition.subtitle = raw.subtitle
  }
  if (raw.theme !== undefined) {
    if (raw.theme !== "dark" && raw.theme !== "light") return bad("theme must be dark or light")
    definition.theme = raw.theme
  }
  if (raw.accent !== undefined) {
    if (typeof raw.accent !== "string" || !HEX.test(raw.accent)) return bad("accent must be a hex colour like #22d3ee")
    definition.accent = raw.accent
  }
  if (raw.columns !== undefined) {
    if (!Number.isInteger(raw.columns) || (raw.columns as number) < 1 || (raw.columns as number) > 24) return bad("columns must be a whole number from 1 to 24")
    definition.columns = raw.columns as number
  }
  if (!Array.isArray(raw.panels) || raw.panels.length === 0) return bad("panels must be a non-empty array")
  if (raw.panels.length > maxPanels) return bad(`panels has more than ${maxPanels} entries`)
  for (const [index, entry] of raw.panels.entries()) {
    const panel = parsePanel(entry, index, definition.columns)
    if (!panel.ok) return panel
    definition.panels.push(panel.value)
  }
  return { ok: true, value: definition }
}
