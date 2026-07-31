import type { AIGuiPlugin, ASTNode, RenderOutput } from "@ai-gui/core"

const MAX_EVIDENCE_BYTES = 128 * 1024
const MAX_QUERIES = 50
const MAX_QUERY_LENGTH = 8192
const MAX_LABEL_LENGTH = 256
const MAX_ERROR_LENGTH = 1024
const DEFINITION_KEYS = new Set(["queries", "label"])
const QUERY_KEYS = new Set(["query", "label", "rows", "ms", "ok", "error", "source"])

/** One executed query, as the host ran it. */
export interface EvidenceQuery {
  /** The statement the host actually executed. */
  query: string
  /** Optional human label, e.g. the tool name or the question it answered. */
  label?: string
  /** Rows the statement returned. */
  rows?: number
  /** Wall-clock duration in milliseconds. */
  ms?: number
  /** Whether the statement succeeded. Defaults to true. */
  ok?: boolean
  /** Failure text when `ok` is false. */
  error?: string
  /** Where it ran, e.g. a database or warehouse name. */
  source?: string
}

export interface EvidenceDefinition {
  queries: EvidenceQuery[]
  label?: string
}

export interface EvidenceOptions {
  /** Heading for the block. Default: "Data provenance". */
  title?: string
  /** Open the disclosure by default. Default: false. */
  defaultOpen?: boolean
}

export type EvidenceParseResult =
  | { valid: true; data: EvidenceDefinition }
  | { valid: false; issues: string[] }

export const evidenceCss = [
  "[data-aigui-evidence]{margin:1rem 0;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:.75rem;overflow:hidden}",
  "[data-aigui-evidence]>summary{cursor:pointer;padding:.6rem .9rem;font-size:.9rem;list-style:none}",
  "[data-aigui-evidence]>summary::-webkit-details-marker{display:none}",
  "[data-aigui-evidence]>summary::before{content:'▸ ';opacity:.6}",
  "[data-aigui-evidence][open]>summary::before{content:'▾ '}",
  "[data-aigui-evidence] ol{margin:0;padding:.2rem .9rem .8rem 2.2rem}",
  "[data-aigui-evidence] li+li{margin-top:.7rem}",
  "[data-aigui-evidence] pre{margin:.3rem 0 0;padding:.6rem .7rem;overflow-x:auto;border-radius:.5rem;background:color-mix(in srgb,currentColor 7%,transparent);font-size:.82rem;white-space:pre-wrap;word-break:break-word}",
  "[data-aigui-evidence-meta]{font-size:.78rem;opacity:.72}",
  "[data-aigui-evidence-failed]{color:#dc2626}",
  "[data-aigui-evidence-invalid]{margin:1rem 0;opacity:.72}",
].join("\n")

/**
 * Provenance is only worth showing when the host wrote it. A model that can invent a number can
 * invent the query said to have produced it, so the prompt tells the model to leave this fence
 * alone; the host appends it from what it actually executed.
 * You rarely want this directly: `buildSystemPrompt({ registry, plugins, locale })` from
 * `@ai-gui/core` collects the card specs and every enabled plugin's spec in one call, in the
 * product's language. Reach for this only to inspect or override one plugin's rules.
 */
export function evidencePromptSpec(): string {
  return [
    "Never emit an ```evidence fence. The application appends it from the queries it really ran.",
    "State numbers you obtained from tool results; do not describe the queries yourself.",
  ].join("\n")
}

export function evidence(options: EvidenceOptions = {}): AIGuiPlugin {
  const title = options.title ?? "Data provenance"
  const defaultOpen = options.defaultOpen === true
  const render = (node: ASTNode): RenderOutput => {
    if (node.complete !== true) return loadingOutput()
    const parsed = parseEvidenceDefinition(node.content ?? "")
    return parsed.valid ? renderEvidence(parsed.data, title, defaultOpen) : invalidOutput()
  }
  return {
    name: "evidence",
    nodeRenderers: { evidence: render },
    css: evidenceCss,
    promptSpec: evidencePromptSpec(),
  }
}

export function parseEvidenceDefinition(source: string): EvidenceParseResult {
  const issues: string[] = []
  if (byteLength(source) > MAX_EVIDENCE_BYTES) {
    return { valid: false, issues: [`evidence exceeds ${MAX_EVIDENCE_BYTES} bytes`] }
  }
  let raw: unknown
  try {
    raw = JSON.parse(source)
  } catch {
    return { valid: false, issues: ["evidence is not valid JSON"] }
  }
  if (!isPlainObject(raw)) return { valid: false, issues: ["evidence must be a JSON object"] }
  for (const key of Object.keys(raw)) {
    if (!DEFINITION_KEYS.has(key)) issues.push(`unexpected key "${key}"`)
  }
  const label = readString(raw.label, MAX_LABEL_LENGTH, "label", issues, true)
  const list = raw.queries
  if (!Array.isArray(list)) {
    issues.push("queries must be an array")
    return { valid: false, issues }
  }
  if (list.length === 0) issues.push("queries must not be empty")
  if (list.length > MAX_QUERIES) issues.push(`queries must hold at most ${MAX_QUERIES} entries`)

  const queries: EvidenceQuery[] = []
  for (const [index, entry] of list.slice(0, MAX_QUERIES).entries()) {
    if (!isPlainObject(entry)) {
      issues.push(`queries[${index}] must be an object`)
      continue
    }
    for (const key of Object.keys(entry)) {
      if (!QUERY_KEYS.has(key)) issues.push(`queries[${index}] has unexpected key "${key}"`)
    }
    const query = readString(entry.query, MAX_QUERY_LENGTH, `queries[${index}].query`, issues, false)
    if (query === undefined) continue
    queries.push({
      query,
      label: readString(entry.label, MAX_LABEL_LENGTH, `queries[${index}].label`, issues, true),
      rows: readNumber(entry.rows, `queries[${index}].rows`, issues),
      ms: readNumber(entry.ms, `queries[${index}].ms`, issues),
      ok: entry.ok === undefined ? true : entry.ok === true,
      error: readString(entry.error, MAX_ERROR_LENGTH, `queries[${index}].error`, issues, true),
      source: readString(entry.source, MAX_LABEL_LENGTH, `queries[${index}].source`, issues, true),
    })
  }
  if (issues.length > 0) return { valid: false, issues }
  return { valid: true, data: label === undefined ? { queries } : { queries, label } }
}

/** Build the fence text a host appends to an answer. */
export function serializeEvidenceFence(definition: EvidenceDefinition): string {
  return ["```evidence", JSON.stringify(definition), "```"].join("\n")
}

// ── rendering ────────────────────────────────────────────────────────────────

function renderEvidence(definition: EvidenceDefinition, title: string, open: boolean): RenderOutput {
  const total = definition.queries.length
  const rows = definition.queries.reduce((sum, q) => sum + (q.rows ?? 0), 0)
  const failed = definition.queries.filter((q) => q.ok === false).length
  const parts = [`${total} ${total === 1 ? "query" : "queries"}`, `${rows} rows`]
  if (failed > 0) parts.push(`${failed} failed`)
  const summary = definition.label ?? `${title} · ${parts.join(" · ")}`

  return element("details", { "data-aigui-evidence": "", ...(open ? { open: "" } : {}) }, [
    element("summary", undefined, [text(summary)]),
    element(
      "ol",
      undefined,
      definition.queries.map((q) => element("li", q.ok === false ? { "data-aigui-evidence-failed": "" } : undefined, [
        ...(q.label === undefined ? [] : [element("div", undefined, [text(q.label)])]),
        element("div", { "data-aigui-evidence-meta": "" }, [text(metaLine(q))]),
        element("pre", undefined, [element("code", undefined, [text(q.query)])]),
        ...(q.error === undefined ? [] : [element("div", { "data-aigui-evidence-failed": "" }, [text(q.error)])]),
      ])),
    ),
  ])
}

function metaLine(q: EvidenceQuery): string {
  const bits: string[] = []
  if (q.source !== undefined) bits.push(q.source)
  if (q.rows !== undefined) bits.push(`${q.rows} rows`)
  if (q.ms !== undefined) bits.push(`${q.ms} ms`)
  if (q.ok === false) bits.push("failed")
  return bits.join(" · ")
}

function loadingOutput(): RenderOutput {
  return element("div", { "data-aigui-evidence-loading": "" }, [])
}

function invalidOutput(): RenderOutput {
  return element("div", { "data-aigui-evidence-invalid": "" }, [text("Evidence unavailable")])
}

// ── helpers ──────────────────────────────────────────────────────────────────

function element(tag: string, props: Record<string, unknown> | undefined, children: RenderOutput[]): RenderOutput {
  return props === undefined ? { kind: "element", tag, children } : { kind: "element", tag, props, children }
}

/** Text is emitted as escaped HTML: a query string is model-adjacent data, never markup. */
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

function readNumber(value: unknown, path: string, issues: string[]): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    issues.push(`${path} must be a non-negative number`)
    return undefined
  }
  return value
}
