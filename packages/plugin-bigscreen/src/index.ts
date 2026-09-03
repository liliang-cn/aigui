import type { AIGuiPlugin, ASTNode, NodeRenderContext, RenderOutput } from "@ai-gui/core"
import { parseBigscreen } from "./parse"
import { bigscreenPromptSpec } from "./prompt"
import type { BigscreenOptions, ScreenTheme } from "./types"

export { bigscreenPromptSpec } from "./prompt"
export { parseBigscreen } from "./parse"
export { palette, withAlpha } from "./palette"
export { chart3dOption, chartOption, formatNumber, gaugeColour, gaugeOption, globeOption, globeTexture } from "./options"
export { countriesTexture, earthColours, earthTexture } from "./earth"
export type { EarthColours } from "./earth"
export { spacedItems, timelineHeight, timelineOption, timelineWindow, TIMELINE_LABELS } from "./timeline"
export { degrees, graph3dOption, graphLegend, typeColour, GRAPH_LABELS, GRAPH_LEGEND_ROWS, GRAPH_MAX_STEPS, GRAPH_SETTLE_STEPS } from "./graph3d"
export type { GraphLegendEntry } from "./graph3d"
export {
  MAX_ARCS,
  MAX_EDGES,
  MAX_ITEMS,
  MAX_ITEM_DETAIL,
  MAX_ITEM_LABEL,
  MAX_LANES,
  MAX_LANE_NAME,
  MAX_LINKS,
  MAX_NODES,
  MAX_NODE_NAME,
  MAX_POINTS,
  MAX_TIMELINE_ITEMS,
  MAX_TYPES,
  MAX_TYPE_NAME,
  MAX_URL,
} from "./parse"
export type {
  BigscreenError,
  BigscreenEvents,
  BigscreenOptions,
  BigscreenResult,
  Chart3dPanel,
  ChartPanel,
  GaugePanel,
  GlobeFeatureCollection,
  GlobeGeometry,
  GlobePanel,
  GlobeSkin,
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

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export const bigscreenCss = [
  "[data-aigui-bigscreen]{--aigui-bs-accent:#22d3ee;--aigui-bs-text:#e2e8f0;--aigui-bs-muted:#94a3b8;box-sizing:border-box;margin-block:1rem;padding:1.1rem 1.2rem 1.3rem;border-radius:14px;color:var(--aigui-bs-text);font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'PingFang SC','Noto Sans CJK SC',sans-serif;font-variant-numeric:tabular-nums;container-type:inline-size}",
  "[data-aigui-bigscreen] *{box-sizing:border-box}",
  "[data-aigui-bigscreen='dark']{background:radial-gradient(120% 90% at 50% 0%,#0f1f3d 0%,#0a1428 45%,#050b18 100%);box-shadow:inset 0 0 0 1px rgba(56,189,248,.12),0 20px 60px rgba(0,0,0,.45)}",
  "[data-aigui-bigscreen='light']{background:linear-gradient(180deg,#f8fafc,#eef2f7);box-shadow:inset 0 0 0 1px rgba(15,23,42,.06)}",
  ".aigui-bs-head{text-align:center;margin-bottom:1rem}",
  ".aigui-bs-title{margin:0;font-size:1.5rem;font-weight:700;letter-spacing:.06em}",
  ".aigui-bs-subtitle{margin:.25rem 0 0;font-size:.85rem;color:var(--aigui-bs-muted);letter-spacing:.12em}",
  ".aigui-bs-rule{height:1px;margin:.8rem auto 0;width:70%}",
  ".aigui-bs-grid{display:grid;gap:.9rem}",
  ".aigui-bs-panel{position:relative;display:flex;flex-direction:column;min-width:0;border:1px solid;border-radius:10px;padding:.7rem .85rem .85rem;backdrop-filter:blur(6px)}",
  "[data-aigui-bigscreen='dark'] .aigui-bs-panel{background:linear-gradient(180deg,rgba(17,27,50,.82),rgba(10,18,36,.82));box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 10px 30px rgba(0,0,0,.35)}",
  "[data-aigui-bigscreen='light'] .aigui-bs-panel{background:rgba(255,255,255,.9);box-shadow:0 6px 20px rgba(15,23,42,.06)}",
  ".aigui-bs-panel-title{display:flex;align-items:center;gap:.5rem;margin:0 0 .5rem;font-size:.8rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--aigui-bs-muted)}",
  ".aigui-bs-panel-mark{display:inline-block;width:4px;height:14px;border-radius:2px}",
  // `flex:1` alone would set the basis to 0 and override a body's explicit height; grow only.
  ".aigui-bs-panel-body{position:relative;flex:1 1 auto;width:100%;min-width:0;container-type:inline-size}",
  ".aigui-bs-kpi{display:flex;flex-direction:column;gap:.35rem;justify-content:center;height:100%}",
  ".aigui-bs-kpi-row{display:flex;align-items:baseline;gap:.35rem;min-width:0}",
  ".aigui-bs-kpi-value{font-size:2rem;font-size:clamp(1.2rem,13cqi,2.6rem);font-weight:800;line-height:1.05;letter-spacing:-.01em;white-space:nowrap}",
  ".aigui-bs-kpi-unit{font-size:.95rem;color:var(--aigui-bs-muted)}",
  ".aigui-bs-kpi-meta{display:flex;gap:.7rem;font-size:.8rem;color:var(--aigui-bs-muted)}",
  ".aigui-bs-kpi-delta{font-weight:600}",
  ".aigui-bs-kpi-spark{margin-top:.2rem;opacity:.9}",
  ".aigui-bs-rank{display:flex;flex-direction:column;gap:.45rem;overflow:hidden}",
  ".aigui-bs-rank-row{display:grid;grid-template-columns:1.4rem minmax(3rem,auto) 1fr auto;align-items:center;gap:.5rem;font-size:.85rem}",
  ".aigui-bs-rank-n{font-weight:700;color:var(--aigui-bs-muted);text-align:center}",
  ".aigui-bs-rank-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  ".aigui-bs-rank-track{display:block;height:8px;border-radius:4px;overflow:hidden}",
  ".aigui-bs-rank-fill{display:block;height:100%;border-radius:4px;transition:width 1.2s cubic-bezier(.22,1,.36,1)}",
  ".aigui-bs-rank-value{color:var(--aigui-bs-muted);font-variant-numeric:tabular-nums}",
  // Over the canvas, never in front of a click meant for the graph behind it. `z-index` because
  // ECharts' own container is positioned too and is appended after this one.
  ".aigui-bs-graph-legend{position:absolute;right:.6rem;bottom:.6rem;z-index:2;display:flex;flex-direction:column;gap:.15rem;max-width:48%;padding:.3rem .45rem;border-radius:6px;background:color-mix(in srgb,currentColor 8%,transparent);font-size:.68rem;line-height:1.5;letter-spacing:.02em;color:var(--aigui-bs-muted);pointer-events:none}",
  ".aigui-bs-graph-legend-row{display:flex;align-items:center;gap:.35rem;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  ".aigui-bs-graph-legend-dot{flex:none;width:8px;height:8px;border-radius:50%}",
  ".aigui-bs-graph-legend-line{flex:none;width:12px;height:2px;border-radius:1px}",
  ".aigui-bs-note{display:flex;align-items:center;justify-content:center;height:100%;min-height:4rem;font-size:.85rem;color:var(--aigui-bs-muted)}",
  "[data-aigui-bigscreen-loading]{min-height:8rem;border-radius:14px;background:currentColor;opacity:.06}",
  ":where([data-aigui-bigscreen-error]){padding:0.5rem 0.75rem;border-radius:0.5rem;font-size:0.875rem;background:color-mix(in srgb,currentColor 8%,transparent);border:1px solid color-mix(in srgb,currentColor 25%,transparent)}",
  // Twelve columns need room. The wall used to fold at a *window* narrower than
  // 640px, which is the wrong thing to measure: dropped into a 330px side panel
  // of a 1900px window the query never fired, and four KPI cards shared three
  // hundred pixels — one character per line. A container query asks the only
  // question that matters, how wide is the wall.
  "@container (max-width:900px){.aigui-bs-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.aigui-bs-panel{grid-column:span 1!important}.aigui-bs-panel[data-aigui-bigscreen-wide]{grid-column:span 2!important}}",
  "@container (max-width:520px){.aigui-bs-grid{grid-template-columns:1fr!important}.aigui-bs-panel,.aigui-bs-panel[data-aigui-bigscreen-wide]{grid-column:span 1!important}}",
].join("")

function failed(message: string): RenderOutput {
  const text = escapeHtml(message)
  return { kind: "html", html: `<div data-aigui-bigscreen-error role="img" aria-label="${text}">${text}</div>`, trusted: true }
}

/**
 * A data wall: KPIs that count up, gauges that sweep, ranks that grow, charts that draw
 * themselves, and 3D bars and globes that turn — laid out on a grid the model chooses.
 *
 * The screen is presentation, not evidence. Where the numbers must be the host's — a BI board
 * over real queries — `@ai-gui/plugin-dashboard` is the block, and it refuses to let the model
 * write a row. This one lets the model lay out the numbers it was given, which is what a
 * summary, a demo or a briefing needs, and the prompt spec tells it never to invent them.
 */
export function bigscreen(options: BigscreenOptions = {}): AIGuiPlugin {
  const render = (node: ASTNode, context?: NodeRenderContext): RenderOutput => {
    if (node.complete === false) {
      return { kind: "html", html: '<div data-aigui-bigscreen-loading aria-label="Loading screen"></div>' }
    }
    const theme = options.theme ?? (context?.theme === "light" ? "light" : context?.theme === "dark" ? "dark" : undefined)
    const parsed = parseBigscreen(node.content ?? "", { ...options, theme: theme as ScreenTheme | undefined })
    if (!parsed.ok) return failed(parsed.error.message)
    const definition = parsed.value
    return {
      kind: "mount",
      mount: (el) => {
        let destroy: (() => void) | undefined
        let disposed = false
        void import("./mount")
          .then(({ mountScreen }) => {
            if (disposed) return
            destroy = mountScreen(el, definition, options.animate !== false, options.globe, options.events)
          })
          .catch(() => {
            const error = document.createElement("div")
            error.setAttribute("data-aigui-bigscreen-error", "")
            error.setAttribute("role", "img")
            error.setAttribute("aria-label", "Screen could not be drawn.")
            error.textContent = "Screen could not be drawn."
            el.replaceChildren(error)
          })
        return () => {
          disposed = true
          destroy?.()
        }
      },
    }
  }

  return {
    name: "bigscreen",
    css: bigscreenCss,
    nodeRenderers: { bigscreen: render },
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
    promptSpec: (locale) => bigscreenPromptSpec(locale),
  }
}
