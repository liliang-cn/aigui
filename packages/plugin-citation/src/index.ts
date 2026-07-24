import type { AIGuiPlugin, ASTNode, RenderOutput } from "@ai-gui/core"

const MAX_SOURCE_BYTES = 64 * 1024
const MAX_SOURCES = 100
const MAX_ID_LENGTH = 128
const MAX_TITLE_LENGTH = 256
const MAX_URL_LENGTH = 2048
const MAX_CITED_TEXT_LENGTH = 4096
const DEFINITION_KEYS = new Set(["sources"])
const SOURCE_KEYS = new Set(["id", "title", "url", "citedText"])
const SAFE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/

export interface CitationSource {
  id: string
  title: string
  url: string
  citedText?: string
}

export interface SourcesDefinition {
  sources: CitationSource[]
}

export interface CitationOptions {
  /** HTTP hosts allowed in addition to HTTPS. A hostname allows any port; host:port allows only that port. */
  allowedHttpHosts?: readonly string[]
}

export type SourcesParseResult =
  | { valid: true; data: SourcesDefinition }
  | { valid: false; issues: string[] }

export const citationCss = [
  "[data-aigui-citations]{margin:1rem 0;padding:1rem;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:.75rem}",
  "[data-aigui-citations] h2{margin:0 0 .75rem;font-size:1rem}",
  "[data-aigui-citations] ol{margin:0;padding-inline-start:1.5rem}",
  "[data-aigui-citations] li+li{margin-top:.75rem}",
  "[data-aigui-citations] blockquote{margin:.35rem 0 0;color:color-mix(in srgb,currentColor 72%,transparent)}",
  "[data-aigui-citations-invalid]{margin:1rem 0;color:color-mix(in srgb,currentColor 72%,transparent)}",
].join("\n")

export function citationPromptSpec(): string {
  return [
    "Sources (fenced JSON): ```sources {\"sources\":[{\"id\":\"safe-id\",\"title\":\"Source title\",\"url\":\"https://example.com/page\",\"citedText\":\"Optional exact supporting text\"}]} ```.",
    "Use 1-100 sources. IDs must be unique and contain only letters, numbers, underscores, or hyphens, starting with a letter.",
    "Use HTTPS URLs unless the application explicitly permits an HTTP host. Never emit HTML, actions, scripts, handlers, credentials, or extra fields.",
  ].join("\n")
}

export function citation(options: CitationOptions = {}): AIGuiPlugin {
  const policy = normalizePolicy(options)
  const render = (node: ASTNode): RenderOutput => {
    if (node.complete !== true) return loadingOutput()
    const parsed = parseWithPolicy(node.content ?? "", policy)
    return parsed.valid ? renderSources(parsed.data) : invalidOutput()
  }
  return {
    name: "citation",
    nodeRenderers: { sources: render },
    css: citationCss,
    promptSpec: citationPromptSpec(),
  }
}

export function parseSourcesDefinition(source: string, options: CitationOptions = {}): SourcesParseResult {
  return parseWithPolicy(source, normalizePolicy(options))
}

export function serializeSourcesFence(definition: unknown, options: CitationOptions = {}): string {
  let source: string
  try {
    source = JSON.stringify(definition)
  } catch {
    throw new TypeError("Sources definition must be JSON-serializable.")
  }
  if (source === undefined) throw new TypeError("Sources definition must be JSON-serializable.")
  const parsed = parseSourcesDefinition(source, options)
  if (!parsed.valid) throw new TypeError("Invalid sources definition.")
  return `\`\`\`sources\n${JSON.stringify(parsed.data, null, 2)}\n\`\`\``
}

interface HttpPolicy {
  anyPortHosts: Set<string>
  exactEndpoints: Set<string>
}

function normalizePolicy(options: CitationOptions): HttpPolicy {
  if (!isPlainObject(options)) throw new TypeError("Citation options must be an object.")
  for (const key of Object.keys(options)) {
    if (key !== "allowedHttpHosts") throw new TypeError(`Unknown citation option: ${key}`)
  }
  if (options.allowedHttpHosts !== undefined && !Array.isArray(options.allowedHttpHosts)) {
    throw new TypeError("allowedHttpHosts must be an array.")
  }
  const anyPortHosts = new Set<string>()
  const exactEndpoints = new Set<string>()
  for (const entry of options.allowedHttpHosts ?? []) {
    if (typeof entry !== "string" || entry.length === 0 || entry.trim() !== entry || /[/?#@]/.test(entry)) {
      throw new TypeError("Each allowed HTTP host must be a hostname or hostname:port.")
    }
    let parsed: URL
    try {
      parsed = new URL(`http://${entry}`)
    } catch {
      throw new TypeError("Each allowed HTTP host must be a hostname or hostname:port.")
    }
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash || !parsed.hostname) {
      throw new TypeError("Each allowed HTTP host must be a hostname or hostname:port.")
    }
    const explicitPort = readExplicitPort(entry)
    if (explicitPort) exactEndpoints.add(`${parsed.hostname.toLowerCase()}:${explicitPort}`)
    else anyPortHosts.add(parsed.hostname.toLowerCase())
  }
  return { anyPortHosts, exactEndpoints }
}

function parseWithPolicy(source: string, policy: HttpPolicy): SourcesParseResult {
  if (utf8Length(source) > MAX_SOURCE_BYTES) return invalid("Sources definition is too large.")
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    return invalid("Sources definition must be valid JSON.")
  }
  if (!isPlainObject(value)) return invalid("Sources definition must be an object.")
  const issues: string[] = []
  rejectUnknownKeys(value, DEFINITION_KEYS, "$", issues)
  if (!Array.isArray(value.sources)) {
    issues.push("$.sources must be an array.")
    return { valid: false, issues }
  }
  if (value.sources.length === 0 || value.sources.length > MAX_SOURCES) {
    issues.push(`$.sources must contain between 1 and ${MAX_SOURCES} sources.`)
  }
  const ids = new Set<string>()
  const sources: CitationSource[] = []
  value.sources.forEach((candidate, index) => {
    const path = `$.sources[${index}]`
    if (!isPlainObject(candidate)) {
      issues.push(`${path} must be an object.`)
      return
    }
    rejectUnknownKeys(candidate, SOURCE_KEYS, path, issues)
    const id = readRequiredString(candidate.id, `${path}.id`, MAX_ID_LENGTH, issues)
    const title = readRequiredString(candidate.title, `${path}.title`, MAX_TITLE_LENGTH, issues)
    const rawUrl = readRequiredString(candidate.url, `${path}.url`, MAX_URL_LENGTH, issues)
    const citedText = candidate.citedText === undefined
      ? undefined
      : readRequiredString(candidate.citedText, `${path}.citedText`, MAX_CITED_TEXT_LENGTH, issues)
    if (id !== undefined) {
      if (!SAFE_ID.test(id)) issues.push(`${path}.id is not a safe ID.`)
      if (ids.has(id)) issues.push(`${path}.id must be unique.`)
      ids.add(id)
    }
    const url = rawUrl === undefined ? undefined : normalizeUrl(rawUrl, path, policy, issues)
    if (id !== undefined && title !== undefined && url !== undefined && (candidate.citedText === undefined || citedText !== undefined)) {
      sources.push({ id, title, url, ...(citedText === undefined ? {} : { citedText }) })
    }
  })
  return issues.length === 0 ? { valid: true, data: { sources } } : { valid: false, issues }
}

function normalizeUrl(raw: string, path: string, policy: HttpPolicy, issues: string[]): string | undefined {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    issues.push(`${path}.url must be an absolute URL.`)
    return undefined
  }
  if (url.username || url.password) {
    issues.push(`${path}.url must not contain credentials.`)
    return undefined
  }
  const protocol = url.protocol.toLowerCase()
  const endpoint = `${url.hostname.toLowerCase()}:${url.port || (protocol === "http:" ? "80" : "443")}`
  const httpAllowed = protocol === "http:"
    && (policy.anyPortHosts.has(url.hostname.toLowerCase()) || policy.exactEndpoints.has(endpoint))
  if (protocol !== "https:" && !httpAllowed) {
    issues.push(`${path}.url must use HTTPS or an allowed HTTP host.`)
    return undefined
  }
  const normalized = url.toString()
  if (normalized.length > MAX_URL_LENGTH) {
    issues.push(`${path}.url must contain at most ${MAX_URL_LENGTH} characters.`)
    return undefined
  }
  return normalized
}

function renderSources(definition: SourcesDefinition): RenderOutput {
  return element("section", { "data-aigui-citations": "", "aria-label": "Sources" }, [
    element("h2", undefined, [text("Sources")]),
    element("ol", undefined, definition.sources.map((source) => element("li", { "data-source-id": source.id }, [
      element("a", {
        href: source.url,
        target: "_blank",
        rel: "noopener noreferrer nofollow",
      }, [text(source.title)]),
      ...(source.citedText === undefined ? [] : [element("blockquote", undefined, [text(source.citedText)])]),
    ]))),
  ])
}

function loadingOutput(): RenderOutput {
  return element("div", { "data-aigui-block-loading": "", "data-block-type": "sources" }, [])
}

function invalidOutput(): RenderOutput {
  return element("div", { "data-aigui-citations-invalid": "", role: "status" }, [text("Sources unavailable.")])
}

function element(tag: string, props: Record<string, unknown> | undefined, children: RenderOutput[]): RenderOutput {
  return { kind: "element", tag, props, children }
}

function text(value: string): RenderOutput {
  return { kind: "html", html: escapeHtml(value) }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function readRequiredString(value: unknown, path: string, maxLength: number, issues: string[]): string | undefined {
  if (typeof value !== "string") {
    issues.push(`${path} must be a string.`)
    return undefined
  }
  if (value.length === 0 || value.length > maxLength) {
    issues.push(`${path} must contain between 1 and ${maxLength} characters.`)
    return undefined
  }
  return value
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: Set<string>, path: string, issues: string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push(`${path}.${key} is not supported.`)
  }
}

function invalid(issue: string): SourcesParseResult {
  return { valid: false, issues: [issue] }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function readExplicitPort(host: string): string | undefined {
  if (host.startsWith("[")) {
    const match = host.match(/^\[[^\]]+\]:(\d+)$/)
    return match?.[1]
  }
  const match = host.match(/:(\d+)$/)
  return match?.[1]
}
