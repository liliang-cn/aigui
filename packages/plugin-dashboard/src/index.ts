import { BarChart, LineChart, PieChart, ScatterChart } from "echarts/charts"
import {
  AxisPointerComponent,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  TransformComponent,
} from "echarts/components"
import { init, use, type ECharts, type EChartsCoreOption } from "echarts/core"
import { SVGRenderer } from "echarts/renderers"
import type { AIGuiPlugin, ASTNode, NodeRenderContext, RenderOutput } from "@ai-gui/core"

// A dashboard panel is a comparison or a trend. The exotic chart types live in
// @ai-gui/plugin-chart; registering all of them here would ship a second copy
// of ECharts' full surface for panels that never use it.
use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  AxisPointerComponent,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  TransformComponent,
  SVGRenderer,
])

const MAX_BYTES = 1024 * 1024
const MAX_PANELS = 12
const MAX_COLUMNS = 32
const MAX_ROWS = 500
const MAX_CELL_LENGTH = 512
const MAX_LABEL_LENGTH = 256
const MAX_SQL_LENGTH = 8 * 1024
const DEFINITION_KEYS = new Set(["title", "panels"])
const PANEL_KEYS = new Set(["title", "columns", "rows", "chart", "sql", "note", "error", "source"])

export type Cell = string | number | boolean | null

/**
 * One panel: a table, optionally a chart and the SQL that produced the rows —
 * or a refusal.
 *
 * `error` and data are mutually exclusive by shape: a governed backend that
 * refuses one panel (role cannot see the metric) reports it *inside* the panel,
 * and the rest of the dashboard renders. Making one refusal fail the whole
 * board would mean no board spanning two roles could exist.
 */
export interface PanelDefinition {
  title: string
  columns?: (string | { name: string; align?: "left" | "right" })[]
  rows?: Cell[][]
  /** A complete ECharts option, authored by the host from the rows. */
  chart?: EChartsCoreOption
  /** The statement that produced the rows. Provenance, shown behind a disclosure. */
  sql?: string
  /** One host-authored caveat line, e.g. rows suppressed by k-anonymity. */
  note?: string
  /** Why this panel is empty — a refusal is content, not a crash. */
  error?: string
  /** Where the rows ran (database, metric names). */
  source?: string
}

export interface DashboardDefinition {
  title?: string
  panels: PanelDefinition[]
}

export interface DashboardOptions {
  /** Chart height per panel in px. Default 240. */
  chartHeight?: number
  /** Locale for renderer-authored strings. Default "en". */
  locale?: string
}

export type DashboardParseResult =
  | { valid: true; data: DashboardDefinition }
  | { valid: false; issues: string[] }

export const dashboardCss = [
  // Auto-fit grid: panels flow into as many columns as fit, one on a phone.
  "[data-aigui-dashboard]{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));margin:1rem 0}",
  "[data-aigui-dashboard-title]{grid-column:1/-1;font-size:1.05rem;font-weight:600;margin:0}",
  "[data-aigui-panel]{border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:.5rem;padding:.9rem;min-width:0}",
  "[data-aigui-panel-title]{font-weight:600;font-size:.95rem;margin:0 0 .55rem}",
  "[data-aigui-panel] table{border-collapse:collapse;width:100%;font-size:.85rem;font-variant-numeric:tabular-nums}",
  "[data-aigui-panel] th,[data-aigui-panel] td{padding:.35rem .5rem;border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent);text-align:left;white-space:nowrap}",
  "[data-aigui-panel] th{font-weight:600;opacity:.7;font-size:.78rem}",
  "[data-aigui-panel] td[data-num],[data-aigui-panel] th[data-num]{text-align:right}",
  "[data-aigui-panel] td[data-null]{opacity:.45;font-style:italic}",
  "[data-aigui-panel-chart]{margin-top:.6rem;max-width:100%}",
  "[data-aigui-panel-error]{padding:.55rem .7rem;border-left:3px solid color-mix(in srgb,currentColor 45%,transparent);opacity:.8;font-size:.85rem}",
  "[data-aigui-panel-note]{margin-top:.5rem;font-size:.78rem;opacity:.7}",
  "[data-aigui-panel-sql]{margin-top:.6rem;font-size:.78rem}",
  "[data-aigui-panel-sql] summary{cursor:pointer;opacity:.75}",
  "[data-aigui-panel-sql] pre{margin:.35rem 0 0;padding:.5rem .6rem;overflow-x:auto;border-radius:.4rem;background:color-mix(in srgb,currentColor 7%,transparent);white-space:pre-wrap;word-break:break-word}",
  "[data-aigui-dashboard-invalid]{margin:1rem 0;opacity:.72}",
].join("\n")

/**
 * The division of labour, spelled out for the model.
 *
 * **What the model decides** — the layout: the dashboard title, which panels
 * exist, each panel's title, which metric × dimension combination it shows,
 * and whether it reads best as a bar, line or table-only panel. That is
 * judgement, and judgement is the model's half.
 *
 * **What the model never writes** — the fence itself. Rows, SQL and refusals
 * are filled in by the application from the queries it really ran. A model
 * that can invent a panel's rows can invent the dashboard that proves its own
 * point — same stance as resultset, one level up.
 */
export function dashboardPromptSpec(locale?: string): string {
  return (locale ?? "en").toLowerCase().startsWith("zh")
    ? [
        "看板（BI dashboard）：当用户要「看板 / 大屏 / 几张图一起看」时，通过应用提供的看板机制（工具或接口）**由你决定版面**：",
        "- 看板标题、有哪几块板（最多 12 块，再多拆第二张）；",
        "- 每块板的标题、看哪个指标、按什么维度切、什么时间粒度；",
        "- 每块板画成什么：类目对比用 bar，时间趋势用 line，单个数或明细只出表。",
        "**不要自己产出 ```dashboard 围栏**。行、SQL、以及某块板被治理拒绝的理由，都由应用按真实查询结果填写并附加。",
        "不要把看板里的数字重新打进正文。指着某块板说它显示了什么。",
      ].join("\n")
    : [
        "Dashboards: when the user asks for a dashboard / several charts at once, use the application's dashboard mechanism (tool or API) — **you decide the layout**:",
        "- the dashboard title and which panels exist (at most 12; split a second board beyond that);",
        "- each panel's title, which metric, sliced by which dimensions, at what time grain;",
        "- how each panel reads best: bar for category comparison, line for trends over time, table-only for single figures or detail.",
        "**Never emit a ```dashboard fence yourself.** Rows, SQL, and per-panel governance refusals are filled in by the application from the queries it really ran.",
        "Do not retype figures from a dashboard into your prose. Refer to a panel and describe what it shows.",
      ].join("\n")
}

/**
 * Dashboard plugin: claims the `dashboard` node type and renders a grid of
 * panels — table, live ECharts chart, provenance, or a per-panel refusal.
 */
export function dashboard(options: DashboardOptions = {}): AIGuiPlugin {
  const chartHeight = options.chartHeight ?? 240
  const zh = (options.locale ?? "en").toLowerCase().startsWith("zh")
  const render = (node: ASTNode, context?: NodeRenderContext): RenderOutput => {
    // Complete-gated for the same reason resultset is: a half-streamed board
    // reads as a finished board with fewer panels.
    if (node.complete !== true) {
      return element("div", { "data-aigui-dashboard-loading": "" }, [])
    }
    const parsed = parseDashboardDefinition(node.content ?? "")
    if (!parsed.valid) {
      return element("div", { "data-aigui-dashboard-invalid": "" }, [
        text(zh ? "看板不可用" : "Dashboard unavailable"),
      ])
    }
    return renderDashboard(parsed.data, chartHeight, zh, context?.theme === "dark")
  }
  return {
    name: "dashboard",
    nodeRenderers: { dashboard: render },
    css: dashboardCss,
    promptSpec: (locale) => dashboardPromptSpec(locale),
  }
}

export function parseDashboardDefinition(source: string): DashboardParseResult {
  const issues: string[] = []
  if (byteLength(source) > MAX_BYTES) {
    return { valid: false, issues: [`dashboard exceeds ${MAX_BYTES} bytes`] }
  }
  let raw: unknown
  try {
    raw = JSON.parse(source)
  } catch {
    return { valid: false, issues: ["dashboard is not valid JSON"] }
  }
  if (!isPlainObject(raw)) return { valid: false, issues: ["dashboard must be a JSON object"] }
  for (const key of Object.keys(raw)) {
    if (!DEFINITION_KEYS.has(key)) issues.push(`unexpected key "${key}"`)
  }
  const data: DashboardDefinition = { panels: [] }
  const title = readString(raw.title, MAX_LABEL_LENGTH, "title", issues, true)
  if (title !== undefined) data.title = title

  if (!Array.isArray(raw.panels)) {
    issues.push("panels must be an array")
  } else {
    if (raw.panels.length === 0) issues.push("panels must not be empty")
    if (raw.panels.length > MAX_PANELS) issues.push(`panels must hold at most ${MAX_PANELS} entries`)
    for (const [i, p] of raw.panels.slice(0, MAX_PANELS).entries()) {
      const panel = readPanel(p, `panels[${i}]`, issues)
      if (panel !== undefined) data.panels.push(panel)
    }
  }
  if (issues.length > 0) return { valid: false, issues }
  return { valid: true, data }
}

/** Build the fence text a host appends to an answer. */
export function serializeDashboardFence(definition: DashboardDefinition): string {
  return ["```dashboard", JSON.stringify(definition), "```"].join("\n")
}

// ── parsing ──────────────────────────────────────────────────────────────────

function readPanel(value: unknown, path: string, issues: string[]): PanelDefinition | undefined {
  if (!isPlainObject(value)) {
    issues.push(`${path} must be an object`)
    return undefined
  }
  for (const key of Object.keys(value)) {
    if (!PANEL_KEYS.has(key)) issues.push(`${path}: unexpected key "${key}"`)
  }
  const title = readString(value.title, MAX_LABEL_LENGTH, `${path}.title`, issues, false)
  if (title === undefined) return undefined
  const panel: PanelDefinition = { title }

  const error = readString(value.error, MAX_LABEL_LENGTH * 4, `${path}.error`, issues, true)
  if (error !== undefined) panel.error = error

  if (value.columns !== undefined) {
    if (!Array.isArray(value.columns) || value.columns.length > MAX_COLUMNS) {
      issues.push(`${path}.columns must be an array of at most ${MAX_COLUMNS}`)
    } else {
      const cols: PanelDefinition["columns"] = []
      for (const [j, c] of value.columns.entries()) {
        if (isPlainObject(c)) {
          const name = readString(c.name, MAX_LABEL_LENGTH, `${path}.columns[${j}].name`, issues, false)
          if (name === undefined) continue
          if (c.align !== undefined && c.align !== "left" && c.align !== "right") {
            issues.push(`${path}.columns[${j}].align must be "left" or "right"`)
            continue
          }
          cols.push(c.align === undefined ? name : { name, align: c.align })
        } else {
          const name = readString(c, MAX_LABEL_LENGTH, `${path}.columns[${j}]`, issues, false)
          if (name !== undefined) cols.push(name)
        }
      }
      panel.columns = cols
    }
  }

  if (value.rows !== undefined) {
    if (!Array.isArray(value.rows) || value.rows.length > MAX_ROWS) {
      issues.push(`${path}.rows must be an array of at most ${MAX_ROWS}`)
    } else {
      const width = panel.columns?.length ?? 0
      const rows: Cell[][] = []
      for (const [j, row] of value.rows.entries()) {
        if (!Array.isArray(row)) {
          issues.push(`${path}.rows[${j}] must be an array`)
          continue
        }
        // A row that does not match the header shows a number under the wrong
        // column — the exact failure a host-written table exists to prevent.
        if (width > 0 && row.length !== width) {
          issues.push(`${path}.rows[${j}] has ${row.length} cells, expected ${width}`)
          continue
        }
        rows.push(row.map((cell, k) => readCell(cell, `${path}.rows[${j}][${k}]`, issues)))
      }
      panel.rows = rows
    }
  }

  if (value.chart !== undefined) {
    if (!isPlainObject(value.chart)) {
      issues.push(`${path}.chart must be an ECharts option object`)
    } else {
      panel.chart = value.chart as EChartsCoreOption
    }
  }
  const sql = readString(value.sql, MAX_SQL_LENGTH, `${path}.sql`, issues, true)
  if (sql !== undefined) panel.sql = sql
  const note = readString(value.note, MAX_LABEL_LENGTH * 2, `${path}.note`, issues, true)
  if (note !== undefined) panel.note = note
  const source = readString(value.source, MAX_LABEL_LENGTH, `${path}.source`, issues, true)
  if (source !== undefined) panel.source = source
  return panel
}

// ── rendering ────────────────────────────────────────────────────────────────

function renderDashboard(
  d: DashboardDefinition,
  chartHeight: number,
  zh: boolean,
  dark: boolean,
): RenderOutput {
  const children: RenderOutput[] = []
  if (d.title !== undefined) {
    children.push(element("h3", { "data-aigui-dashboard-title": "" }, [text(d.title)]))
  }
  for (const p of d.panels) children.push(renderPanel(p, chartHeight, zh, dark))
  return element("div", { "data-aigui-dashboard": "" }, children)
}

function renderPanel(p: PanelDefinition, chartHeight: number, zh: boolean, dark: boolean): RenderOutput {
  const kids: RenderOutput[] = [element("h4", { "data-aigui-panel-title": "" }, [text(p.title)])]
  if (p.error !== undefined) {
    // The refusal is the panel's content. It renders where the numbers would
    // have been, so an empty panel always says why it is empty.
    kids.push(element("div", { "data-aigui-panel-error": "" }, [text(p.error)]))
    return element("section", { "data-aigui-panel": "" }, kids)
  }
  if (p.columns !== undefined && p.rows !== undefined) {
    kids.push(renderTable(p.columns, p.rows))
  }
  if (p.note !== undefined) {
    kids.push(element("div", { "data-aigui-panel-note": "" }, [text(p.note)]))
  }
  if (p.chart !== undefined) {
    kids.push(chartMount(p.chart, chartHeight, dark))
  }
  if (p.sql !== undefined) {
    kids.push(
      element("details", { "data-aigui-panel-sql": "" }, [
        element("summary", undefined, [text(zh ? "这些数是怎么来的" : "How these numbers were produced")]),
        element("pre", undefined, [element("code", undefined, [text(p.sql)])]),
      ]),
    )
  }
  return element("section", { "data-aigui-panel": "" }, kids)
}

function renderTable(columns: NonNullable<PanelDefinition["columns"]>, rows: Cell[][]): RenderOutput {
  const aligns = columns.map((c) => (typeof c === "object" ? c.align : undefined))
  const th = (c: (typeof columns)[number], j: number) =>
    element("th", aligns[j] === "right" ? { scope: "col", "data-num": "" } : { scope: "col" }, [
      text(typeof c === "object" ? c.name : c),
    ])
  const td = (cell: Cell, j: number): RenderOutput => {
    if (cell === null) return element("td", { "data-null": "" }, [text("null")])
    if (typeof cell === "number") return element("td", { "data-num": "" }, [text(formatNumber(cell))])
    const props = aligns[j] === "right" ? { "data-num": "" } : undefined
    return element("td", props, [text(typeof cell === "boolean" ? String(cell) : cell)])
  }
  return element("table", undefined, [
    element("thead", undefined, [element("tr", undefined, columns.map(th))]),
    element(
      "tbody",
      undefined,
      rows.map((row) => element("tr", undefined, row.map(td))),
    ),
  ])
}

/**
 * A live ECharts instance sized to the panel and following it on resize —
 * dashboards live in grids, and grid tracks change width with the viewport.
 * A fixed-width chart in a fluid panel is either clipped or a strip of blank.
 */
function chartMount(option: EChartsCoreOption, height: number, dark: boolean): RenderOutput {
  return {
    kind: "element",
    tag: "div",
    props: { "data-aigui-panel-chart": "" },
    children: [
      {
        kind: "mount",
        mount: (el: HTMLElement) => {
          const width = () => {
            const w = Math.floor(el.clientWidth || el.getBoundingClientRect().width)
            return w > 0 ? w : 320
          }
          const inst: ECharts = init(el, dark ? "dark" : undefined, {
            renderer: "svg",
            width: width(),
            height,
          })
          try {
            inst.setOption(option)
          } catch {
            inst.dispose()
            return
          }
          let ro: ResizeObserver | undefined
          if (typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(() => {
              const w = width()
              if (w > 0) inst.resize({ width: w })
            })
            ro.observe(el)
          }
          return () => {
            ro?.disconnect()
            inst.dispose()
          }
        },
      },
    ],
  }
}

/** Grouped digits, no exponent — a column of numbers exists to be compared. */
function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  const rounded = Number.isInteger(n) ? n : Math.round(n * 1e6) / 1e6
  const [int, frac] = String(rounded).split(".")
  const grouped = (int ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return frac === undefined ? grouped : `${grouped}.${frac}`
}

// ── helpers ──────────────────────────────────────────────────────────────────

function element(
  tag: string,
  props: Record<string, unknown> | undefined,
  children: RenderOutput[],
): RenderOutput {
  return props === undefined ? { kind: "element", tag, children } : { kind: "element", tag, props, children }
}

/** Text is escaped: a database cell (or a refusal message) is data, never markup. */
function text(value: string): RenderOutput {
  return {
    kind: "html",
    html: value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;"),
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

function readCell(value: unknown, path: string, issues: string[]): Cell {
  if (value === null) return null
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      issues.push(`${path} must be a finite number`)
      return null
    }
    return value
  }
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    return value.length > MAX_CELL_LENGTH ? `${value.slice(0, MAX_CELL_LENGTH)}…` : value
  }
  issues.push(`${path} must be a string, number, boolean or null`)
  return null
}

function readString(
  value: unknown,
  max: number,
  path: string,
  issues: string[],
  optional: boolean,
): string | undefined {
  if (value === undefined) {
    if (!optional) issues.push(`${path} is required`)
    return undefined
  }
  if (typeof value !== "string") {
    issues.push(`${path} must be a string`)
    return undefined
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    if (!optional) issues.push(`${path} must not be empty`)
    return undefined
  }
  if (trimmed.length > max) {
    issues.push(`${path} exceeds ${max} characters`)
    return undefined
  }
  return trimmed
}
