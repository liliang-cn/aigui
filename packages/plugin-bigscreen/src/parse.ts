import type {
  BigscreenResult,
  Chart3dPanel,
  GaugePanel,
  GlobePanel,
  Graph3dEdge,
  Graph3dNode,
  Graph3dPanel,
  KpiPanel,
  Panel,
  PanelKind,
  RankPanel,
  ScreenDefinition,
  ScreenTheme,
  TimelineItem,
  TimelineLane,
  TimelineLink,
  TimelinePanel,
} from "./types"

const SCREEN_FIELDS = new Set(["title", "subtitle", "theme", "accent", "columns", "panels"])
const COMMON = ["kind", "title", "span", "height"]
const FIELDS: Record<PanelKind, string[]> = {
  kpi: ["value", "unit", "prefix", "decimals", "delta", "upIsGood", "trend", "label"],
  gauge: ["value", "max", "unit", "style", "thresholds"],
  rank: ["items", "unit", "top"],
  chart: ["option"],
  chart3d: ["type", "data", "xAxis", "yAxis", "rotate"],
  globe: ["arcs", "points", "rotate"],
  timeline: ["lanes", "items", "links", "from", "to"],
  graph3d: ["nodes", "edges", "types", "focus", "mode", "rotate"],
}
const KINDS = new Set<PanelKind>(["kpi", "gauge", "rank", "chart", "chart3d", "globe", "timeline", "graph3d"])
const CHART3D_TYPES = new Set(["bar3D", "scatter3D", "surface", "line3D"])
const LINK_KINDS = new Set(["contradicts", "follows", "same"])
const LANE_FIELDS = new Set(["id", "name", "color"])
const TIMELINE_ITEM_FIELDS = new Set(["id", "lane", "at", "label", "detail", "url", "value"])
const LINK_FIELDS = new Set(["from", "to", "kind"])
const NODE_FIELDS = new Set(["id", "name", "type", "value"])
const EDGE_FIELDS = new Set(["from", "to", "type"])
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
/**
 * Every limit the parser enforces, named.
 *
 * Exported because a limit the parser checks and nothing states is a trap: the prompt spec has to
 * name the same numbers, and a host building a fence of its own needs to know where the cliff is.
 * Overrunning any of them voids the whole block, so they are all deliberately generous — generous
 * enough that the biggest of them are not reachable under the default 64 KiB source cap: five
 * thousand edges is around a hundred kilobytes of JSON, so a host that really wants a graph that
 * size has to raise `maxSourceBytes` as well.
 */
export const MAX_POINTS = 5000
export const MAX_ITEMS = 50
export const MAX_ARCS = 300
export const MAX_LANES = 24
export const MAX_TIMELINE_ITEMS = 500
export const MAX_LINKS = 500
export const MAX_NODES = 2000
export const MAX_EDGES = 5000
export const MAX_TYPES = 32
export const MAX_LANE_NAME = 40
export const MAX_ITEM_LABEL = 120
export const MAX_ITEM_DETAIL = 400
export const MAX_URL = 400
export const MAX_NODE_NAME = 80
export const MAX_TYPE_NAME = 32

const bad = (message: string): BigscreenResult<never> => ({ ok: false, error: { code: "invalid-definition", message } })
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const text = (value: unknown, max = 120): value is string => typeof value === "string" && value.length <= max

/**
 * Why a string was rejected, with the number in it.
 *
 * "must be a short string" is true and useless: it does not say how short, so
 * neither a model rewriting its own block nor a person reading the message can
 * tell whether they are two characters over or twenty. Observed in the wild —
 * a KPI caption of 54 characters against a limit of 40, twice in a row, from a
 * model that had never been told there was a limit.
 */
const tooLong = (at: string, max: number, value: unknown): string =>
  typeof value === "string"
    ? `${at} must be at most ${max} characters (got ${value.length})`
    : `${at} must be a string of at most ${max} characters`
/**
 * A moment, as far as `Date.parse` is concerned — which is what the chart will read it with.
 *
 * Deliberately the platform's own parser rather than a stricter regular expression: a model that
 * writes `2026-09-01T08:00:00+02:00` or `2026-09-01` has said something a timeline can place, and
 * refusing the whole block over the shape of a suffix helps nobody.
 */
const instant = (value: unknown): value is string => typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value))

/**
 * A link a click may follow.
 *
 * Only `http` and `https`: this URL ends up in `window.open`, and `javascript:` there is script
 * the page runs because a model asked it to.
 */
const httpUrl = (value: unknown): value is string => typeof value === "string" && value.length <= MAX_URL && /^https?:\/\/\S+$/i.test(value)

/** The first key that is not in `allowed`, or undefined. */
const stray = (raw: Record<string, unknown>, allowed: Set<string>): string | undefined => Object.keys(raw).find((key) => !allowed.has(key))

const lngLat = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every(finite) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90

function parseKpi(raw: Record<string, unknown>, at: string): BigscreenResult<KpiPanel> {
  if (!finite(raw.value)) return bad(`${at}.value must be a number`)
  const panel: KpiPanel = { kind: "kpi", value: raw.value }
  if (raw.unit !== undefined) {
    if (!text(raw.unit, 16)) return bad(tooLong(`${at}.unit`, 16, raw.unit))
    panel.unit = raw.unit
  }
  if (raw.prefix !== undefined) {
    if (!text(raw.prefix, 8)) return bad(tooLong(`${at}.prefix`, 8, raw.prefix))
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
    if (!text(raw.label, 40)) return bad(tooLong(`${at}.label`, 40, raw.label))
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
    if (!text(raw.unit, 16)) return bad(tooLong(`${at}.unit`, 16, raw.unit))
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
    if (!text(raw.unit, 16)) return bad(tooLong(`${at}.unit`, 16, raw.unit))
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
        if (!text(arc.label, 40)) return bad(tooLong(`${at}.arcs[${index}].label`, 40, arc.label))
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
        if (!text(point.label, 40)) return bad(tooLong(`${at}.points[${index}].label`, 40, point.label))
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

/**
 * A timeline, checked against itself.
 *
 * The references are the part worth the code: a claim on a lane nobody declared, or a
 * contradiction between an id and nothing, is dropped silently by every charting library there
 * is — and a timeline missing the very link it was drawn for is worse than no timeline at all.
 */
function parseTimeline(raw: Record<string, unknown>, at: string): BigscreenResult<TimelinePanel> {
  if (!Array.isArray(raw.lanes) || raw.lanes.length === 0 || raw.lanes.length > MAX_LANES) return bad(`${at}.lanes must be 1 to ${MAX_LANES} entries`)
  const lanes: TimelineLane[] = []
  const laneIds = new Set<string>()
  for (const [index, lane] of raw.lanes.entries()) {
    const where = `${at}.lanes[${index}]`
    if (!isRecord(lane) || !text(lane.id, 64) || typeof lane.name !== "string") return bad(`${where} must be {id, name}`)
    const key = stray(lane, LANE_FIELDS)
    if (key) return bad(`${where}.${key} is not a field of a timeline lane`)
    if (!text(lane.name, MAX_LANE_NAME)) return bad(tooLong(`${where}.name`, MAX_LANE_NAME, lane.name))
    if (laneIds.has(lane.id)) return bad(`${where}.id is a duplicate lane id`)
    laneIds.add(lane.id)
    const entry: TimelineLane = { id: lane.id, name: lane.name }
    if (lane.color !== undefined) {
      if (typeof lane.color !== "string" || !HEX.test(lane.color)) return bad(`${where}.color must be a hex colour like #22d3ee`)
      entry.color = lane.color
    }
    lanes.push(entry)
  }

  if (!Array.isArray(raw.items) || raw.items.length === 0 || raw.items.length > MAX_TIMELINE_ITEMS) return bad(`${at}.items must be 1 to ${MAX_TIMELINE_ITEMS} entries`)
  const items: TimelineItem[] = []
  const itemIds = new Set<string>()
  for (const [index, item] of raw.items.entries()) {
    const where = `${at}.items[${index}]`
    if (!isRecord(item) || typeof item.lane !== "string" || typeof item.label !== "string" || item.at === undefined) return bad(`${where} must be {lane, at, label}`)
    const key = stray(item, TIMELINE_ITEM_FIELDS)
    if (key) return bad(`${where}.${key} is not a field of a timeline item`)
    if (!laneIds.has(item.lane)) return bad(`${where}.lane is not one of the panel's lane ids`)
    if (!instant(item.at)) return bad(`${where}.at must be an ISO 8601 date-time, like 2026-09-01T08:00:00Z`)
    if (!text(item.label, MAX_ITEM_LABEL)) return bad(tooLong(`${where}.label`, MAX_ITEM_LABEL, item.label))
    const entry: TimelineItem = { lane: item.lane, at: item.at, label: item.label }
    if (item.id !== undefined) {
      if (!text(item.id, 64)) return bad(tooLong(`${where}.id`, 64, item.id))
      if (itemIds.has(item.id)) return bad(`${where}.id is a duplicate item id`)
      itemIds.add(item.id)
      entry.id = item.id
    }
    if (item.detail !== undefined) {
      if (!text(item.detail, MAX_ITEM_DETAIL)) return bad(tooLong(`${where}.detail`, MAX_ITEM_DETAIL, item.detail))
      entry.detail = item.detail
    }
    if (item.url !== undefined) {
      if (!httpUrl(item.url)) return bad(`${where}.url must be an http or https URL`)
      entry.url = item.url
    }
    if (item.value !== undefined) {
      if (!finite(item.value) || item.value < 0) return bad(`${where}.value must be zero or a positive number`)
      entry.value = item.value
    }
    items.push(entry)
  }

  const panel: TimelinePanel = { kind: "timeline", lanes, items }
  if (raw.links !== undefined) {
    if (!Array.isArray(raw.links) || raw.links.length > MAX_LINKS) return bad(`${at}.links must be up to ${MAX_LINKS} entries`)
    panel.links = []
    for (const [index, link] of raw.links.entries()) {
      const where = `${at}.links[${index}]`
      if (!isRecord(link) || typeof link.from !== "string" || typeof link.to !== "string") return bad(`${where} must be {from, to}`)
      const key = stray(link, LINK_FIELDS)
      if (key) return bad(`${where}.${key} is not a field of a timeline link`)
      for (const end of ["from", "to"] as const) {
        if (!itemIds.has(link[end] as string)) return bad(`${where}.${end} is not an item id`)
      }
      const entry: TimelineLink = { from: link.from, to: link.to }
      if (link.kind !== undefined) {
        if (typeof link.kind !== "string" || !LINK_KINDS.has(link.kind)) return bad(`${where}.kind must be contradicts, follows or same`)
        entry.kind = link.kind as TimelineLink["kind"]
      }
      panel.links.push(entry)
    }
  }
  for (const edge of ["from", "to"] as const) {
    if (raw[edge] === undefined) continue
    if (!instant(raw[edge])) return bad(`${at}.${edge} must be an ISO 8601 date-time, like 2026-09-01T08:00:00Z`)
    panel[edge] = raw[edge]
  }
  return { ok: true, value: panel }
}

/** A knowledge graph, checked against itself: every edge and the focus must land on a real node. */
function parseGraph3d(raw: Record<string, unknown>, at: string): BigscreenResult<Graph3dPanel> {
  if (!Array.isArray(raw.nodes) || raw.nodes.length === 0 || raw.nodes.length > MAX_NODES) return bad(`${at}.nodes must be 1 to ${MAX_NODES} entries`)
  const nodes: Graph3dNode[] = []
  const ids = new Set<string>()
  for (const [index, node] of raw.nodes.entries()) {
    const where = `${at}.nodes[${index}]`
    if (!isRecord(node) || !text(node.id, 64) || typeof node.name !== "string") return bad(`${where} must be {id, name}`)
    const key = stray(node, NODE_FIELDS)
    if (key) return bad(`${where}.${key} is not a field of a graph3d node`)
    if (!text(node.name, MAX_NODE_NAME)) return bad(tooLong(`${where}.name`, MAX_NODE_NAME, node.name))
    if (ids.has(node.id)) return bad(`${where}.id is a duplicate node id`)
    ids.add(node.id)
    const entry: Graph3dNode = { id: node.id, name: node.name }
    if (node.type !== undefined) {
      if (!text(node.type, MAX_TYPE_NAME)) return bad(tooLong(`${where}.type`, MAX_TYPE_NAME, node.type))
      entry.type = node.type
    }
    if (node.value !== undefined) {
      if (!finite(node.value) || node.value < 0) return bad(`${where}.value must be zero or a positive number`)
      entry.value = node.value
    }
    nodes.push(entry)
  }

  if (!Array.isArray(raw.edges) || raw.edges.length > MAX_EDGES) return bad(`${at}.edges must be up to ${MAX_EDGES} entries`)
  const edges: Graph3dEdge[] = []
  for (const [index, edge] of raw.edges.entries()) {
    const where = `${at}.edges[${index}]`
    if (!isRecord(edge) || typeof edge.from !== "string" || typeof edge.to !== "string") return bad(`${where} must be {from, to}`)
    const key = stray(edge, EDGE_FIELDS)
    if (key) return bad(`${where}.${key} is not a field of a graph3d edge`)
    for (const end of ["from", "to"] as const) {
      if (!ids.has(edge[end] as string)) return bad(`${where}.${end} is not a node id`)
    }
    const entry: Graph3dEdge = { from: edge.from, to: edge.to }
    if (edge.type !== undefined) {
      if (!text(edge.type, MAX_TYPE_NAME)) return bad(tooLong(`${where}.type`, MAX_TYPE_NAME, edge.type))
      entry.type = edge.type
    }
    edges.push(entry)
  }

  const panel: Graph3dPanel = { kind: "graph3d", nodes, edges }
  if (raw.types !== undefined) {
    if (!isRecord(raw.types) || Object.keys(raw.types).length > MAX_TYPES) return bad(`${at}.types must be up to ${MAX_TYPES} entries`)
    const types: Record<string, string> = {}
    for (const [name, colour] of Object.entries(raw.types)) {
      if (!text(name, MAX_TYPE_NAME)) return bad(tooLong(`${at}.types key`, MAX_TYPE_NAME, name))
      if (typeof colour !== "string" || !HEX.test(colour)) return bad(`${at}.types.${name} must be a hex colour like #22d3ee`)
      types[name] = colour
    }
    panel.types = types
  }
  if (raw.focus !== undefined) {
    if (typeof raw.focus !== "string" || !ids.has(raw.focus)) return bad(`${at}.focus is not a node id`)
    panel.focus = raw.focus
  }
  // Written down rather than left undefined: the default is a decision, and a host reading the
  // parsed screen back should not have to know which way it went.
  if (raw.mode !== undefined && raw.mode !== "orbit" && raw.mode !== "flat") return bad(`${at}.mode must be orbit or flat`)
  panel.mode = (raw.mode as Graph3dPanel["mode"]) ?? "orbit"
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
    case "timeline":
      parsed = parseTimeline(raw, at)
      break
    case "graph3d":
      parsed = parseGraph3d(raw, at)
      break
  }
  if (!parsed.ok) return parsed
  const panel = parsed.value
  if (raw.title !== undefined) {
    if (!text(raw.title, 80)) return bad(tooLong(`${at}.title`, 80, raw.title))
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
    if (!text(raw.title, 80)) return bad(tooLong("title", 80, raw.title))
    definition.title = raw.title
  }
  if (raw.subtitle !== undefined) {
    if (!text(raw.subtitle, 120)) return bad(tooLong("subtitle", 120, raw.subtitle))
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
