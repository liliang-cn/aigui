import type { AIGuiPlugin, ASTNode, NodeRenderContext, RenderOutput } from "@ai-gui/core"
import { parseQuote } from "./parse"
import { quotePromptSpec } from "./prompt"
import { renderQuoteSVG, summaryText } from "./render"
import type { QuoteOptions } from "./types"

export { quotePromptSpec } from "./prompt"
export { parseQuote } from "./parse"
export { renderQuoteSVG, summaryText } from "./render"
export { bollinger, change, ema, macd, parseIndicator, rsi, sma } from "./indicators"
export type { Bar, Bollinger, Line, Macd } from "./indicators"
export type { MarkDef, QuoteDefinition, QuoteError, QuoteOptions, QuoteResult } from "./types"

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export const quoteCss = [
  "[data-aigui-quote-figure]{max-width:100%;margin-block:0.75rem}",
  "[data-aigui-quote-figure] svg{display:block;max-width:100%;height:auto}",
  "[data-aigui-quote-summary]{margin-top:0.3rem;font-size:0.875rem;text-align:center;opacity:0.85}",
  "[data-aigui-quote-caption]{margin-top:0.2rem;font-size:0.875rem;opacity:0.7;text-align:center}",
  "[data-aigui-quote-loading]{min-height:8rem;border-radius:0.5rem;background:currentColor;opacity:0.06}",
  "[data-aigui-quote-error]{padding:0.5rem 0.75rem;border-radius:0.5rem;font-size:0.875rem;opacity:0.8;background:currentColor}",
].join("")

/**
 * Candlestick charts: the bars come from the host or a market-data tool, and every indicator is
 * computed here.
 *
 * This plugin sits the other way round from the teaching ones. There, the model states conditions
 * and the renderer derives the answer, because the answer follows from the conditions. A price does
 * not follow from anything — it is an outside fact — so the model's job here is to relay, not to
 * derive, and the protocol's job is to make relaying the only thing it can do.
 *
 * Three guards, none of which needs to know what the price really was. A bar whose high is below
 * its close is impossible whatever the truth; indicators are named rather than valued, so a
 * hand-computed moving average cannot reach the chart; and there is no field for a view on the
 * market, because a view rendered as a mark reads as something the data supports.
 */
export function quote(options: QuoteOptions = {}): AIGuiPlugin {
  const render = (node: ASTNode, context?: NodeRenderContext): RenderOutput => {
    if (node.complete === false) {
      return { kind: "html", html: '<div data-aigui-quote-loading aria-label="Loading chart"></div>' }
    }
    const parsed = parseQuote(node.content ?? "", options)
    if (!parsed.ok) {
      const message = escapeHtml(parsed.error.message)
      return { kind: "html", html: `<div data-aigui-quote-error role="img" aria-label="${message}">${message}</div>`, trusted: true }
    }
    let svg: string
    let summary: string
    try {
      svg = renderQuoteSVG(parsed.value, options, context?.theme, context?.locale)
      summary = summaryText(parsed.value, context?.locale)
    } catch {
      return { kind: "html", html: '<div data-aigui-quote-error role="img" aria-label="Chart could not be drawn.">Chart could not be drawn.</div>', trusted: true }
    }
    const caption = parsed.value.caption ? `<div data-aigui-quote-caption>${escapeHtml(parsed.value.caption)}</div>` : ""
    return {
      kind: "html",
      html: `<figure data-aigui-quote-figure>${svg}<div data-aigui-quote-summary>${escapeHtml(summary)}</div>${caption}</figure>`,
      trusted: true,
    }
  }

  return {
    name: "quote",
    css: quoteCss,
    nodeRenderers: { quote: render },
    isBlockComplete: (_type, raw) => {
      const text = raw.trim()
      if (!text.startsWith("{") || !text.endsWith("}")) return false
      try {
        JSON.parse(text)
        return true
      } catch {
        return false
      }
    },
    promptSpec: (locale) => quotePromptSpec(locale),
  }
}
