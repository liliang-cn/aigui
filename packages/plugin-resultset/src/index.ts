import type { AIGuiPlugin, ASTNode, RenderOutput } from "@ai-gui/core"

const MAX_BYTES = 512 * 1024
const MAX_COLUMNS = 64
const MAX_ROWS = 500
const MAX_CELL_LENGTH = 512
const MAX_LABEL_LENGTH = 256
const DEFINITION_KEYS = new Set(["id", "columns", "rows", "label", "truncated", "source"])

/** A cell as the database returned it. */
export type Cell = string | number | boolean | null

/**
 * A column: its header, optionally with a declared alignment.
 *
 * Alignment exists because hosts often format numbers before serializing —
 * `"9,308,286.52"`, `"23.2%"`, `"(no data)"` are strings, so the renderer's
 * own number detection (`td[data-num]`) never fires and a column of figures
 * lands left-aligned, where it cannot be compared vertically. Declaring
 * `align: "right"` keeps the honesty of host-side formatting without losing
 * the one thing a numeric column is for.
 */
export type Column = string | { name: string; align?: "left" | "right" }

export interface ResultsetDefinition {
  /** Stable name the prose refers to, e.g. `[[result:by_region]]`. */
  id?: string
  columns: Column[]
  rows: Cell[][]
  /** Heading, e.g. the question this answers. */
  label?: string
  /** More rows existed than are shown. */
  truncated?: boolean
  /** Where it ran — a database or warehouse name. */
  source?: string
}

export interface ResultsetOptions {
  /** Cap rows rendered per table. Default 200. */
  maxRows?: number
  /** Show the id beside the heading, so prose references are traceable. Default false. */
  showId?: boolean
  /**
   * Show the meta line (`N rows · source`) under the table. Default true.
   * Hosts that already state the row count and source elsewhere (e.g. in an
   * evidence block) hide it rather than saying the same thing twice.
   */
  meta?: boolean
  /** Locale for renderer-authored strings (meta line, invalid notice). Default "en". */
  locale?: string
}

export type ResultsetParseResult =
  | { valid: true; data: ResultsetDefinition }
  | { valid: false; issues: string[] }

export const resultsetCss = [
  "[data-aigui-resultset]{margin:1rem 0;overflow-x:auto}",
  "[data-aigui-resultset] table{border-collapse:collapse;width:100%;font-size:.9rem;font-variant-numeric:tabular-nums}",
  "[data-aigui-resultset] caption{text-align:left;padding:0 0 .45rem;font-size:.9rem;opacity:.85}",
  "[data-aigui-resultset] th,[data-aigui-resultset] td{padding:.4rem .65rem;border-bottom:1px solid color-mix(in srgb,currentColor 14%,transparent);text-align:left;white-space:nowrap}",
  "[data-aigui-resultset] th{font-weight:600;opacity:.75;font-size:.82rem}",
  "[data-aigui-resultset] td[data-num]{text-align:right}",
  "[data-aigui-resultset] td[data-null]{opacity:.45;font-style:italic}",
  "[data-aigui-resultset-meta]{margin-top:.4rem;font-size:.78rem;opacity:.7}",
  "[data-aigui-resultset-invalid]{margin:1rem 0;opacity:.72}",
].join("\n")

/**
 * The whole point of this plugin is who writes the fence.
 *
 * A model that reads `4624290` out of a tool result and types it into a sentence
 * has introduced a transcription step nothing checks — and transcription is
 * exactly where a digit goes missing. Provenance plugins prove *which query
 * ran*; they do not prove the number in the prose came from it. So the host
 * emits the rows verbatim and the model is told to point at them instead.
 */
export function resultsetPromptSpec(): string {
  return [
    "Never emit a ```resultset fence. The application appends result tables from the rows it really returned.",
    "Do not retype figures from a table into your prose. Refer to the table by id, e.g. [[result:by_region]], and describe what it shows.",
    "It is fine to state a single headline figure in words when it appears in a table the application rendered.",
  ].join("\n")
}

export function resultset(options: ResultsetOptions = {}): AIGuiPlugin {
  const maxRows = clampRowCap(options.maxRows)
  const showId = options.showId === true
  const meta = options.meta !== false
  const zh = (options.locale ?? "en").toLowerCase().startsWith("zh")
  const render = (node: ASTNode): RenderOutput => {
    // Complete-gated: a table that grows a row at a time reads, mid-stream, as
    // a table that is already finished. A reader who looks away sees four rows
    // where there were nine, and nothing tells them so.
    if (node.complete !== true) return loadingOutput()
    const parsed = parseResultsetDefinition(node.content ?? "")
    return parsed.valid ? renderResultset(parsed.data, maxRows, showId, meta, zh) : invalidOutput(zh)
  }
  return {
    name: "resultset",
    nodeRenderers: { resultset: render },
    css: resultsetCss,
    promptSpec: resultsetPromptSpec(),
  }
}

export function parseResultsetDefinition(source: string): ResultsetParseResult {
  const issues: string[] = []
  if (byteLength(source) > MAX_BYTES) {
    return { valid: false, issues: [`resultset exceeds ${MAX_BYTES} bytes`] }
  }
  let raw: unknown
  try {
    raw = JSON.parse(source)
  } catch {
    return { valid: false, issues: ["resultset is not valid JSON"] }
  }
  if (!isPlainObject(raw)) return { valid: false, issues: ["resultset must be a JSON object"] }
  for (const key of Object.keys(raw)) {
    if (!DEFINITION_KEYS.has(key)) issues.push(`unexpected key "${key}"`)
  }

  const columns: Column[] = []
  if (!Array.isArray(raw.columns)) {
    issues.push("columns must be an array")
  } else {
    if (raw.columns.length === 0) issues.push("columns must not be empty")
    if (raw.columns.length > MAX_COLUMNS) issues.push(`columns must hold at most ${MAX_COLUMNS} entries`)
    for (const [i, c] of raw.columns.slice(0, MAX_COLUMNS).entries()) {
      if (isPlainObject(c)) {
        const name = readString(c.name, MAX_LABEL_LENGTH, `columns[${i}].name`, issues, false)
        if (name === undefined) continue
        if (c.align !== undefined && c.align !== "left" && c.align !== "right") {
          issues.push(`columns[${i}].align must be "left" or "right"`)
          continue
        }
        columns.push(c.align === undefined ? name : { name, align: c.align })
      } else {
        const name = readString(c, MAX_LABEL_LENGTH, `columns[${i}]`, issues, false)
        if (name !== undefined) columns.push(name)
      }
    }
  }

  const rows: Cell[][] = []
  if (!Array.isArray(raw.rows)) {
    issues.push("rows must be an array")
  } else {
    if (raw.rows.length > MAX_ROWS) issues.push(`rows must hold at most ${MAX_ROWS} entries`)
    for (const [i, row] of raw.rows.slice(0, MAX_ROWS).entries()) {
      if (!Array.isArray(row)) {
        issues.push(`rows[${i}] must be an array`)
        continue
      }
      // A row that does not match the header is a misaligned table, and a
      // misaligned table shows a number under the wrong column — the failure
      // this plugin exists to make impossible.
      if (columns.length > 0 && row.length !== columns.length) {
        issues.push(`rows[${i}] has ${row.length} cells, expected ${columns.length}`)
        continue
      }
      rows.push(row.map((cell, j) => readCell(cell, `rows[${i}][${j}]`, issues)))
    }
  }

  if (issues.length > 0) return { valid: false, issues }
  const data: ResultsetDefinition = { columns, rows }
  const id = readString(raw.id, MAX_LABEL_LENGTH, "id", issues, true)
  if (id !== undefined) data.id = id
  const label = readString(raw.label, MAX_LABEL_LENGTH, "label", issues, true)
  if (label !== undefined) data.label = label
  const source_ = readString(raw.source, MAX_LABEL_LENGTH, "source", issues, true)
  if (source_ !== undefined) data.source = source_
  if (raw.truncated === true) data.truncated = true
  if (issues.length > 0) return { valid: false, issues }
  return { valid: true, data }
}

/** Build the fence text a host appends to an answer. */
export function serializeResultsetFence(definition: ResultsetDefinition): string {
  return ["```resultset", JSON.stringify(definition), "```"].join("\n")
}

// ── rendering ────────────────────────────────────────────────────────────────

function renderResultset(
  d: ResultsetDefinition,
  maxRows: number,
  showId: boolean,
  meta: boolean,
  zh: boolean,
): RenderOutput {
  const shown = d.rows.slice(0, maxRows)
  const hidden = d.rows.length - shown.length
  const aligns = d.columns.map((c) => (typeof c === "object" ? c.align : undefined))

  const children: RenderOutput[] = []
  const heading = captionOf(d, showId)
  if (heading !== undefined) children.push(element("caption", undefined, [text(heading)]))
  children.push(
    element("thead", undefined, [
      element(
        "tr",
        undefined,
        d.columns.map((c, j) =>
          element("th", withAlign({ scope: "col" }, aligns[j]), [text(nameOf(c))]),
        ),
      ),
    ]),
  )
  children.push(
    element(
      "tbody",
      undefined,
      shown.map((row) => element("tr", undefined, row.map((cell, j) => cellElement(cell, aligns[j])))),
    ),
  )

  const kids = [element("table", undefined, children)]
  if (meta) {
    const parts: string[] = []
    parts.push(zh ? `${d.rows.length} 行` : `${d.rows.length} ${d.rows.length === 1 ? "row" : "rows"}`)
    if (hidden > 0) parts.push(zh ? `未显示 ${hidden} 行` : `${hidden} not shown`)
    // Truncation is stated. A table silently cut to its first page is a wrong
    // answer that looks complete.
    if (d.truncated === true) parts.push(zh ? "还有更多行没有返回" : "more rows exist than were returned")
    if (d.source !== undefined) parts.push(d.source)
    kids.push(element("div", { "data-aigui-resultset-meta": "" }, [text(parts.join(" · "))]))
  }
  return element("div", { "data-aigui-resultset": "" }, kids)
}

function nameOf(c: Column): string {
  return typeof c === "object" ? c.name : c
}

function withAlign(
  props: Record<string, unknown>,
  align: "left" | "right" | undefined,
): Record<string, unknown> {
  // A declared right column gets `data-num` — the same hook the stylesheet
  // already uses for detected numbers, so declaration and detection cannot
  // drift into two different alignments.
  return align === "right" ? { ...props, "data-num": "" } : props
}

function captionOf(d: ResultsetDefinition, showId: boolean): string | undefined {
  if (d.label !== undefined) return showId && d.id !== undefined ? `${d.label} · ${d.id}` : d.label
  return showId ? d.id : undefined
}

function cellElement(cell: Cell, align?: "left" | "right"): RenderOutput {
  if (cell === null) return element("td", withAlign({ "data-null": "" }, align), [text("null")])
  if (typeof cell === "number") return element("td", { "data-num": "" }, [text(formatNumber(cell))])
  if (typeof cell === "boolean") return element("td", withAlign({}, align), [text(cell ? "true" : "false")])
  return element("td", withAlign({}, align), [text(cell)])
}

/**
 * Grouped digits, and no exponent. `6.17874362e+06` and `6,178,743.62` are the
 * same figure; only one can be compared with the number below it at a glance,
 * which is the entire job of a column of numbers.
 */
function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  const [int, frac] = String(Number.isInteger(n) ? n : round(n)).split(".")
  const grouped = (int ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return frac === undefined ? grouped : `${grouped}.${frac}`
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

function loadingOutput(): RenderOutput {
  return element("div", { "data-aigui-resultset-loading": "" }, [])
}

function invalidOutput(zh: boolean): RenderOutput {
  return element("div", { "data-aigui-resultset-invalid": "" }, [
    text(zh ? "结果表不可用" : "Result table unavailable"),
  ])
}

// ── helpers ──────────────────────────────────────────────────────────────────

function element(tag: string, props: Record<string, unknown> | undefined, children: RenderOutput[]): RenderOutput {
  return props === undefined ? { kind: "element", tag, children } : { kind: "element", tag, props, children }
}

/** Text is emitted as escaped HTML: a database cell is data, never markup. */
function text(value: string): RenderOutput {
  return { kind: "html", html: escapeHtml(value) }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

function clampRowCap(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return 200
  return Math.min(Math.floor(value), MAX_ROWS)
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
