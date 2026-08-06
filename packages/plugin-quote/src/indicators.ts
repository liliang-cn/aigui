/**
 * The indicators, computed from the bars rather than taken from the model.
 *
 * A twenty-day moving average is twenty additions and a division, done twenty times over — a model
 * asked for the numbers will produce something plausible and wrong, and an indicator line is the
 * last place anyone would check. The protocol therefore takes the *name* of an indicator and never
 * its values.
 */

export interface Bar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

/** A value per bar, with `null` wherever there is not yet enough history to have one. */
export type Line = Array<number | null>

/** Simple moving average of the closes. */
export function sma(bars: Bar[], period: number): Line {
  const out: Line = []
  let sum = 0
  for (const [i, bar] of bars.entries()) {
    sum += bar.close
    if (i >= period) sum -= bars[i - period].close
    out.push(i >= period - 1 ? sum / period : null)
  }
  return out
}

/**
 * Exponential moving average.
 *
 * Seeded with the simple average of the first `period` closes, which is what every charting package
 * does; seeding with the first close alone leaves a visible hook at the start of the line.
 */
export function ema(values: number[], period: number): Line {
  const out: Line = new Array(values.length).fill(null)
  if (values.length < period) return out
  const k = 2 / (period + 1)
  let previous = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  out[period - 1] = previous
  for (let i = period; i < values.length; i++) {
    previous = values[i] * k + previous * (1 - k)
    out[i] = previous
  }
  return out
}

export interface Macd {
  dif: Line
  dea: Line
  histogram: Line
}

/**
 * MACD as it is drawn on a Chinese chart: DIF, DEA, and a histogram of twice their difference.
 *
 * The doubling is a convention rather than a derivation, and leaving it out halves the bars against
 * every other terminal the reader has seen.
 */
export function macd(bars: Bar[], fast = 12, slow = 26, signal = 9): Macd {
  const closes = bars.map((b) => b.close)
  const fastLine = ema(closes, fast)
  const slowLine = ema(closes, slow)
  const dif: Line = closes.map((_, i) =>
    fastLine[i] === null || slowLine[i] === null ? null : (fastLine[i] as number) - (slowLine[i] as number),
  )
  const defined = dif.filter((v): v is number => v !== null)
  const deaCore = ema(defined, signal)
  const offset = dif.findIndex((v) => v !== null)
  const dea: Line = new Array(dif.length).fill(null)
  if (offset >= 0) for (const [i, v] of deaCore.entries()) dea[offset + i] = v
  const histogram: Line = dif.map((v, i) => (v === null || dea[i] === null ? null : 2 * (v - (dea[i] as number))))
  return { dif, dea, histogram }
}

/**
 * Wilder's RSI.
 *
 * Wilder's smoothing, not a simple average of the last n changes: the two disagree by enough to
 * move the line across the 70 and 30 levels a reader is looking at.
 */
export function rsi(bars: Bar[], period = 14): Line {
  const out: Line = new Array(bars.length).fill(null)
  if (bars.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const change = bars[i].close - bars[i - 1].close
    if (change >= 0) gain += change
    else loss -= change
  }
  gain /= period
  loss /= period
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  for (let i = period + 1; i < bars.length; i++) {
    const change = bars[i].close - bars[i - 1].close
    gain = (gain * (period - 1) + Math.max(change, 0)) / period
    loss = (loss * (period - 1) + Math.max(-change, 0)) / period
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  }
  return out
}

export interface Bollinger {
  middle: Line
  upper: Line
  lower: Line
}

/** Bollinger bands: an n-period average and a band at `deviations` population standard deviations. */
export function bollinger(bars: Bar[], period = 20, deviations = 2): Bollinger {
  const middle = sma(bars, period)
  const upper: Line = new Array(bars.length).fill(null)
  const lower: Line = new Array(bars.length).fill(null)
  for (let i = period - 1; i < bars.length; i++) {
    const mean = middle[i] as number
    let variance = 0
    for (let j = i - period + 1; j <= i; j++) variance += (bars[j].close - mean) ** 2
    const sd = Math.sqrt(variance / period)
    upper[i] = mean + deviations * sd
    lower[i] = mean - deviations * sd
  }
  return { middle, upper, lower }
}

/** The change from the first close to the last, as a value and a percentage. */
export function change(bars: Bar[]): { absolute: number; percent: number } {
  if (bars.length < 2) return { absolute: 0, percent: 0 }
  const first = bars[0].close
  const last = bars[bars.length - 1].close
  return { absolute: last - first, percent: first === 0 ? 0 : ((last - first) / first) * 100 }
}

/** Parse an indicator name into what to compute. `ma20` and `ema12` carry their own period. */
export function parseIndicator(name: string): { kind: string; period?: number } | undefined {
  const m = /^(ma|ema|rsi)(\d+)$/.exec(name)
  if (m) return { kind: m[1], period: Number(m[2]) }
  if (name === "macd" || name === "boll") return { kind: name }
  return undefined
}
