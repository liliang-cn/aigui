/** A number, or a constant expression such as `"2*pi"` — what a question actually says. */
export type Endpoint = number | string

export interface CurveDef {
  id: string
  expr: string
  domain?: [Endpoint, Endpoint]
  label?: string
}

export type MarkDef =
  | { tangent: { of: string; at: Endpoint } }
  | { area: { of?: string; between?: [string, string]; from: Endpoint; to: Endpoint } }
  | { riemann: { of: string; from: Endpoint; to: Endpoint; n: number; rule?: "left" | "right" | "mid" } }
  | { point: { on: string; at: Endpoint; label?: string } }
  | { asymptote: { x?: number; y?: number } }
  | { derivative: { of: string; label?: string } }

export interface FunctionDefinition {
  plot: CurveDef[]
  view?: { x?: [Endpoint, Endpoint]; y?: [Endpoint, Endpoint] }
  marks?: MarkDef[]
  caption?: string
}

export interface FunctionOptions {
  /** Figure width in CSS pixels. */
  width?: number
  /** Figure height in CSS pixels. */
  height?: number
  /** How many points each curve is sampled at. */
  samples?: number
  /** Refuse a definition asking for more curves than this. */
  maxCurves?: number
  /** Refuse a fence larger than this, before parsing it. */
  maxSourceBytes?: number
}

export interface FunctionError {
  code: "invalid-json" | "invalid-definition" | "too-large"
  message: string
}

export type FunctionResult<T> = { ok: true; value: T } | { ok: false; error: FunctionError }

/** A rectangle in data space: the window the figure is drawn through. */
export interface Viewport {
  x: [number, number]
  y: [number, number]
}
