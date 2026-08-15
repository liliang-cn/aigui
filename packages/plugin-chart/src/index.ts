import {
  BarChart,
  BoxplotChart,
  CandlestickChart,
  CustomChart,
  EffectScatterChart,
  FunnelChart,
  GaugeChart,
  GraphChart,
  HeatmapChart,
  LineChart,
  LinesChart,
  MapChart,
  ParallelChart,
  PictorialBarChart,
  PieChart,
  RadarChart,
  SankeyChart,
  ScatterChart,
  SunburstChart,
  ThemeRiverChart,
  TreeChart,
  TreemapChart,
} from "echarts/charts"
import {
  AriaComponent,
  AxisPointerComponent,
  BrushComponent,
  CalendarComponent,
  DataZoomComponent,
  DatasetComponent,
  GeoComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  ParallelComponent,
  PolarComponent,
  RadarComponent,
  SingleAxisComponent,
  TimelineComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  TransformComponent,
  VisualMapComponent,
} from "echarts/components"
import { init, use, type ECharts, type EChartsCoreOption } from "echarts/core"
import { LabelLayout, UniversalTransition } from "echarts/features"
import { CanvasRenderer, SVGRenderer } from "echarts/renderers"
import { parsePartialJSON, translate, type AIGuiPlugin, type ASTNode, type MessageBundle, type NodeRenderContext, type RenderOutput } from "@ai-gui/core"

use([
  BarChart,
  BoxplotChart,
  CandlestickChart,
  CustomChart,
  EffectScatterChart,
  FunnelChart,
  GaugeChart,
  GraphChart,
  HeatmapChart,
  LineChart,
  LinesChart,
  MapChart,
  ParallelChart,
  PictorialBarChart,
  PieChart,
  RadarChart,
  SankeyChart,
  ScatterChart,
  SunburstChart,
  ThemeRiverChart,
  TreeChart,
  TreemapChart,
  AriaComponent,
  AxisPointerComponent,
  BrushComponent,
  CalendarComponent,
  DataZoomComponent,
  DatasetComponent,
  GeoComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  ParallelComponent,
  PolarComponent,
  RadarComponent,
  SingleAxisComponent,
  TimelineComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  TransformComponent,
  VisualMapComponent,
  LabelLayout,
  UniversalTransition,
  CanvasRenderer,
  SVGRenderer,
])

export interface ChartOptions {
  /**
   * Fixed pixel width, or `"container"` to size to the mount element and follow
   * it on resize. `"container"` implies a live instance (`interactive`): a
   * static SSR SVG is rendered before any element exists to measure, so there
   * is nothing honest to size it against.
   */
  width?: number | "container"
  height?: number
  /**
   * When true, complete options render a LIVE ECharts instance via the `mount`
   * RenderOutput (enabling tooltip/dataZoom/click). When false/omitted, complete
   * options render a static SSR SVG. Incomplete options always render the loading
   * placeholder regardless of this flag.
   */
  interactive?: boolean
  /**
   * When true, complete options render a LIVE ECharts instance using the
   * `echarts-gl` extension and the canvas renderer (required by WebGL) via the
   * `mount` RenderOutput. This enables 3D chart types (bar3D/scatter3D/surface/
   * line3D/globe/map3D), which have no static SSR form. `gl` implies interactive.
   * The `echarts-gl` module is lazily imported and memoized across mounts.
   */
  gl?: boolean
}

/** Memoized `echarts-gl` side-effect import, shared across all mounts. */
let glReady: Promise<unknown> | null = null
const loadGl = () => (glReady ??= import("echarts-gl"))

/** Prompt spec describing the ```chart``` fence for LLM system prompts. */
const PROMPT: MessageBundle = {
  en: {
    spec: [
      "Charts (fenced): ```chart <ECharts option JSON>```.",
      'Example: ```chart {"xAxis":{"type":"category","data":["A","B"]},"yAxis":{"type":"value"},"series":[{"type":"bar","data":[1,2]}]}```',
      "When gl mode is enabled, 3D types are available: bar3D, scatter3D, surface, line3D, globe, map3D (WebGL, live-only).",
    ].join("\n"),
  },
  "zh-CN": {
    spec: [
      "图表（围栏代码块）：```chart <ECharts option JSON>```。",
      '示例：```chart {"xAxis":{"type":"category","data":["A","B"]},"yAxis":{"type":"value"},"series":[{"type":"bar","data":[1,2]}]}```',
      "启用 gl 模式后可用 3D 类型：bar3D、scatter3D、surface、line3D、globe、map3D（WebGL，仅实时渲染）。",
    ].join("\n"),
  },
}

/**
 * The model-facing rules for charts, in the given locale (English by default).
 *
 * You rarely want this directly: `buildSystemPrompt({ registry, plugins, locale })` from
 * `@ai-gui/core` collects the card specs and every enabled plugin's spec in one call, in the
 * product's language. Reach for this only to inspect or override one plugin's rules.
 */
export function chartPromptSpec(locale?: string): string {
  return translate(PROMPT, locale, "spec")
}

/**
 * Chart plugin: claims the `chart` node type and renders an ECharts option JSON
 * to a framework-neutral SVG string via ECharts SSR. Sync, never throws.
 */
export function chart(opts: ChartOptions = {}): AIGuiPlugin {
  const fluid = opts.width === "container"
  const width = typeof opts.width === "number" ? opts.width : 600
  const height = opts.height ?? 400
  const gl = opts.gl ?? false
  const interactive = gl || fluid || (opts.interactive ?? false)

  /** Width to init with right now, and an observer that keeps following. */
  const size = (el: HTMLElement): number => {
    const w = Math.floor(el.clientWidth || el.getBoundingClientRect().width)
    return w > 0 ? w : width
  }
  const follow = (el: HTMLElement, inst: ECharts): (() => void) | undefined => {
    if (!fluid || typeof ResizeObserver === "undefined") return undefined
    const ro = new ResizeObserver(() => {
      const w = size(el)
      // Resizing to 0 (display:none, mid-layout) blanks the chart permanently.
      if (w > 0) inst.resize({ width: w })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }
  const render = (node: ASTNode, context?: NodeRenderContext): RenderOutput => {
    // ECharts picks its palette from a registered theme name, and "dark" is one it ships with.
    // Without the host's scheme a chart keeps its light plot area on a dark page.
    const chartTheme = context?.theme === "dark" ? "dark" : undefined
    const { data: option, complete } = parsePartialJSON(node.content ?? "")
    if (!complete || option == null || typeof option !== "object") {
      return { kind: "html", html: `<div data-aigui-chart-loading></div>` }
    }
    if (gl) {
      const opt = option as EChartsCoreOption
      return {
        kind: "mount",
        mount: (el: HTMLElement) => {
          let inst: ECharts | undefined
          let disposed = false
          // `echarts-gl` (WebGL) has no static SSR form and its import is async,
          // so init inside the resolved promise. `.catch` swallows failures in
          // WebGL-less environments (e.g. headless/jsdom) so no unhandled rejection.
          let unfollow: (() => void) | undefined
          loadGl()
            .then(() => {
              if (disposed) return
              // NOTE: no `renderer:"svg"` — WebGL requires the canvas renderer.
              inst = init(el, chartTheme, { width: fluid ? size(el) : width, height })
              inst.setOption(opt)
              unfollow = follow(el, inst)
            })
            .catch(() => {
              inst?.dispose()
              inst = undefined
            })
          return () => {
            disposed = true
            unfollow?.()
            inst?.dispose()
          }
        },
      }
    }
    if (interactive) {
      const opt = option as EChartsCoreOption
      return {
        kind: "mount",
        mount: (el: HTMLElement) => {
          const inst = init(el, chartTheme, { renderer: "svg", width: fluid ? size(el) : width, height })
          try {
            inst.setOption(opt)
          } catch {
            inst.dispose()
            return
          }
          const unfollow = follow(el, inst)
          return () => {
            unfollow?.()
            inst.dispose()
          }
        },
      }
    }
    let inst: ECharts | undefined
    try {
      inst = init(null, chartTheme ?? null, { renderer: "svg", ssr: true, width, height })
      inst.setOption(option as EChartsCoreOption)
      const svg = inst.renderToSVGString()
      return { kind: "html", html: svg }
    } catch (e) {
      return { kind: "html", html: `<pre data-aigui-chart-error>${String((e as Error)?.message ?? e)}</pre>` }
    } finally {
      inst?.dispose()
    }
  }
  return { name: "chart", nodeRenderers: { chart: render }, promptSpec: (locale) => chartPromptSpec(locale) }
}
