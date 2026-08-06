import { readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { buildSystemPrompt, collectNodeRenderers, type ASTNode, type RenderOutput } from "@ai-gui/core"
import { parseQuote, quote, quotePromptSpec, summaryText } from "./index"

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures")
const draw = (content: string, context?: { theme?: string; locale?: string }): RenderOutput =>
  collectNodeRenderers([quote()]).quote({ key: "0:0", type: "quote", content, complete: true } as ASTNode, context) as RenderOutput

const reason = (value: unknown): string => {
  const result = parseQuote(typeof value === "string" ? value : JSON.stringify(value))
  if (result.ok) throw new Error("expected the definition to be rejected")
  return result.error.message
}

const BARS = [
  { date: "2026-07-23", open: 321.73, high: 323.3, low: 319.35, close: 321.66, volume: 40840800 },
  { date: "2026-07-24", open: 321.79, high: 334.37, low: 321.62, close: 333.02, volume: 47489400 },
]
const CHART = JSON.stringify({ symbol: "AAPL", series: BARS, indicators: ["ma5"] })

describe("the quote plugin", () => {
  it("claims the quote fence", () => {
    expect(Object.keys(collectNodeRenderers([quote()]))).toEqual(["quote"])
  })
  it("renders candles as an SVG with nothing to load", () => {
    const output = draw(CHART)
    if (output.kind === "html") {
      expect(output.html).toContain("<svg")
      expect(output.html).toContain("<rect")
      expect(output.html).toContain("data-aigui-quote-summary")
    }
  })
  it("is a pure function of the definition", () => {
    expect((draw(CHART) as { html: string }).html).toBe((draw(CHART) as { html: string }).html)
  })
  it("draws rising bars red for a Chinese reader and green for everyone else", () => {
    // Red is up in Shanghai and down in New York; the wrong convention reads as its own opposite.
    const zh = draw(CHART, { locale: "zh-CN" }) as { html: string }
    const en = draw(CHART, { locale: "en" }) as { html: string }
    expect(zh.html).toContain("#d1373a")
    expect(en.html).toContain("#22a06b")
    expect(zh.html).not.toBe(en.html)
  })
  it("summarises what the series covers and what it did", () => {
    const text = summaryText({ symbol: "AAPL", series: BARS }, "zh-CN")
    expect(text).toContain("2 根K线")
    expect(text).toContain("2026-07-23")
    expect(text).toContain("+11.36")
  })
})

describe("the three guards", () => {
  it("refuses a bar that could not have happened, whatever the real price was", () => {
    // No check can prove the figures are real. This one proves they are impossible.
    expect(reason({ symbol: "X", series: [{ date: "2026-01-01", open: 10, high: 9, low: 8, close: 9.5 }] }))
      .toContain("cannot happen")
    expect(reason({ symbol: "X", series: [{ date: "2026-01-01", open: 10, high: 11, low: 10.5, close: 10.2 }] }))
      .toContain("cannot happen")
  })
  it("refuses dates that do not move forward", () => {
    expect(reason({ symbol: "X", series: [
      { date: "2026-01-02", open: 1, high: 1, low: 1, close: 1 },
      { date: "2026-01-01", open: 1, high: 1, low: 1, close: 1 },
    ] })).toContain("does not come after")
  })
  it("refuses indicator values, taking only names", () => {
    expect(reason({ symbol: "X", series: BARS, indicators: [[1, 2, 3]] })).toContain("not values")
    expect(reason({ symbol: "X", series: BARS, indicators: ["ichimoku"] })).toContain("not an indicator")
  })
  it("refuses a view on the market in a field", () => {
    // The model may hold one; it may not have it rendered as a mark, where it reads as something
    // the data supports.
    for (const field of [{ signal: "buy" }, { targetPrice: 200 }, { rating: "outperform" }, { forecast: 210 }]) {
      expect(reason({ symbol: "X", series: BARS, ...field }), JSON.stringify(field)).toContain("belongs in the text")
    }
  })
  it("refuses a mark whose dates are not in the series", () => {
    expect(reason({ symbol: "X", series: BARS, marks: [{ from: "2020-01-01" }] })).toContain("date in the series")
  })
  it("accepts a real series with every indicator it computes", () => {
    const result = parseQuote(JSON.stringify({ symbol: "AAPL", series: BARS, indicators: ["ma5", "ema12", "macd", "rsi14", "boll"] }))
    expect(result.ok).toBe(true)
  })
})

describe("quotePromptSpec", () => {
  it("carries the rule the probe was built to test", () => {
    const spec = quotePromptSpec("zh-CN")
    expect(spec).toContain("不要输出这个块")
    expect(spec).toContain("不要自己算指标")
  })
  it("is what the plugin hands buildSystemPrompt", () => {
    expect(buildSystemPrompt({ plugins: [quote()], locale: "zh-CN" })).toContain("行情图")
  })
})

/**
 * The charts a model produced, checked against the prices they were given.
 *
 * `truth.json` is real market data fetched through a quote tool. Comparing every relayed figure
 * against it is the check `plugin-resultset` exists because nothing performs: transcription is
 * where a digit goes missing.
 */
describe("the model's own charts", () => {
  const truth = JSON.parse(readFileSync(join(dir, "truth.json"), "utf8")) as Record<string, Array<Record<string, number | string>>>
  const fixtures = readdirSync(dir).filter((n) => n.endsWith(".json") && n !== "truth.json").sort()

  it("has the probe run to check against", () => {
    expect(fixtures.length).toBe(12)
  })
  it.each(fixtures)("%s parses and renders", (name) => {
    const source = readFileSync(join(dir, name), "utf8")
    const result = parseQuote(source)
    if (!result.ok) throw new Error(`${name}: ${result.error.message}`)
    const output = draw(source, { locale: "zh-CN" })
    if (output.kind === "html") {
      expect(output.html).toContain("<svg")
      expect(output.html).not.toContain("data-aigui-quote-error")
    }
  })
  it.each(fixtures)("%s relays every figure exactly as it was given", (name) => {
    const result = parseQuote(readFileSync(join(dir, name), "utf8"))
    if (!result.ok) throw new Error(result.error.message)
    const source = truth[result.value.symbol]
    if (!source) return
    const byDate = new Map(source.map((row) => [row.date as string, row]))
    for (const relayed of result.value.series) {
      const original = byDate.get(relayed.date)
      expect(original, `${name} has a bar dated ${relayed.date} that was never given`).toBeDefined()
      for (const key of ["open", "high", "low", "close"] as const) {
        expect(relayed[key], `${name} ${relayed.date} ${key}`).toBeCloseTo(original![key] as number, 6)
      }
    }
  })
})

describe("an indicator with too little history", () => {
  const short = JSON.stringify({
    symbol: "X",
    series: Array.from({ length: 8 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`, open: 10, high: 11, low: 9, close: 10 + i * 0.1,
    })),
    indicators: ["ma20", "macd", "rsi14", "boll"],
  })

  it("says what it needs rather than drawing an empty frame", () => {
    // The indicators correctly return nothing here, which is why the tests all passed while the
    // figure showed a labelled empty box — a screenshot is what caught it.
    const output = draw(short, { locale: "zh-CN" })
    if (output.kind === "html") {
      expect(output.html).toContain("数据不足")
      expect(output.html).toContain("20")
      expect(output.html).toContain("34")
    }
  })
  it("says it in English too", () => {
    const output = draw(short, { locale: "en" })
    if (output.kind === "html") expect(output.html).toContain("needs at least")
  })
  it("still draws the candles", () => {
    const output = draw(short)
    if (output.kind === "html") expect(output.html).toContain("<rect")
  })
})
