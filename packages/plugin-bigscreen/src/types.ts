/** The palette a screen is drawn in. `dark` is the big-screen look; `light` sits on a white page. */
export type ScreenTheme = "dark" | "light"

interface PanelBase {
  title?: string
  /** How many of the screen's columns the panel takes. Default 4 of 12. */
  span?: number
  /** Body height in CSS pixels. Default depends on the kind. */
  height?: number
}

/** One number, counted up from zero when it appears, with an optional change and sparkline. */
export interface KpiPanel extends PanelBase {
  kind: "kpi"
  value: number
  unit?: string
  prefix?: string
  /** Digits after the decimal point. Default 0. */
  decimals?: number
  /** Change as a fraction: 0.12 is +12%. */
  delta?: number
  /** Whether a positive delta is good. Default true. */
  upIsGood?: boolean
  /** A short series drawn as a sparkline under the number. */
  trend?: number[]
  label?: string
}

/** A dial or a ring showing how far `value` is along `max`. */
export interface GaugePanel extends PanelBase {
  kind: "gauge"
  value: number
  max?: number
  unit?: string
  style?: "dial" | "ring"
  /** Fractions of `max` at which the colour turns amber, then red. */
  thresholds?: [number, number]
}

/** Horizontal bars, longest first, growing in when they appear. */
export interface RankPanel extends PanelBase {
  kind: "rank"
  items: Array<{ name: string; value: number }>
  unit?: string
  /** Show this many; the rest are dropped. Default 8. */
  top?: number
}

/** Any ECharts option, drawn on canvas with the screen's palette and entrance animation. */
export interface ChartPanel extends PanelBase {
  kind: "chart"
  option: Record<string, unknown>
}

/** A 3D chart over the `data` points, slowly turning. */
export interface Chart3dPanel extends PanelBase {
  kind: "chart3d"
  type: "bar3D" | "scatter3D" | "surface" | "line3D"
  /** Points as [x, y, z]; with category axes x and y are indexes into them. */
  data: Array<[number, number, number]>
  xAxis?: string[]
  yAxis?: string[]
  rotate?: boolean
}

/** A globe with arcs between places and points on it. */
export interface GlobePanel extends PanelBase {
  kind: "globe"
  arcs?: Array<{ from: [number, number]; to: [number, number]; label?: string }>
  points?: Array<{ coord: [number, number]; label?: string; value?: number }>
  rotate?: boolean
}

/** One swim-lane of a timeline: a source, an outlet, a system — whatever the rows stand for. */
export interface TimelineLane {
  id: string
  /** The name written down the left. At most 40 characters. */
  name: string
  /** The lane's colour, as a hex string. Default: from the palette, by lane order. */
  color?: string
}

/** One point on a timeline. `id` is only needed for a lane an item is linked from or to. */
export interface TimelineItem {
  id?: string
  /** The `id` of the lane the point sits on. */
  lane: string
  /** When it happened, as ISO 8601. */
  at: string
  /** The one line beside the point. At most 120 characters. */
  label: string
  /** What the tooltip adds. At most 400 characters. */
  detail?: string
  /** Opened on click, unless the host took the click. `http` or `https` only. */
  url?: string
  /** How big the point is drawn, relative to the other points. */
  value?: number
}

/**
 * A line drawn between two points.
 *
 * `contradicts` is the one this panel exists for: two claims that cannot both be true, drawn in
 * the palette's danger red across the lanes that made them.
 */
export interface TimelineLink {
  from: string
  to: string
  /** Default `follows`. */
  kind?: "contradicts" | "follows" | "same"
}

/** Lanes down the side, time across, one point per thing that happened, links between them. */
export interface TimelinePanel extends PanelBase {
  kind: "timeline"
  lanes: TimelineLane[]
  items: TimelineItem[]
  links?: TimelineLink[]
  /** The window drawn, as ISO 8601. Default: the items' own range with 5% on each side. */
  from?: string
  to?: string
}

/** One entity in a knowledge graph. */
export interface Graph3dNode {
  id: string
  /** At most 80 characters. */
  name: string
  /** What kind of thing it is; the colour follows from this. At most 32 characters. */
  type?: string
  /** How big it is drawn. Default: its degree. */
  value?: number
}

/** One typed edge. Both ends must be node ids. */
export interface Graph3dEdge {
  from: string
  to: string
  /** At most 32 characters. */
  type?: string
}

/**
 * Entities and typed edges as a knowledge graph.
 *
 * `orbit`, the default, is a real three-dimensional model: the entities are laid out in space by
 * a spring-electrical simulation and the camera turns around them. `flat` is echarts-gl's own
 * `graphGL` — force-atlas2 on the GPU, drawn on a plane with an orthographic camera — which draws
 * more nodes at once and is the mode to reach for when a graph is big enough that the third
 * dimension costs more than it shows.
 */
export interface Graph3dPanel extends PanelBase {
  kind: "graph3d"
  nodes: Graph3dNode[]
  edges: Graph3dEdge[]
  /** Type name to hex colour, overriding the palette's own assignment. At most 32 entries. */
  types?: Record<string, string>
  /** The id of the node to highlight and always label. */
  focus?: string
  /** How it is drawn: a turning 3D model, or the flat GPU layout. Default "orbit". */
  mode?: "orbit" | "flat"
  /** Whether the graph moves at all — settling, and turning. Default true. */
  rotate?: boolean
}

export type Panel = KpiPanel | GaugePanel | RankPanel | ChartPanel | Chart3dPanel | GlobePanel | TimelinePanel | Graph3dPanel
export type PanelKind = Panel["kind"]

export interface ScreenDefinition {
  title?: string
  subtitle?: string
  theme: ScreenTheme
  /** The accent colour, as a hex string. */
  accent?: string
  /** Grid columns. Default 12. */
  columns: number
  panels: Panel[]
}

/**
 * The bit of GeoJSON a globe needs: WGS84 rings, in longitude/latitude order.
 *
 * Deliberately not the whole of RFC 7946. Only the two polygon geometries are drawn, and
 * everything else on a feature is ignored, so a host can hand over `world-atlas` straight out of
 * `topojson-client` without a type assertion and without this package taking a GeoJSON
 * dependency.
 */
export type GlobeGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] }
  | { type: string; coordinates?: unknown }

export interface GlobeFeatureCollection {
  type: "FeatureCollection"
  features: Array<{ type?: string; geometry?: GlobeGeometry | null; properties?: Record<string, unknown> | null }>
}

/**
 * What the host wants the planet to look like.
 *
 * The fence says where the events are; this says what they are drawn on, and it is host
 * configuration rather than a panel field on purpose: a texture is a URL, and a URL a model
 * wrote is a request a page would be making on the model's say-so.
 *
 * Precedence is `baseTexture`, then `countries`, then the painted graticule the plugin has
 * always drawn — so a host that sets none of this gets exactly the globe it got before.
 */
export interface GlobeSkin {
  /** An equirectangular (2:1) day texture, as a URL or a data URL the host serves itself. */
  baseTexture?: string
  /** An equirectangular height map, for bump shading. Optional. */
  heightTexture?: string
  /** Country outlines to rasterise onto a 2:1 canvas when there is no `baseTexture`. */
  countries?: GlobeFeatureCollection
  /** Fill for land. Default: from the palette. */
  land?: string
  /** Fill for sea. Default: from the palette. */
  ocean?: string
  /** Stroke for country borders. Default: from the palette. */
  border?: string
  /** How the sphere is lit. Default "lambert" once a skin is given. */
  shading?: "color" | "lambert" | "realistic"
  /** The glow around the rim. Default true. */
  atmosphere?: boolean
  /**
   * The sun.
   *
   * `time` is what echarts-gl puts the main light at, so the terminator falls where the sun
   * actually is; the default is now. `ambient` is how much the night side still shows,
   * 0–1; the default 0.5 keeps coastlines readable, a host whose photograph has dark oceans
   * raises it.
   */
  light?: { intensity?: number; ambient?: number; time?: Date | string }
}

/**
 * What the host wants to happen when a reader clicks something.
 *
 * A timeline item carries a `url`, and without a handler the plugin opens it in a new tab. A host
 * that has its own idea of what a claim is — a drawer, a route, a second panel — passes
 * `onItemClick` and takes the click instead, `url` and all. There is no default for a graph node:
 * a node is not a link, so a host that wants a click to mean something has to say so.
 */
export interface BigscreenEvents {
  onItemClick?: (item: TimelineItem) => void
  onNodeClick?: (node: Graph3dNode) => void
}

export interface BigscreenOptions {
  /** Refuse a screen with more panels than this. Default 24. */
  maxPanels?: number
  /** Refuse a fence larger than this, before parsing it. Default 64 KiB. */
  maxSourceBytes?: number
  /** Host override: `false` draws everything at its final state, no count-ups, no rotation. Default true. */
  animate?: boolean
  /** Host override for the palette; a screen's own `theme` wins when set in the fence. */
  theme?: ScreenTheme
  /** Host override for what a globe panel's planet looks like. Unset draws the graticule. */
  globe?: GlobeSkin
  /** What a click on a timeline item or a graph node does. */
  events?: BigscreenEvents
}

export interface BigscreenError {
  code: "invalid-json" | "invalid-definition" | "too-large"
  message: string
}

export type BigscreenResult<T> = { ok: true; value: T } | { ok: false; error: BigscreenError }
