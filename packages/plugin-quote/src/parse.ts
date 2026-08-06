import { parseIndicator, type Bar } from "./indicators"
import type { QuoteDefinition, QuoteResult } from "./types"

const TOP = new Set(["symbol", "name", "series", "indicators", "marks", "caption"])
const BAR = new Set(["date", "open", "high", "low", "close", "volume"])
const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * A verdict in a field would be rendered as a mark on the chart, where it reads as something the
 * data supports. The model may say what it thinks in the prose beside the figure, where a reader
 * knows whose opinion it is.
 */
const VERDICT = /"(signal|recommendation|target|targetPrice|rating|action|forecast|prediction|advice|buy|sell)"\s*:/

const bad = (message: string): QuoteResult<never> => ({ ok: false, error: { code: "invalid-definition", message } })
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

/**
 * Validate one `quote` fence.
 *
 * The self-consistency check is the one worth understanding. Nothing here knows what a share was
 * actually worth, so no check can prove the figures are real — but a bar whose high is below its
 * close, or whose dates run backwards, is impossible whatever the truth was. It costs nothing and
 * it catches careless invention, which is the kind that happens most.
 */
export function parseQuote(source: string, options: { maxBars?: number; maxSourceBytes?: number } = {}): QuoteResult<QuoteDefinition> {
  const maxBars = options.maxBars ?? 2000
  if (new TextEncoder().encode(source).byteLength > (options.maxSourceBytes ?? 512 * 1024)) {
    return { ok: false, error: { code: "too-large", message: "Quote definition is too large." } }
  }
  let raw: unknown
  try {
    raw = JSON.parse(source)
  } catch {
    return { ok: false, error: { code: "invalid-json", message: "Quote definition is not valid JSON." } }
  }
  if (!isRecord(raw)) return bad("A quote definition must be a JSON object")
  if (VERDICT.test(source)) return bad("a view on the market belongs in the text, not in a field the chart renders")
  for (const key of Object.keys(raw)) if (!TOP.has(key)) return bad(`${key} is not a field of a quote definition`)

  if (typeof raw.symbol !== "string" || raw.symbol.trim() === "") return bad("symbol is required")
  if (raw.name !== undefined && typeof raw.name !== "string") return bad("name must be a string")
  if (!Array.isArray(raw.series) || raw.series.length === 0) return bad("series must be a non-empty array of bars")
  if (raw.series.length > maxBars) return bad(`series has more than ${maxBars} bars`)

  const series: Bar[] = []
  let previous = ""
  for (const [i, entry] of raw.series.entries()) {
    if (!isRecord(entry)) return bad(`series[${i}] must be an object`)
    for (const key of Object.keys(entry)) if (!BAR.has(key)) return bad(`series[${i}] has no field ${key}`)
    const { date, open, high, low, close, volume } = entry
    if (typeof date !== "string" || !DATE.test(date)) return bad(`series[${i}].date must be YYYY-MM-DD`)
    if (date <= previous) return bad(`series[${i}].date ${date} does not come after ${previous || "the start"}`)
    previous = date
    if (![open, high, low, close].every(num)) return bad(`series[${i}] needs numeric open, high, low and close`)
    const [o, h, l, c] = [open, high, low, close] as [number, number, number, number]
    if (h < Math.max(o, c) - 1e-9) return bad(`series[${i}] has a high of ${h} below its open or close, which cannot happen`)
    if (l > Math.min(o, c) + 1e-9) return bad(`series[${i}] has a low of ${l} above its open or close, which cannot happen`)
    if (volume !== undefined && (!num(volume) || volume < 0)) return bad(`series[${i}].volume must be a non-negative number`)
    series.push({ date, open: o, high: h, low: l, close: c, volume: volume as number | undefined })
  }

  const definition: QuoteDefinition = { symbol: raw.symbol, name: raw.name as string | undefined, series }

  if (raw.indicators !== undefined) {
    if (!Array.isArray(raw.indicators)) return bad("indicators must be an array of names")
    for (const name of raw.indicators) {
      if (typeof name !== "string") return bad("indicators must be names, not values — the values are computed here")
      if (!parseIndicator(name)) return bad(`${JSON.stringify(name)} is not an indicator this plugin computes`)
    }
    definition.indicators = raw.indicators as string[]
  }

  if (raw.marks !== undefined) {
    if (!Array.isArray(raw.marks)) return bad("marks must be an array")
    const dates = new Set(series.map((bar) => bar.date))
    for (const [i, mark] of raw.marks.entries()) {
      if (!isRecord(mark)) return bad(`marks[${i}] must be an object`)
      for (const key of Object.keys(mark)) if (!["from", "to", "label"].includes(key)) return bad(`marks[${i}] has no field ${key}`)
      if (typeof mark.from !== "string" || !dates.has(mark.from)) return bad(`marks[${i}].from must be a date in the series`)
      if (mark.to !== undefined && (typeof mark.to !== "string" || !dates.has(mark.to))) return bad(`marks[${i}].to must be a date in the series`)
      if (mark.label !== undefined && typeof mark.label !== "string") return bad(`marks[${i}].label must be a string`)
    }
    definition.marks = raw.marks as QuoteDefinition["marks"]
  }

  if (raw.caption !== undefined) {
    if (typeof raw.caption !== "string") return bad("caption must be a string")
    definition.caption = raw.caption
  }
  return { ok: true, value: definition }
}
