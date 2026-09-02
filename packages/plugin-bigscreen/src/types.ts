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

export type Panel = KpiPanel | GaugePanel | RankPanel | ChartPanel | Chart3dPanel | GlobePanel
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

export interface BigscreenOptions {
  /** Refuse a screen with more panels than this. Default 24. */
  maxPanels?: number
  /** Refuse a fence larger than this, before parsing it. Default 64 KiB. */
  maxSourceBytes?: number
  /** Host override: `false` draws everything at its final state, no count-ups, no rotation. Default true. */
  animate?: boolean
  /** Host override for the palette; a screen's own `theme` wins when set in the fence. */
  theme?: ScreenTheme
}

export interface BigscreenError {
  code: "invalid-json" | "invalid-definition" | "too-large"
  message: string
}

export type BigscreenResult<T> = { ok: true; value: T } | { ok: false; error: BigscreenError }
