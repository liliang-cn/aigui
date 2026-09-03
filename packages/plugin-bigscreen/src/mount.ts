import { BarChart, EffectScatterChart, FunnelChart, GaugeChart, HeatmapChart, LineChart, LinesChart, PieChart, RadarChart, ScatterChart } from "echarts/charts"
import { DatasetComponent, GridComponent, LegendComponent, PolarComponent, RadarComponent, TitleComponent, TooltipComponent, VisualMapComponent } from "echarts/components"
import { init, use, type ECharts, type EChartsCoreOption } from "echarts/core"
import { CanvasRenderer } from "echarts/renderers"
import { earthTexture } from "./earth"
import { graph3dOption, graphLegend } from "./graph3d"
import { createLayout, layoutChunk, type Layout } from "./layout3d"
import { graphOrbitData, graphOrbitOption } from "./orbit"
import { chart3dOption, chartOption, formatNumber, gaugeOption, globeOption } from "./options"
import { palette, withAlpha, type Palette } from "./palette"
import { graphKey, recallPositions, rememberPositions } from "./positions"
import { timelineHeight, timelineOption } from "./timeline"
import type { BigscreenEvents, GlobeSkin, Graph3dNode, Graph3dPanel, KpiPanel, Panel, RankPanel, ScreenDefinition, TimelineItem, TimelinePanel } from "./types"

use([
  BarChart, LineChart, PieChart, ScatterChart, GaugeChart, RadarChart, EffectScatterChart, LinesChart, FunnelChart, HeatmapChart,
  DatasetComponent, GridComponent, LegendComponent, PolarComponent, RadarComponent, TitleComponent, TooltipComponent, VisualMapComponent,
  // Canvas, not SVG: the 3D panels need WebGL, and the count-ups and sweeps are smoother on it.
  CanvasRenderer,
])

/** Memoized `echarts-gl` side-effect import, shared across every screen on the page. */
let glReady: Promise<unknown> | null = null
const loadGl = () => (glReady ??= import("echarts-gl"))

const DEFAULT_HEIGHT: Record<Panel["kind"], number> = { kpi: 0, gauge: 180, rank: 220, chart: 240, chart3d: 280, globe: 300, timeline: 320, graph3d: 320 }

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  if (text !== undefined) node.textContent = text
  return node
}

/** Count a number up from zero, returning the cancel. */
function countUp(node: HTMLElement, panel: KpiPanel, animate: boolean): () => void {
  const decimals = panel.decimals ?? 0
  const show = (value: number) => {
    node.textContent = `${panel.prefix ?? ""}${formatNumber(value, decimals)}`
  }
  if (!animate || typeof requestAnimationFrame !== "function") {
    show(panel.value)
    return () => {}
  }
  const duration = 1400
  let start: number | undefined
  let handle = 0
  const tick = (now: number) => {
    start ??= now
    const t = Math.min(1, (now - start) / duration)
    show(panel.value * easeOut(t))
    if (t < 1) handle = requestAnimationFrame(tick)
  }
  handle = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(handle)
}

function sparkline(values: number[], c: Palette, width: number, height: number): SVGElement {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = width / (values.length - 1)
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`)
  svg.setAttribute("width", "100%")
  svg.setAttribute("height", String(height))
  svg.setAttribute("preserveAspectRatio", "none")
  svg.setAttribute("aria-hidden", "true")
  const fill = document.createElementNS("http://www.w3.org/2000/svg", "polygon")
  fill.setAttribute("points", `0,${height} ${points.join(" ")} ${width},${height}`)
  fill.setAttribute("fill", withAlpha(c.accent, 0.18))
  const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline")
  line.setAttribute("points", points.join(" "))
  line.setAttribute("fill", "none")
  line.setAttribute("stroke", c.accent)
  line.setAttribute("stroke-width", "2")
  line.setAttribute("stroke-linejoin", "round")
  line.setAttribute("vector-effect", "non-scaling-stroke")
  svg.append(fill, line)
  return svg
}

function mountKpi(body: HTMLElement, panel: KpiPanel, c: Palette, animate: boolean): () => void {
  body.classList.add("aigui-bs-kpi")
  const row = el("div", { class: "aigui-bs-kpi-row" })
  const value = el("span", { class: "aigui-bs-kpi-value" })
  value.style.color = c.accent
  value.style.textShadow = `0 0 18px ${withAlpha(c.accent, 0.45)}`
  row.appendChild(value)
  if (panel.unit) row.appendChild(el("span", { class: "aigui-bs-kpi-unit" }, panel.unit))
  body.appendChild(row)
  const meta = el("div", { class: "aigui-bs-kpi-meta" })
  if (panel.delta !== undefined) {
    const up = panel.delta >= 0
    const good = (panel.upIsGood ?? true) === up
    const delta = el("span", { class: "aigui-bs-kpi-delta" }, `${up ? "▲" : "▼"} ${formatNumber(Math.abs(panel.delta) * 100, 1)}%`)
    delta.style.color = good ? c.good : c.bad
    meta.appendChild(delta)
  }
  if (panel.label) meta.appendChild(el("span", { class: "aigui-bs-kpi-label" }, panel.label))
  if (meta.childNodes.length) body.appendChild(meta)
  if (panel.trend) {
    const holder = el("div", { class: "aigui-bs-kpi-spark" })
    holder.appendChild(sparkline(panel.trend, c, 200, 36))
    body.appendChild(holder)
  }
  return countUp(value, panel, animate)
}

function mountRank(body: HTMLElement, panel: RankPanel, c: Palette, animate: boolean): () => void {
  body.classList.add("aigui-bs-rank")
  const items = [...panel.items].sort((a, b) => b.value - a.value).slice(0, panel.top ?? 8)
  const max = Math.max(...items.map((item) => item.value), 0) || 1
  const bars: Array<{ fill: HTMLElement; width: string }> = []
  items.forEach((item, index) => {
    const row = el("div", { class: "aigui-bs-rank-row" })
    const rank = el("span", { class: "aigui-bs-rank-n" }, String(index + 1))
    if (index < 3) rank.style.color = c.accent
    const name = el("span", { class: "aigui-bs-rank-name" }, item.name)
    const track = el("span", { class: "aigui-bs-rank-track" })
    track.style.background = c.track
    const fill = el("span", { class: "aigui-bs-rank-fill" })
    const colour = index === 0 ? c.accent : c.series[(index % (c.series.length - 1)) + 1]
    fill.style.background = `linear-gradient(90deg, ${withAlpha(colour, 0.55)}, ${colour})`
    fill.style.boxShadow = `0 0 10px ${withAlpha(colour, 0.5)}`
    const width = `${Math.max(2, (Math.max(item.value, 0) / max) * 100)}%`
    fill.style.width = animate ? "0%" : width
    track.appendChild(fill)
    const value = el("span", { class: "aigui-bs-rank-value" }, `${formatNumber(item.value, Number.isInteger(item.value) ? 0 : 1)}${panel.unit ?? ""}`)
    row.append(rank, name, track, value)
    body.appendChild(row)
    bars.push({ fill, width })
  })
  if (!animate || typeof requestAnimationFrame !== "function") return () => {}
  // Two frames in, so the transition from 0% actually plays.
  const handle = requestAnimationFrame(() => requestAnimationFrame(() => bars.forEach(({ fill, width }) => (fill.style.width = width))))
  return () => cancelAnimationFrame(handle)
}

/** Keep a chart the size of its panel. */
function follow(host: HTMLElement, chart: ECharts): () => void {
  if (typeof ResizeObserver === "undefined") return () => {}
  const observer = new ResizeObserver(() => chart.resize())
  observer.observe(host)
  return () => observer.disconnect()
}

/**
 * Run `fn` once `body` has a size.
 *
 * The reconciler may call mount before the host is in the document, and ECharts initialised on
 * a 0×0 element warns and draws nothing until the first resize. Waiting a frame when the size is
 * not there yet costs nothing visible and keeps the console quiet.
 */
function whenSized(body: HTMLElement, fn: () => void): () => void {
  if (body.clientWidth > 0 || typeof requestAnimationFrame !== "function") {
    fn()
    return () => {}
  }
  const handle = requestAnimationFrame(fn)
  return () => cancelAnimationFrame(handle)
}

function mountChart(body: HTMLElement, option: EChartsCoreOption, theme: "dark" | "light", ready?: (chart: ECharts) => void): () => void {
  let chart: ECharts | undefined
  let unfollow: (() => void) | undefined
  const cancel = whenSized(body, () => {
    chart = init(body, theme === "dark" ? "dark" : undefined, { renderer: "canvas" })
    chart.setOption(option)
    ready?.(chart)
    unfollow = follow(body, chart)
  })
  return () => {
    cancel()
    unfollow?.()
    chart?.dispose()
  }
}

/**
 * A chart that needs WebGL, with an optional loop running against it.
 *
 * `ready` may hand back a teardown of its own — the settling loop does — and it is run before the
 * chart is disposed, because a frame that lands on a disposed chart throws.
 */
function mountGl(body: HTMLElement, build: () => EChartsCoreOption, theme: "dark" | "light", fallback: () => void, ready?: (chart: ECharts) => (() => void) | void): () => void {
  let chart: ECharts | undefined
  let unfollow: (() => void) | undefined
  let cancel: (() => void) | undefined
  let stop: (() => void) | undefined
  let disposed = false
  loadGl()
    .then(() => {
      if (disposed) return
      cancel = whenSized(body, () => {
        if (disposed) return
        chart = init(body, theme === "dark" ? "dark" : undefined, { renderer: "canvas" })
        chart.setOption(build())
        stop = ready?.(chart) ?? undefined
        unfollow = follow(body, chart)
      })
    })
    .catch(() => {
      if (disposed) return
      chart?.dispose()
      chart = undefined
      fallback()
    })
  return () => {
    disposed = true
    cancel?.()
    stop?.()
    unfollow?.()
    chart?.dispose()
  }
}

function note(body: HTMLElement, text: string): void {
  body.replaceChildren(el("div", { class: "aigui-bs-note" }, text))
}

/**
 * What a click on a claim does.
 *
 * The host wins. A page that passed `onItemClick` has its own idea of what a claim is — a drawer,
 * a route, a second panel — and must not also get a tab it never asked for. With no handler the
 * claim's own `url` opens in a new tab with the opener cut off; the parser has already refused
 * anything that is not `http` or `https`, because this argument reaches `window.open`.
 */
export function openTimelineItem(item: TimelineItem, events?: BigscreenEvents): void {
  if (events?.onItemClick) {
    events.onItemClick(item)
    return
  }
  if (item.url && typeof window !== "undefined") window.open(item.url, "_blank", "noopener,noreferrer")
}

function bindTimeline(chart: ECharts, events: BigscreenEvents | undefined): void {
  chart.on("click", (params: unknown) => {
    const item = (params as { data?: { item?: TimelineItem } }).data?.item
    if (item) openTimelineItem(item, events)
  })
}

function bindGraph(chart: ECharts, events: BigscreenEvents | undefined): void {
  chart.on("click", (params: unknown) => {
    const event = params as { dataType?: string; data?: { node?: Graph3dNode } }
    if (event.dataType === "edge") return
    const node = event.data?.node
    if (node) events?.onNodeClick?.(node)
  })
}

/**
 * Step the layout in front of the reader, and stop.
 *
 * A knowledge graph pulling itself apart is the panel telling you what it found: the clusters
 * arrive one after another and you watch which entities go with which. So the layout is stepped a
 * few steps per frame rather than run to convergence behind a promise, and only the two series'
 * data is pushed each time — merged, not replaced, so the camera and the lights survive the
 * update and the graph does not jump back to its opening pose sixty times a second.
 *
 * When it has settled the loop ends for good and the positions are remembered, which is what lets
 * the next render of the same fence resume rather than reshuffle. The camera keeps turning after:
 * that is echarts-gl's own animation, not this one.
 */
function settleGraph(chart: ECharts, panel: Graph3dPanel, c: Palette, layout: Layout, key: string): () => void {
  const ids = panel.nodes.map((node) => node.id)
  const remember = (): void => rememberPositions(key, ids, layout.positions())
  if (layout.done || typeof requestAnimationFrame !== "function") {
    remember()
    return () => {}
  }
  const chunk = layoutChunk(panel.nodes.length)
  const tick = (): void => {
    layout.step(chunk)
    const data = graphOrbitData(panel, c, layout.positions())
    // Merged rather than replaced, so the camera, the lights and the box survive the update —
    // and applied now rather than lazily, because this already runs once per animation frame and
    // deferring it to ECharts' own next one only puts the picture a frame behind the layout.
    chart.setOption({ series: [{ data: data.edges }, { data: data.nodes }] }, { notMerge: false, lazyUpdate: false })
    if (layout.done) {
      remember()
      return
    }
    handle = requestAnimationFrame(tick)
  }
  let handle = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(handle)
}

/**
 * The key to a graph's colours, in HTML over the canvas.
 *
 * HTML rather than an ECharts legend: the graph is a WebGL series with no categories for a legend
 * component to read, and a corner of text a reader can select beats a row of chart furniture. It
 * is `pointer-events:none` so it never eats a click meant for the graph behind it, and an untyped
 * graph gets nothing at all rather than an empty box.
 *
 * It hangs off the panel rather than off the chart's own element, because ECharts empties the
 * element it is initialised on — a legend appended there is gone the moment the graph appears,
 * which is exactly what happened the first time this was drawn.
 */
function graphLegendNode(panel: Graph3dPanel, c: Palette): HTMLElement | undefined {
  const entries = graphLegend(panel, c)
  if (!entries.length) return undefined
  const box = el("div", { class: "aigui-bs-graph-legend" })
  for (const entry of entries) {
    const row = el("div", { class: "aigui-bs-graph-legend-row" })
    const swatch = el("i", { class: `aigui-bs-graph-legend-${entry.shape === "node" ? "dot" : "line"}` })
    swatch.style.background = entry.colour
    row.append(swatch, document.createTextNode(entry.label))
    box.appendChild(row)
  }
  return box
}

/** The body height a panel gets when it did not ask for one. */
function bodyHeight(panel: Panel): number {
  // A timeline is the one panel whose height is a function of its content: below 28 pixels a lane
  // the points of two neighbouring sources touch, and the line between two contradicting claims
  // stops being a line between two rows.
  if (panel.kind === "timeline") return timelineHeight(panel.lanes.length)
  return DEFAULT_HEIGHT[panel.kind]
}

function mountPanel(panel: Panel, definition: ScreenDefinition, c: Palette, animate: boolean, earth: GlobeSkin | undefined, events: BigscreenEvents | undefined): { node: HTMLElement; destroy: () => void } {
  const node = el("section", { class: "aigui-bs-panel", "data-aigui-bigscreen-panel": panel.kind })
  const span = Math.min(panel.span ?? 4, definition.columns)
  node.style.gridColumn = `span ${span}`
  // Marked so a narrowed wall can keep the wide panels wide. A chart the model
  // gave more than half the grid to is wide because it needs to be; collapsing
  // it to the same width as a KPI card is how a two-column fallback turns a
  // readable chart into a smear.
  if (span * 2 > definition.columns) node.setAttribute("data-aigui-bigscreen-wide", "")
  node.style.borderColor = withAlpha(c.accent, definition.theme === "dark" ? 0.22 : 0.18)
  if (panel.title) {
    const head = el("header", { class: "aigui-bs-panel-title" }, panel.title)
    const mark = el("i", { class: "aigui-bs-panel-mark" })
    mark.style.background = c.accent
    mark.style.boxShadow = `0 0 8px ${c.accent}`
    head.prepend(mark)
    node.appendChild(head)
  }
  const body = el("div", { class: "aigui-bs-panel-body" })
  const height = panel.height ?? bodyHeight(panel)
  if (height) body.style.height = `${height}px`
  node.appendChild(body)
  let destroy: () => void = () => {}
  try {
    switch (panel.kind) {
      case "kpi":
        destroy = mountKpi(body, panel, c, animate)
        break
      case "rank":
        destroy = mountRank(body, panel, c, animate)
        break
      case "gauge":
        destroy = mountChart(body, gaugeOption(panel, c, animate), definition.theme)
        break
      case "chart":
        destroy = mountChart(body, chartOption(panel, c, animate), definition.theme)
        break
      case "chart3d":
        destroy = mountGl(body, () => chart3dOption(panel, c, animate), definition.theme, () => note(body, "3D panels need echarts-gl and WebGL."))
        break
      case "globe":
        destroy = mountGl(body, () => globeOption(panel, c, animate, earthTexture(c, definition.theme, earth), earth), definition.theme, () => note(body, "Globe panels need echarts-gl and WebGL."))
        break
      case "timeline":
        destroy = mountChart(body, timelineOption(panel, c, animate), definition.theme, (chart) => bindTimeline(chart, events))
        break
      case "graph3d": {
        const legend = graphLegendNode(panel, c)
        if (legend) node.appendChild(legend)
        const missing = (): void => {
          legend?.remove()
          note(body, "Knowledge graph panels need echarts-gl and WebGL.")
        }
        if (panel.mode === "flat") {
          destroy = mountGl(body, () => graph3dOption(panel, c, animate), definition.theme, missing, (chart) => bindGraph(chart, events))
          break
        }
        const key = graphKey(panel)
        const layout = createLayout(panel.nodes, panel.edges, recallPositions(key))
        // Nothing is meant to move: spend the whole layout before the first paint and hand over
        // the settled model, which is the bargain every other panel makes with `animate: false`.
        if (!animate) layout.step(layout.steps)
        destroy = mountGl(body, () => graphOrbitOption(panel, c, animate, layout.positions()), definition.theme, missing, (chart) => {
          bindGraph(chart, events)
          return settleGraph(chart, panel, c, layout, key)
        })
        break
      }
    }
  } catch {
    note(body, "Panel could not be drawn.")
  }
  return { node, destroy }
}

/**
 * Build the whole screen into `host`, returning the teardown the reconciler will call.
 *
 * `earth` is the host's globe configuration, passed through untouched: what the planet looks like
 * is the page's decision, not the fence's. `events` is the same bargain for clicks: what a claim
 * or an entity does when it is clicked is the page's decision too.
 */
export function mountScreen(host: HTMLElement, definition: ScreenDefinition, animate: boolean, earth?: GlobeSkin, events?: BigscreenEvents): () => void {
  const c = palette(definition)
  host.setAttribute("data-aigui-bigscreen", definition.theme)
  host.style.setProperty("--aigui-bs-accent", c.accent)
  host.style.setProperty("--aigui-bs-text", c.text)
  host.style.setProperty("--aigui-bs-muted", c.muted)
  if (definition.title || definition.subtitle) {
    const head = el("header", { class: "aigui-bs-head" })
    if (definition.title) {
      const title = el("h2", { class: "aigui-bs-title" }, definition.title)
      title.style.textShadow = definition.theme === "dark" ? `0 0 24px ${withAlpha(c.accent, 0.35)}` : "none"
      head.appendChild(title)
    }
    if (definition.subtitle) head.appendChild(el("p", { class: "aigui-bs-subtitle" }, definition.subtitle))
    const rule = el("div", { class: "aigui-bs-rule" })
    rule.style.background = `linear-gradient(90deg, transparent, ${c.accent}, transparent)`
    head.appendChild(rule)
    host.appendChild(head)
  }
  const grid = el("div", { class: "aigui-bs-grid" })
  grid.style.gridTemplateColumns = `repeat(${definition.columns}, minmax(0, 1fr))`
  host.appendChild(grid)
  const mounted = definition.panels.map((panel) => mountPanel(panel, definition, c, animate, earth, events))
  for (const { node } of mounted) grid.appendChild(node)
  return () => {
    for (const { destroy } of mounted) destroy()
    host.replaceChildren()
  }
}
