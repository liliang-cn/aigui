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
import { parsePartialJSON, type AIGuiPlugin, type ASTNode, type NodeRenderContext, type RenderOutput } from "@ai-gui/core"

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
  width?: number
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
export function chartPromptSpec(): string {
  return [
    "Charts (fenced): ```chart <ECharts option JSON>```.",
    'Example: ```chart {"xAxis":{"type":"category","data":["A","B"]},"yAxis":{"type":"value"},"series":[{"type":"bar","data":[1,2]}]}```',
    "When gl mode is enabled, 3D types are available: bar3D, scatter3D, surface, line3D, globe, map3D (WebGL, live-only).",
  ].join("\n")
}

/**
 * Chart plugin: claims the `chart` node type and renders an ECharts option JSON
 * to a framework-neutral SVG string via ECharts SSR. Sync, never throws.
 */
export function chart(opts: ChartOptions = {}): AIGuiPlugin {
  const width = opts.width ?? 600
  const height = opts.height ?? 400
  const gl = opts.gl ?? false
  const interactive = gl || (opts.interactive ?? false)
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
          loadGl()
            .then(() => {
              if (disposed) return
              // NOTE: no `renderer:"svg"` — WebGL requires the canvas renderer.
              inst = init(el, chartTheme, { width, height })
              inst.setOption(opt)
            })
            .catch(() => {
              inst?.dispose()
              inst = undefined
            })
          return () => {
            disposed = true
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
          const inst = init(el, chartTheme, { renderer: "svg", width, height })
          try {
            inst.setOption(opt)
          } catch {
            inst.dispose()
            return
          }
          return () => inst.dispose()
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
  return { name: "chart", nodeRenderers: { chart: render }, promptSpec: chartPromptSpec() }
}
