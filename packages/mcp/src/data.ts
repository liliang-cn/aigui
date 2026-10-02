import { readFile, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, extname, isAbsolute, join } from "node:path"

/** A loaded data file: rows of named values (CSV/TSV), or whatever JSON it held. */
export interface DataSource {
  path: string
  rows?: Array<Record<string, unknown>>
  json?: unknown
}

const MAX_BYTES = 5 * 1024 * 1024

/** One CSV/TSV line split into fields, honouring double-quoted fields with doubled quotes inside. */
function splitLine(line: string, sep: string): string[] {
  const out: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"' && field === "") quoted = true
    else if (ch === sep) {
      out.push(field)
      field = ""
    } else field += ch
  }
  out.push(field)
  return out
}

/**
 * Rows from a CSV or TSV, the first line naming the columns.
 *
 * A column whose every non-empty cell is a number becomes numbers — a chart wants 1200, not
 * "1200" — and any other column stays text, so an id like "007" is not quietly turned into 7.
 */
export function parseDelimited(text: string, sep = ","): Array<Record<string, unknown>> {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "")
  if (lines.length === 0) return []
  const header = splitLine(lines[0], sep).map((h) => h.trim())
  const raw = lines.slice(1).map((l) => splitLine(l, sep))
  // Plainly written numbers only: "007" and "1e3" stay text — the first is an id, the second
  // rarely a quantity anyone typed into a spreadsheet.
  const plain = /^-?(0|[1-9]\d*)(\.\d+)?$/
  const numeric = header.map((_, c) => raw.every((r) => (r[c] ?? "").trim() === "" || plain.test(r[c].trim())))
  return raw.map((r) => Object.fromEntries(header.map((h, c) => {
    const cell = (r[c] ?? "").trim()
    return [h, numeric[c] ? (cell === "" ? null : Number(cell)) : cell]
  })))
}

/** Read the files an agent named, by the names it will use for them in blocks. */
export async function loadData(files: Record<string, string>): Promise<Map<string, DataSource>> {
  const sources = new Map<string, DataSource>()
  for (const [name, given] of Object.entries(files)) {
    const path = given.startsWith("~/") ? join(homedir(), given.slice(2)) : given
    if (!isAbsolute(path)) throw new Error(`data "${name}": give an absolute path, not ${given}`)
    const ext = extname(path).toLowerCase()
    if (![".csv", ".tsv", ".json"].includes(ext)) throw new Error(`data "${name}": only .csv, .tsv and .json files are read`)
    const info = await stat(path).catch(() => undefined)
    if (!info?.isFile()) throw new Error(`data "${name}": ${path} is not a file`)
    if (info.size > MAX_BYTES) throw new Error(`data "${name}": ${basename(path)} is larger than 5 MB`)
    const text = await readFile(path, "utf8")
    if (ext === ".json") {
      try {
        const json = JSON.parse(text)
        sources.set(name, Array.isArray(json) && json.every((r) => r && typeof r === "object" && !Array.isArray(r)) ? { path, rows: json, json } : { path, json })
      } catch {
        throw new Error(`data "${name}": ${basename(path)} is not valid JSON`)
      }
    } else {
      sources.set(name, { path, rows: parseDelimited(text, ext === ".tsv" ? "\t" : ",") })
    }
  }
  return sources
}

const AGGREGATES = ["sum", "count", "max", "min", "avg"] as const
const REF_KEYS = new Set(["$data", "column", "pick", ...AGGREGATES])

/**
 * The value a `{"$data": …}` reference stands for.
 *
 * - `{"$data":"sales"}` — every row (objects), or the JSON file's own value
 * - `{"$data":"sales","column":"revenue"}` — that column, top to bottom
 * - `{"$data":"sales","pick":["month","revenue"]}` — rows as arrays, in that column order
 * - `{"$data":"sales","sum":"revenue"}` — and `count`, `max`, `min`, `avg`
 */
function resolveRef(ref: Record<string, unknown>, sources: Map<string, DataSource>, used: Map<string, number>): unknown {
  const name = ref.$data
  if (typeof name !== "string") throw new Error(`"$data" must name a data file`)
  for (const key of Object.keys(ref)) if (!REF_KEYS.has(key)) throw new Error(`{"$data":"${name}"} has an unknown key "${key}" — use column, pick, ${AGGREGATES.join(", ")}`)
  const source = sources.get(name)
  if (!source) throw new Error(`no data named "${name}" — pass it in data: {"${name}": "/path/to/file.csv"}`)
  const rows = source.rows
  const needRows = () => {
    if (!rows) throw new Error(`data "${name}" is a JSON value, not a list of rows; use {"$data":"${name}"} alone`)
    used.set(name, rows.length)
    return rows
  }
  const columnOf = (col: unknown) => {
    const all = needRows()
    if (typeof col !== "string") throw new Error(`a column name must be a string`)
    if (all.length > 0 && !(col in all[0])) throw new Error(`data "${name}" has no column "${col}" — it has ${Object.keys(all[0]).join(", ")}`)
    return all.map((r) => r[col])
  }
  if (ref.column !== undefined) return columnOf(ref.column)
  if (ref.pick !== undefined) {
    if (!Array.isArray(ref.pick)) throw new Error(`pick must be a list of column names`)
    const cols = (ref.pick as unknown[]).map(columnOf)
    return needRows().map((_, i) => cols.map((c) => c[i]))
  }
  for (const agg of AGGREGATES) {
    if (ref[agg] === undefined) continue
    if (agg === "count") return needRows().length
    const values = columnOf(ref[agg]).filter((v): v is number => typeof v === "number")
    if (values.length === 0) throw new Error(`data "${name}" column "${ref[agg]}" has no numbers to ${agg}`)
    if (agg === "sum") return values.reduce((a, b) => a + b, 0)
    if (agg === "max") return Math.max(...values)
    if (agg === "min") return Math.min(...values)
    return values.reduce((a, b) => a + b, 0) / values.length
  }
  if (rows) {
    used.set(name, rows.length)
    return rows
  }
  used.set(name, 0)
  return source.json
}

function substitute(value: unknown, sources: Map<string, DataSource>, used: Map<string, number>): unknown {
  if (Array.isArray(value)) return value.map((v) => substitute(v, sources, used))
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    if ("$data" in record) return resolveRef(record, sources, used)
    return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, substitute(v, sources, used)]))
  }
  return value
}

export interface Provenance {
  /** The block's fence name, e.g. "chart". */
  block: string
  /** Data name to the number of rows read from it (0 for a JSON value). */
  sources: Array<{ name: string; path: string; rows: number }>
}

/**
 * Fill every `{"$data": …}` reference in the markdown's JSON blocks from the loaded files.
 *
 * The numbers in a chart are then the file's, not a model's retyping of them — the one place a
 * wrong figure cannot be told from a right one by looking. Each block that used data gets a line
 * under it naming the files, when `note` is set (a page); the caller reports it either way.
 */
export function fillData(markdown: string, sources: Map<string, DataSource>, options: { note?: boolean } = {}): { markdown: string; provenance: Provenance[] } {
  const provenance: Provenance[] = []
  const filled = markdown.replace(/^(`{3,}|~{3,})([\w:-]+)[^\n]*\n([\s\S]*?)\n\1[ \t]*$/gm, (whole, fence: string, name: string, body: string) => {
    if (!body.includes('"$data"')) return whole
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      return whole
    }
    const used = new Map<string, number>()
    const value = substitute(parsed, sources, used)
    const entry: Provenance = { block: name, sources: [...used].map(([n, rows]) => ({ name: n, path: sources.get(n)!.path, rows })) }
    provenance.push(entry)
    const block = `${fence}${name}\n${JSON.stringify(value)}\n${fence}`
    if (!options.note) return block
    const note = entry.sources.map((s) => `${basename(s.path)}${s.rows ? ` (${s.rows} rows)` : ""}`).join(", ")
    return `${block}\n\n*Data: ${note}*`
  })
  return { markdown: filled, provenance }
}

/** The provenance as lines for a tool result. */
export function describeProvenance(provenance: readonly Provenance[]): string {
  if (provenance.length === 0) return ""
  return `\nData filled from files:\n${provenance.map((p) => `- ${p.block}: ${p.sources.map((s) => `${s.path}${s.rows ? ` (${s.rows} rows)` : ""}`).join(", ")}`).join("\n")}`
}
