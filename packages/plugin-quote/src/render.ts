import { translate, type MessageBundle } from "@ai-gui/core"
import { bollinger, change, ema, macd, parseIndicator, rsi, sma, type Line } from "./indicators"
import type { QuoteDefinition, QuoteOptions } from "./types"

const LABELS: MessageBundle = {
  en: { bars: "bars", change: "change", from: "from", to: "to", volume: "volume", needs: "needs at least {n} bars" },
  "zh-CN": { bars: "根K线", change: "区间涨跌", from: "自", to: "至", volume: "成交量", needs: "数据不足，至少需要 {n} 根K线" },
}

/**
 * Rising and falling are opposite colours in Chinese and Western markets.
 *
 * Red is up in Shanghai and down in New York. A chart drawn with the wrong convention reads as
 * exactly its own opposite to someone glancing at it, which is worse than being hard to read.
 */
function palette(theme?: string, locale?: string) {
  const chineseConvention = locale?.startsWith("zh")
  const rise = chineseConvention ? "#d1373a" : "#22a06b"
  const fall = chineseConvention ? "#22a06b" : "#d1373a"
  return theme === "dark"
    ? { rise, fall, axis: "#52525b", grid: "#3f3f46", text: "#d4d4d8", mark: "#fbbf24", lines: ["#38bdf8", "#f472b6", "#a3e635", "#c084fc"] }
    : { rise, fall, axis: "#a1a1aa", grid: "#e4e4e7", text: "#3f3f46", mark: "#b45309", lines: ["#0369a1", "#be185d", "#4d7c0f", "#7c3aed"] }
}

const round = (n: number): number => Math.round(n * 100) / 100
const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const format = (n: number): string => {
  const abs = Math.abs(n)
  if (abs >= 1e8) return `${round(n / 1e8)}亿`
  if (abs >= 1e4) return `${round(n / 1e4)}万`
  return String(round(n))
}

/** The line under the figure: what the series covers and what it did, both computed. */
export function summaryText(definition: QuoteDefinition, locale?: string): string {
  const t = (key: string) => translate(LABELS, locale, key)
  const { series } = definition
  const { absolute, percent } = change(series)
  const sign = absolute >= 0 ? "+" : ""
  return `${definition.name ?? definition.symbol}　${series.length} ${t("bars")}　${series[0].date} → ${series[series.length - 1].date}　${t("change")} ${sign}${round(absolute)} (${sign}${round(percent)}%)`
}

interface Panel {
  top: number
  height: number
}

/** Render one definition to a standalone SVG string. */
export function renderQuoteSVG(definition: QuoteDefinition, options: QuoteOptions = {}, theme?: string, locale?: string): string {
  const width = options.width ?? 720
  const c = palette(theme, locale)
  const shortfall = (n: number) => translate(LABELS, locale, "needs").replace("{n}", String(n))
  const bars = definition.series
  const requested = (definition.indicators ?? []).map(parseIndicator).filter(Boolean) as Array<{ kind: string; period?: number }>
  const wantsMacd = requested.some((i) => i.kind === "macd")
  const wantsRsi = requested.some((i) => i.kind === "rsi")
  const overlays = requested.filter((i) => i.kind === "ma" || i.kind === "ema" || i.kind === "boll")

  // Panels stack: price, volume, then one per oscillator asked for.
  const priceHeight = options.height ?? 300
  const volumeHeight = 72
  const oscillatorHeight = 84
  const panels: Panel[] = []
  let cursor = 12
  const price: Panel = { top: cursor, height: priceHeight }
  panels.push(price)
  cursor += priceHeight + 26
  const volume: Panel = { top: cursor, height: volumeHeight }
  panels.push(volume)
  cursor += volumeHeight + 26
  const macdPanel = wantsMacd ? { top: cursor, height: oscillatorHeight } : undefined
  if (macdPanel) { panels.push(macdPanel); cursor += oscillatorHeight + 26 }
  const rsiPanel = wantsRsi ? { top: cursor, height: oscillatorHeight } : undefined
  if (rsiPanel) { panels.push(rsiPanel); cursor += oscillatorHeight + 26 }
  const height = cursor + 8

  const left = 54
  const right = width - 14
  const step = (right - left) / bars.length
  const bodyWidth = Math.max(1.5, Math.min(step * 0.66, 14))
  const centre = (i: number) => left + step * (i + 0.5)

  const parts: string[] = []
  const scaleFor = (panel: Panel, low: number, high: number) => (value: number) =>
    panel.top + panel.height - ((value - low) / (high - low || 1)) * panel.height

  // Price panel bounds cover the candles and every overlay drawn over them.
  const overlayLines: Array<{ name: string; line: Line; need?: number }> = []
  for (const [index, indicator] of overlays.entries()) {
    if (indicator.kind === "ma") overlayLines.push({ name: `MA${indicator.period}`, line: sma(bars, indicator.period!), need: indicator.period })
    else if (indicator.kind === "ema") {
      overlayLines.push({ name: `EMA${indicator.period}`, line: ema(bars.map((b) => b.close), indicator.period!), need: indicator.period })
    } else {
      const band = bollinger(bars)
      overlayLines.push({ name: "BOLL", line: band.upper, need: 20 }, { name: "", line: band.middle }, { name: "", line: band.lower })
    }
    void index
  }
  const priceValues = [
    ...bars.flatMap((b) => [b.high, b.low]),
    ...overlayLines.flatMap((o) => o.line.filter((v): v is number => v !== null)),
  ]
  const priceLow = Math.min(...priceValues)
  const priceHigh = Math.max(...priceValues)
  const pad = (priceHigh - priceLow) * 0.06 || 1
  const yPrice = scaleFor(price, priceLow - pad, priceHigh + pad)

  // Marked ranges sit under everything, so they read as background rather than as data.
  for (const mark of definition.marks ?? []) {
    const fromIndex = bars.findIndex((b) => b.date === mark.from)
    const toIndex = mark.to ? bars.findIndex((b) => b.date === mark.to) : fromIndex
    if (fromIndex < 0) continue
    const x1 = left + step * fromIndex
    const x2 = left + step * (Math.max(toIndex, fromIndex) + 1)
    parts.push(`<rect x="${round(x1)}" y="${price.top}" width="${round(x2 - x1)}" height="${price.height}" fill="${c.mark}" fill-opacity="0.12"/>`)
    if (mark.label) {
      parts.push(`<text x="${round((x1 + x2) / 2)}" y="${price.top + 14}" fill="${c.mark}" font-size="11" text-anchor="middle">${escapeHtml(mark.label)}</text>`)
    }
  }

  for (const panel of panels) {
    parts.push(`<rect x="${left}" y="${panel.top}" width="${right - left}" height="${panel.height}" fill="none" stroke="${c.grid}" stroke-width="1"/>`)
  }
  for (const value of [priceLow, (priceLow + priceHigh) / 2, priceHigh]) {
    const y = yPrice(value)
    parts.push(`<line x1="${left}" y1="${round(y)}" x2="${right}" y2="${round(y)}" stroke="${c.grid}" stroke-width="1" stroke-dasharray="3 3"/>`)
    parts.push(`<text x="${left - 6}" y="${round(y) + 4}" fill="${c.text}" font-size="10" text-anchor="end">${round(value)}</text>`)
  }

  // Candles.
  for (const [i, bar] of bars.entries()) {
    const up = bar.close >= bar.open
    const colour = up ? c.rise : c.fall
    const x = centre(i)
    parts.push(`<line x1="${round(x)}" y1="${round(yPrice(bar.high))}" x2="${round(x)}" y2="${round(yPrice(bar.low))}" stroke="${colour}" stroke-width="1"/>`)
    const top = yPrice(Math.max(bar.open, bar.close))
    const bottom = yPrice(Math.min(bar.open, bar.close))
    parts.push(
      `<rect x="${round(x - bodyWidth / 2)}" y="${round(top)}" width="${round(bodyWidth)}" height="${round(Math.max(bottom - top, 1))}" fill="${up ? "none" : colour}" stroke="${colour}" stroke-width="1"/>`,
    )
  }

  const drawLine = (line: Line, y: (v: number) => number, colour: string, dashed = false): void => {
    let run: string[] = []
    const flush = () => {
      if (run.length > 1) parts.push(`<polyline points="${run.join(" ")}" fill="none" stroke="${colour}" stroke-width="1.4"${dashed ? ' stroke-dasharray="4 3"' : ""}/>`)
      run = []
    }
    for (const [i, value] of line.entries()) {
      if (value === null) { flush(); continue }
      run.push(`${round(centre(i))},${round(y(value))}`)
    }
    flush()
  }

  const legend: Array<{ text: string; colour: string; faint?: boolean }> = []
  for (const [index, overlay] of overlayLines.entries()) {
    const colour = c.lines[index % c.lines.length]
    const defined = overlay.line.some((v) => v !== null)
    if (defined) drawLine(overlay.line, yPrice, colour, overlay.name === "")
    if (overlay.name) {
      // An indicator with too little history returns nothing, correctly — but a legend entry
      // pointing at a line that was never drawn reads as a bug rather than as a short series.
      legend.push(defined ? { text: overlay.name, colour } : { text: `${overlay.name} · ${shortfall(overlay.need ?? 0)}`, colour: c.text, faint: true })
    }
  }

  // Volume.
  const volumes = bars.map((b) => b.volume ?? 0)
  const volumeHigh = Math.max(...volumes, 1)
  const yVolume = scaleFor(volume, 0, volumeHigh)
  for (const [i, bar] of bars.entries()) {
    const up = bar.close >= bar.open
    const y = yVolume(bar.volume ?? 0)
    parts.push(`<rect x="${round(centre(i) - bodyWidth / 2)}" y="${round(y)}" width="${round(bodyWidth)}" height="${round(volume.top + volume.height - y)}" fill="${up ? c.rise : c.fall}" fill-opacity="0.55"/>`)
  }
  parts.push(`<text x="${left - 6}" y="${volume.top + 10}" fill="${c.text}" font-size="10" text-anchor="end">${format(volumeHigh)}</text>`)

  if (macdPanel) {
    const { dif, dea, histogram } = macd(bars)
    const values = [...dif, ...dea, ...histogram].filter((v): v is number => v !== null)
    const span = Math.max(...values.map(Math.abs), 1e-6)
    const y = scaleFor(macdPanel, -span, span)
    parts.push(`<line x1="${left}" y1="${round(y(0))}" x2="${right}" y2="${round(y(0))}" stroke="${c.axis}" stroke-width="1"/>`)
    for (const [i, value] of histogram.entries()) {
      if (value === null) continue
      const zero = y(0)
      const top = y(value)
      parts.push(`<rect x="${round(centre(i) - bodyWidth / 2)}" y="${round(Math.min(top, zero))}" width="${round(bodyWidth)}" height="${round(Math.abs(zero - top))}" fill="${value >= 0 ? c.rise : c.fall}" fill-opacity="0.6"/>`)
    }
    drawLine(dif, y, c.lines[0])
    drawLine(dea, y, c.lines[1])
    const label = dif.some((v) => v !== null) ? "MACD (12, 26, 9)" : `MACD (12, 26, 9) · ${shortfall(34)}`
    parts.push(`<text x="${left + 4}" y="${macdPanel.top + 12}" fill="${c.text}" font-size="10">${escapeHtml(label)}</text>`)
  }

  if (rsiPanel) {
    const period = requested.find((i) => i.kind === "rsi")?.period ?? 14
    const line = rsi(bars, period)
    const y = scaleFor(rsiPanel, 0, 100)
    for (const level of [30, 70]) {
      parts.push(`<line x1="${left}" y1="${round(y(level))}" x2="${right}" y2="${round(y(level))}" stroke="${c.axis}" stroke-width="1" stroke-dasharray="3 3"/>`)
      parts.push(`<text x="${left - 6}" y="${round(y(level)) + 4}" fill="${c.text}" font-size="10" text-anchor="end">${level}</text>`)
    }
    drawLine(line, y, c.lines[0])
    const label = line.some((v) => v !== null) ? `RSI(${period})` : `RSI(${period}) · ${shortfall(period + 1)}`
    parts.push(`<text x="${left + 4}" y="${rsiPanel.top + 12}" fill="${c.text}" font-size="10">${escapeHtml(label)}</text>`)
  }

  // Dates: only a few, so they stay readable however many bars there are.
  const ticks = Math.min(bars.length, 5)
  for (let i = 0; i < ticks; i++) {
    const index = Math.round(((bars.length - 1) * i) / Math.max(ticks - 1, 1))
    parts.push(`<text x="${round(centre(index))}" y="${height - 4}" fill="${c.text}" font-size="10" text-anchor="middle">${bars[index].date.slice(5)}</text>`)
  }

  let legendX = left + 6
  for (const entry of legend) {
    parts.push(`<text x="${round(legendX)}" y="${price.top + 14}" fill="${entry.colour}" font-size="11"${entry.faint ? ' opacity="0.65"' : ""}>${escapeHtml(entry.text)}</text>`)
    legendX += entry.text.length * 7 + 14
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"`,
    ` role="img" aria-label="${escapeHtml(summaryText(definition, locale))}" data-aigui-quote="${escapeHtml(definition.symbol)}">`,
    parts.join(""),
    "</svg>",
  ].join("")
}
