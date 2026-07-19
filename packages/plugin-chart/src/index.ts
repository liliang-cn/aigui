import * as echarts from "echarts"
import { parsePartialJSON, type AIGuiPlugin, type ASTNode, type RenderOutput } from "@aigui/core"

export interface ChartOptions {
  width?: number
  height?: number
}

/** Prompt spec describing the ```chart``` fence for LLM system prompts. */
export function chartPromptSpec(): string {
  return [
    "Charts (fenced): ```chart <ECharts option JSON>```.",
    'Example: ```chart {"xAxis":{"type":"category","data":["A","B"]},"yAxis":{"type":"value"},"series":[{"type":"bar","data":[1,2]}]}```',
  ].join("\n")
}

/**
 * Chart plugin: claims the `chart` node type and renders an ECharts option JSON
 * to a framework-neutral SVG string via ECharts SSR. Sync, never throws.
 */
export function chart(opts: ChartOptions = {}): AIGuiPlugin {
  const width = opts.width ?? 600
  const height = opts.height ?? 400
  const render = (node: ASTNode): RenderOutput => {
    const { data: option, complete } = parsePartialJSON(node.content ?? "")
    if (!complete || option == null || typeof option !== "object") {
      return { kind: "html", html: `<div data-aigui-chart-loading></div>` }
    }
    try {
      const inst = echarts.init(null, null, { renderer: "svg", ssr: true, width, height })
      inst.setOption(option as echarts.EChartsCoreOption)
      const svg = inst.renderToSVGString()
      inst.dispose()
      return { kind: "html", html: svg }
    } catch (e) {
      return { kind: "html", html: `<pre data-aigui-chart-error>${String((e as Error)?.message ?? e)}</pre>` }
    }
  }
  return { name: "chart", nodeRenderers: { chart: render } }
}
