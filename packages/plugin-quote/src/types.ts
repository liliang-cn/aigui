import type { Bar } from "./indicators"

export interface MarkDef {
  from: string
  to?: string
  label?: string
}

export interface QuoteDefinition {
  symbol: string
  name?: string
  series: Bar[]
  indicators?: string[]
  marks?: MarkDef[]
  caption?: string
}

export interface QuoteOptions {
  width?: number
  height?: number
  /** Refuse a series longer than this. */
  maxBars?: number
  maxSourceBytes?: number
}

export interface QuoteError {
  code: "invalid-json" | "invalid-definition" | "too-large"
  message: string
}

export type QuoteResult<T> = { ok: true; value: T } | { ok: false; error: QuoteError }
