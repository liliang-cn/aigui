import { translator, type AIGuiPlugin, type ASTNode, type MessageBundle, type NodeRenderContext, type PluginCommitContext, type RenderOutput } from "@ai-gui/core"

const UI: MessageBundle = {
  en: { copy: "Copy", download: "Download", view: "Artifact view" },
  "zh-CN": { copy: "复制", download: "下载", view: "制品视图" },
}

const CREATE_KEYS = new Set(["version", "operationId", "artifact"])
const ARTIFACT_KEYS = new Set(["id", "title", "filename", "kind", "language", "content"])
const UPDATE_KEYS = new Set(["version", "operationId", "id", "baseRevision", "content", "title", "filename", "language"])
const RECORD_KEYS = new Set(["id", "title", "filename", "kind", "language", "content", "revision"])
const SNAPSHOT_KEYS = new Set(["version", "records", "receipts"])
const RECEIPT_SNAPSHOT_KEYS = new Set(["operationId", "canonical", "receipt"])
const RECEIPT_KEYS = new Set(["operationId", "command", "record"])
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const SAFE_OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const KINDS = new Set<ArtifactKind>(["text", "code", "markdown", "json"])
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"])
const MAX_SOURCE_BYTES = 1024 * 1024
const DEFAULT_MAX_ARTIFACTS = 100
const DEFAULT_MAX_ARTIFACT_BYTES = 512 * 1024
const DEFAULT_MAX_TOTAL_BYTES = 4 * 1024 * 1024
const MAX_TITLE_LENGTH = 256
const MAX_FILENAME_LENGTH = 180
const MAX_LANGUAGE_LENGTH = 64
const MAX_JSON_PREVIEW_CHARS = 256 * 1024

export type ArtifactKind = "text" | "code" | "markdown" | "json"

export interface ArtifactDefinition {
  id: string
  title: string
  filename: string
  kind: ArtifactKind
  language?: string
  content: string
}

export interface ArtifactCreateCommand {
  version: 1
  operationId: string
  artifact: ArtifactDefinition
}

export interface ArtifactUpdateCommand {
  version: 1
  operationId: string
  id: string
  baseRevision: number
  content: string
  title?: string
  filename?: string
  language?: string
}

export interface ArtifactRecord extends ArtifactDefinition {
  revision: number
}

export interface ArtifactOperationReceipt {
  operationId: string
  command: "create" | "update"
  record: ArtifactRecord
}

export interface ArtifactSnapshotReceipt {
  operationId: string
  canonical: string
  receipt: ArtifactOperationReceipt
}

export interface ArtifactSnapshot {
  version: 1
  records: ArtifactRecord[]
  receipts: ArtifactSnapshotReceipt[]
}

export interface ArtifactStoreOptions {
  maxArtifacts?: number
  maxArtifactBytes?: number
  maxTotalBytes?: number
}

export interface ArtifactPluginOptions {
  store?: ArtifactStore
}

export type ArtifactParseResult<T> = { valid: true; data: T } | { valid: false; issues: string[] }
export type ArtifactListener = (record: ArtifactRecord | undefined) => void
export type ArtifactStoreListener = (records: readonly ArtifactRecord[]) => void

export class ArtifactError extends Error {}
export class ArtifactValidationError extends ArtifactError {}
export class ArtifactLimitError extends ArtifactError {}
export class ArtifactNotFoundError extends ArtifactError {}
export class ArtifactConflictError extends ArtifactError {}
export class ArtifactOperationConflictError extends ArtifactError {}
export class ArtifactSnapshotError extends ArtifactError {}

export class ArtifactStore {
  private records = new Map<string, ArtifactRecord>()
  private receipts = new Map<string, { canonical: string; receipt: ArtifactOperationReceipt }>()
  private listeners = new Map<string, Set<ArtifactListener>>()
  private allListeners = new Set<ArtifactStoreListener>()
  private epoch = 0
  private readonly limits: Required<ArtifactStoreOptions>

  constructor(options: ArtifactStoreOptions = {}) {
    assertPlainOptions(options)
    this.limits = {
      maxArtifacts: readPositiveLimit(options.maxArtifacts, DEFAULT_MAX_ARTIFACTS, "maxArtifacts", DEFAULT_MAX_ARTIFACTS),
      maxArtifactBytes: readPositiveLimit(options.maxArtifactBytes, DEFAULT_MAX_ARTIFACT_BYTES, "maxArtifactBytes", DEFAULT_MAX_ARTIFACT_BYTES),
      maxTotalBytes: readPositiveLimit(options.maxTotalBytes, DEFAULT_MAX_TOTAL_BYTES, "maxTotalBytes", DEFAULT_MAX_TOTAL_BYTES),
    }
  }

  create(command: ArtifactCreateCommand): ArtifactOperationReceipt {
    const parsed = validateCreateValue(command)
    if (!parsed.valid) throw new ArtifactValidationError(parsed.issues.join(" "))
    const canonical = canonicalCreate(parsed.data)
    const prior = this.checkReceipt(parsed.data.operationId, canonical)
    if (prior) return prior
    if (this.records.has(parsed.data.artifact.id)) throw new ArtifactConflictError("Artifact already exists.")
    const record = freezeRecord({ ...parsed.data.artifact, revision: 0 })
    this.assertCapacity(record)
    this.records.set(record.id, record)
    const receipt = freezeReceipt({ operationId: parsed.data.operationId, command: "create", record })
    this.receipts.set(receipt.operationId, { canonical, receipt })
    this.mutated(record.id)
    return receipt
  }

  update(command: ArtifactUpdateCommand): ArtifactOperationReceipt {
    const parsed = validateUpdateValue(command)
    if (!parsed.valid) throw new ArtifactValidationError(parsed.issues.join(" "))
    const canonical = canonicalUpdate(parsed.data)
    const prior = this.checkReceipt(parsed.data.operationId, canonical)
    if (prior) return prior
    const current = this.records.get(parsed.data.id)
    if (!current) throw new ArtifactNotFoundError("Artifact does not exist.")
    if (current.revision !== parsed.data.baseRevision) throw new ArtifactConflictError("Artifact revision conflict.")
    if (parsed.data.language !== undefined && current.kind !== "code") throw new ArtifactValidationError("Language can be updated only for code artifacts.")
    const record = freezeRecord({
      ...current,
      content: parsed.data.content,
      title: parsed.data.title ?? current.title,
      filename: parsed.data.filename ?? current.filename,
      ...(current.language === undefined ? {} : { language: current.language }),
      ...(parsed.data.language === undefined ? {} : { language: parsed.data.language }),
      revision: current.revision + 1,
    })
    this.assertCapacity(record, current.id)
    this.records.set(record.id, record)
    const receipt = freezeReceipt({ operationId: parsed.data.operationId, command: "update", record })
    this.receipts.set(receipt.operationId, { canonical, receipt })
    this.mutated(record.id)
    return receipt
  }

  get(id: string): ArtifactRecord | undefined {
    return this.records.get(id)
  }

  list(): readonly ArtifactRecord[] {
    return Object.freeze([...this.records.values()])
  }

  subscribe(id: string, listener: ArtifactListener): () => void {
    if (typeof listener !== "function") throw new TypeError("Artifact listener must be a function.")
    let listeners = this.listeners.get(id)
    if (!listeners) this.listeners.set(id, listeners = new Set())
    listeners.add(listener)
    let active = true
    return () => {
      if (!active) return
      active = false
      listeners?.delete(listener)
      if (listeners?.size === 0) this.listeners.delete(id)
    }
  }

  subscribeAll(listener: ArtifactStoreListener): () => void {
    if (typeof listener !== "function") throw new TypeError("Artifact listener must be a function.")
    this.allListeners.add(listener)
    let active = true
    return () => {
      if (!active) return
      active = false
      this.allListeners.delete(listener)
    }
  }

  delete(id: string): boolean {
    if (!this.records.delete(id)) return false
    this.mutated(id)
    return true
  }

  clear(): void {
    if (this.records.size === 0 && this.receipts.size === 0) return
    const ids = [...this.records.keys()]
    this.records.clear()
    this.receipts.clear()
    this.epoch++
    for (const id of ids) this.notifyOne(id)
    this.notifyAll()
  }

  snapshot(): ArtifactSnapshot {
    return deepFreeze({
      version: 1 as const,
      records: [...this.records.values()].map((record) => ({ ...record })),
      receipts: [...this.receipts.entries()].map(([operationId, entry]) => ({
        operationId,
        canonical: entry.canonical,
        receipt: { ...entry.receipt, record: { ...entry.receipt.record } },
      })),
    })
  }

  restore(snapshot: unknown): void {
    let restored: { records: Map<string, ArtifactRecord>; receipts: Map<string, { canonical: string; receipt: ArtifactOperationReceipt }> }
    try {
      restored = validateSnapshot(snapshot, this.limits)
    } catch (error) {
      throw new ArtifactSnapshotError(error instanceof Error ? error.message : "Invalid artifact snapshot.")
    }
    const oldIds = new Set(this.records.keys())
    this.records = restored.records
    this.receipts = restored.receipts
    this.epoch++
    for (const id of this.records.keys()) oldIds.add(id)
    for (const id of oldIds) this.notifyOne(id)
    this.notifyAll()
  }

  captureMutationEpoch(): number {
    return this.epoch
  }

  private checkReceipt(operationId: string, canonical: string): ArtifactOperationReceipt | undefined {
    const prior = this.receipts.get(operationId)
    if (!prior) return undefined
    if (prior.canonical !== canonical) throw new ArtifactOperationConflictError("Operation ID was already used for another command.")
    return prior.receipt
  }

  private assertCapacity(next: ArtifactRecord, replacingId?: string): void {
    if (!replacingId && this.records.size >= this.limits.maxArtifacts) throw new ArtifactLimitError("Artifact count limit exceeded.")
    const bytes = utf8Bytes(next.content)
    if (bytes > this.limits.maxArtifactBytes) throw new ArtifactLimitError("Artifact size limit exceeded.")
    let total = bytes
    for (const record of this.records.values()) if (record.id !== replacingId) total += utf8Bytes(record.content)
    if (total > this.limits.maxTotalBytes) throw new ArtifactLimitError("Artifact total size limit exceeded.")
  }

  private mutated(id: string): void {
    this.epoch++
    this.notifyOne(id)
    this.notifyAll()
  }

  private notifyOne(id: string): void {
    const record = this.records.get(id)
    for (const listener of [...(this.listeners.get(id) ?? [])]) safeCall(listener, record)
  }

  private notifyAll(): void {
    const records = this.list()
    for (const listener of [...this.allListeners]) safeCall(listener, records)
  }
}

export function parseArtifactCreate(source: string): ArtifactParseResult<ArtifactCreateCommand> {
  return parseCommand(source, validateCreateValue, "Artifact create command")
}

export function parseArtifactUpdate(source: string): ArtifactParseResult<ArtifactUpdateCommand> {
  return parseCommand(source, validateUpdateValue, "Artifact update command")
}

export function serializeArtifactCreate(command: ArtifactCreateCommand): string {
  const parsed = validateCreateValue(command)
  if (!parsed.valid) throw new ArtifactValidationError(parsed.issues.join(" "))
  return `\`\`\`artifact-create\n${JSON.stringify(parsed.data, null, 2)}\n\`\`\``
}

export function serializeArtifactUpdate(command: ArtifactUpdateCommand): string {
  const parsed = validateUpdateValue(command)
  if (!parsed.valid) throw new ArtifactValidationError(parsed.issues.join(" "))
  return `\`\`\`artifact-update\n${JSON.stringify(parsed.data, null, 2)}\n\`\`\``
}

/**
 * You rarely want this directly: `buildSystemPrompt({ registry, plugins, locale })` from
 * `@ai-gui/core` collects the card specs and every enabled plugin's spec in one call, in the
 * product's language. Reach for this only to inspect or override one plugin's rules.
 */
export function artifactPromptSpec(store?: ArtifactStore): string {
  const records = store?.list() ?? []
  const current = records.length === 0
    ? "Current artifacts: none."
    : `Current artifacts:\n${records.map((record) => `- ${record.id}: ${record.kind}, revision ${record.revision}, title ${JSON.stringify(record.title)}`).join("\n")}`
  return [
    "Artifacts use only fenced JSON commands, named exactly `artifact-create` and `artifact-update`.",
    "Create schema: {version:1, operationId, artifact:{id,title,filename,kind:text|code|markdown|json,language?,content}}. Do not send a create revision.",
    "Update schema: {version:1, operationId,id,baseRevision,content,title?,filename?,language?}. Updates replace full content; kind is immutable. There is no model delete command.",
    "Use a new safe operationId for each intended mutation. Never claim success; the application commits commands only after validation.",
    "Never emit HTML, scripts, executable URLs, actions, components, network requests, or other fence types. Markdown artifact content may contain Markdown and HTTPS links, but raw HTML never executes.",
    current,
  ].join("\n")
}

export function artifact(options: ArtifactPluginOptions = {}): AIGuiPlugin {
  if (!isPlainObject(options)) throw new TypeError("artifact() options must be a plain object.")
  rejectDangerousObjectKeys(options, "artifact options")
  for (const key of Object.keys(options)) if (key !== "store") throw new TypeError(`Unknown artifact option: ${key}`)
  const store = options.store ?? new ArtifactStore()
  if (!(store instanceof ArtifactStore)) throw new TypeError("artifact store must be an ArtifactStore.")
  const status = new WeakMap<ASTNode, "loading" | "accepted" | "rejected">()
  const outputs = new WeakMap<ASTNode, RenderOutput>()
  let anchor: ASTNode | undefined

  const render = (node: ASTNode, context?: NodeRenderContext): RenderOutput => {
    const cached = outputs.get(node)
    if (cached) return cached
    const state = status.get(node) ?? (node.complete ? "rejected" : "loading")
    let output: RenderOutput
    if (node === anchor && state === "accepted") {
      output = { kind: "mount", mount: (host: HTMLElement) => mountArtifactWorkspace(host, store, context?.locale) }
    } else if (state === "loading") {
      output = { kind: "element", tag: "div", props: { "data-aigui-block-loading": "", "data-block-type": node.type }, children: [] }
    } else {
      output = statusOutput(state === "accepted")
    }
    outputs.set(node, output)
    return output
  }

  return {
    name: "artifact",
    nodeRenderers: { "artifact-create": render, "artifact-update": render },
    onASTCommit: (nodes: readonly ASTNode[], context: PluginCommitContext) => {
      anchor = undefined
      for (const node of nodes) {
        if (node.type !== "artifact-create" && node.type !== "artifact-update") continue
        if (!node.complete) {
          status.set(node, "loading")
          continue
        }
        try {
          if (node.type === "artifact-create") {
            const parsed = parseArtifactCreate(node.content ?? "")
            if (!parsed.valid) throw new ArtifactValidationError("Invalid command.")
            store.create(parsed.data)
            status.set(node, "accepted")
            if (!anchor) anchor = node
          } else {
            const parsed = parseArtifactUpdate(node.content ?? "")
            if (!parsed.valid) throw new ArtifactValidationError("Invalid command.")
            store.update(parsed.data)
            status.set(node, "accepted")
          }
          context.emitDebug("artifact-command-committed", { nodeType: node.type, nodeKey: node.key })
        } catch (error) {
          status.set(node, "rejected")
          context.emitDebug("artifact-command-rejected", { nodeType: node.type, nodeKey: node.key, errorName: error instanceof Error ? error.name : "Error" })
        }
      }
    },
    promptSpec: () => artifactPromptSpec(store),
    css: artifactCss,
  }
}

export function mountArtifactWorkspace(host: HTMLElement, store: ArtifactStore, locale?: string): () => void {
  const t = translator(UI, locale)
  if (!host || typeof host.replaceChildren !== "function") throw new TypeError("Artifact workspace requires an HTMLElement host.")
  if (!(store instanceof ArtifactStore)) throw new TypeError("Artifact workspace requires an ArtifactStore.")
  let selectedId: string | undefined
  let activeTab: "preview" | "source" = "preview"
  let disposed = false
  const objectUrls = new Set<string>()
  const timers = new Set<ReturnType<typeof setTimeout>>()

  const render = () => {
    if (disposed) return
    const records = store.list()
    if (!selectedId || !records.some((record) => record.id === selectedId)) selectedId = records[0]?.id
    const selected = selectedId ? store.get(selectedId) : undefined
    const root = element("section", { "data-aigui-artifact-workspace": "", "aria-label": "Artifact workspace" })
    const sidebar = element("nav", { "data-artifact-list": "", "aria-label": "Artifacts" })
    const list = element("ul")
    for (const record of records) {
      const item = element("li")
      const button = element("button", {
        type: "button",
        "data-artifact-id": record.id,
        "data-artifact-selected": String(record.id === selectedId),
        "aria-current": record.id === selectedId ? "true" : "false",
      }, record.title) as HTMLButtonElement
      button.addEventListener("click", () => { selectedId = record.id; render() })
      item.append(button); list.append(item)
    }
    sidebar.append(list)
    const main = element("div", { "data-artifact-main": "" })
    if (selected) {
      const header = element("header", { "data-artifact-header": "" })
      const identity = element("div", { "data-artifact-identity": "" })
      identity.append(element("h2", undefined, selected.title))
      identity.append(element("p", { "data-artifact-meta": "" }, `${selected.filename} · ${selected.kind} · revision ${selected.revision}`))
      header.append(identity)
      const actions = element("div", { "data-artifact-actions": "" })
      const copy = element("button", { type: "button", "data-artifact-copy": "" }, t("copy")) as HTMLButtonElement
      copy.addEventListener("click", () => { void copyText(selected.content) })
      const download = element("button", { type: "button", "data-artifact-download": "" }, t("download")) as HTMLButtonElement
      download.addEventListener("click", () => downloadRecord(selected, objectUrls, timers))
      actions.append(copy, download); header.append(actions); main.append(header)
      const tabs = element("div", { role: "tablist", "aria-label": t("view"), "data-artifact-tabs": "" })
      const previewTab = tabButton("preview", activeTab, () => { activeTab = "preview"; render() })
      const sourceTab = tabButton("source", activeTab, () => { activeTab = "source"; render() })
      const onTabKey = (event: KeyboardEvent) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return
        event.preventDefault()
        activeTab = event.key === "ArrowLeft" || event.key === "Home" ? "preview" : "source"
        render()
        host.querySelector<HTMLButtonElement>(`[data-artifact-tab="${activeTab}"]`)?.focus()
      }
      previewTab.addEventListener("keydown", onTabKey); sourceTab.addEventListener("keydown", onTabKey)
      tabs.append(previewTab, sourceTab); main.append(tabs)
      const panel = element("div", { role: "tabpanel", "data-artifact-panel": "", tabindex: "0" })
      if (activeTab === "source") panel.append(sourceView(selected.content))
      else panel.append(previewRecord(selected))
      main.append(panel)
    } else {
      main.append(element("p", { "data-artifact-empty": "" }, "No artifacts available."))
    }
    root.append(sidebar, main)
    host.replaceChildren(root)
  }

  const unsubscribe = store.subscribeAll(render)
  render()
  return () => {
    if (disposed) return
    disposed = true
    unsubscribe()
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
    for (const url of objectUrls) URL.revokeObjectURL(url)
    objectUrls.clear()
    host.replaceChildren()
  }
}

export const artifactCss = `
[data-aigui-artifact-workspace]{display:grid;grid-template-columns:minmax(10rem,15rem) minmax(0,1fr);border:1px solid #d7dce2;border-radius:.75rem;overflow:hidden;background:#fff;color:#17202a;min-height:20rem}
[data-artifact-list]{border-right:1px solid #d7dce2;padding:.75rem;overflow:auto}[data-artifact-list] ul{list-style:none;margin:0;padding:0;display:grid;gap:.25rem}
[data-artifact-list] button{width:100%;text-align:left;border:0;border-radius:.4rem;padding:.55rem .65rem;background:transparent;color:inherit}[data-artifact-selected="true"]{background:#eef3f8!important;font-weight:600}
[data-artifact-main]{min-width:0;padding:1rem}[data-artifact-header]{display:flex;align-items:center;justify-content:space-between;gap:1rem}[data-artifact-header] h2{margin:0;font-size:1rem;overflow-wrap:anywhere}
[data-artifact-meta]{margin:.25rem 0 0;color:#66707a;font:12px/1.4 ui-monospace,monospace;overflow-wrap:anywhere}
[data-artifact-actions],[data-artifact-tabs]{display:flex;gap:.5rem}[data-artifact-tabs]{margin:.85rem 0;border-bottom:1px solid #d7dce2}[data-artifact-tabs] button{border:0;background:transparent;padding:.5rem .2rem}[data-artifact-tabs] [aria-selected="true"]{border-bottom:2px solid currentColor;font-weight:600}
[data-artifact-preview],[data-artifact-source]{white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%;overflow:auto}[data-artifact-preview] pre,[data-artifact-source]{padding:.8rem;border-radius:.5rem;background:#f5f7f9}
@media(max-width:640px){[data-aigui-artifact-workspace]{grid-template-columns:1fr}[data-artifact-list]{border-right:0;border-bottom:1px solid #d7dce2;max-height:9rem}[data-artifact-header]{align-items:flex-start;flex-direction:column}}
`.trim()

function parseCommand<T>(source: string, validate: (value: unknown) => ArtifactParseResult<T>, label: string): ArtifactParseResult<T> {
  if (typeof source !== "string") return { valid: false, issues: [`${label} must be JSON text.`] }
  if (utf8Bytes(source) > MAX_SOURCE_BYTES) return { valid: false, issues: [`${label} is too large.`] }
  let value: unknown
  try { value = JSON.parse(source) } catch { return { valid: false, issues: [`${label} must be valid JSON.`] } }
  return validate(value)
}

function validateCreateValue(value: unknown): ArtifactParseResult<ArtifactCreateCommand> {
  const issues: string[] = []
  if (!isPlainObject(value)) return { valid: false, issues: ["$ must be a plain object."] }
  inspectObject(value, CREATE_KEYS, "$", issues)
  if (value.version !== 1) issues.push("$.version must equal 1.")
  const operationId = readSafeString(value.operationId, "$.operationId", issues, SAFE_OPERATION_ID, 128)
  const artifact = validateArtifact(value.artifact, "$.artifact", issues)
  if (issues.length || !operationId || !artifact) return { valid: false, issues }
  return { valid: true, data: { version: 1, operationId, artifact } }
}

function validateUpdateValue(value: unknown): ArtifactParseResult<ArtifactUpdateCommand> {
  const issues: string[] = []
  if (!isPlainObject(value)) return { valid: false, issues: ["$ must be a plain object."] }
  inspectObject(value, UPDATE_KEYS, "$", issues)
  if (value.version !== 1) issues.push("$.version must equal 1.")
  const operationId = readSafeString(value.operationId, "$.operationId", issues, SAFE_OPERATION_ID, 128)
  const id = readSafeString(value.id, "$.id", issues, SAFE_ID, 128)
  const baseRevision = readRevision(value.baseRevision, "$.baseRevision", issues)
  const content = readString(value.content, "$.content", issues)
  const title = value.title === undefined ? undefined : readBoundedString(value.title, "$.title", issues, MAX_TITLE_LENGTH)
  const filename = value.filename === undefined ? undefined : readFilename(value.filename, "$.filename", issues)
  const language = value.language === undefined ? undefined : readLanguage(value.language, "$.language", issues)
  if (issues.length || !operationId || !id || baseRevision === undefined || content === undefined) return { valid: false, issues }
  return { valid: true, data: { version: 1, operationId, id, baseRevision, content, ...(title === undefined ? {} : { title }), ...(filename === undefined ? {} : { filename }), ...(language === undefined ? {} : { language }) } }
}

function validateArtifact(value: unknown, path: string, issues: string[]): ArtifactDefinition | undefined {
  if (!isPlainObject(value)) { issues.push(`${path} must be a plain object.`); return undefined }
  inspectObject(value, ARTIFACT_KEYS, path, issues)
  const id = readSafeString(value.id, `${path}.id`, issues, SAFE_ID, 128)
  const title = readBoundedString(value.title, `${path}.title`, issues, MAX_TITLE_LENGTH)
  const filename = readFilename(value.filename, `${path}.filename`, issues)
  const kindValue = readBoundedString(value.kind, `${path}.kind`, issues, 16)
  const kind = kindValue && KINDS.has(kindValue as ArtifactKind) ? kindValue as ArtifactKind : undefined
  if (kindValue && !kind) issues.push(`${path}.kind is not supported.`)
  const language = value.language === undefined ? undefined : readLanguage(value.language, `${path}.language`, issues)
  const content = readString(value.content, `${path}.content`, issues)
  if (language !== undefined && kind !== "code") issues.push(`${path}.language is supported only for code artifacts.`)
  if (!id || title === undefined || !filename || !kind || content === undefined) return undefined
  return { id, title, filename, kind, ...(language === undefined ? {} : { language }), content }
}

function validateRecord(value: unknown, path: string, issues: string[]): ArtifactRecord | undefined {
  if (!isPlainObject(value)) { issues.push(`${path} must be a plain object.`); return undefined }
  inspectObject(value, RECORD_KEYS, path, issues)
  const artifact = validateArtifactKeys(value, path, issues)
  const revision = readRevision(value.revision, `${path}.revision`, issues)
  if (!artifact || revision === undefined) return undefined
  return freezeRecord({ ...artifact, revision })
}

function validateArtifactKeys(value: Record<string, unknown>, path: string, issues: string[]): ArtifactDefinition | undefined {
  const id = readSafeString(value.id, `${path}.id`, issues, SAFE_ID, 128)
  const title = readBoundedString(value.title, `${path}.title`, issues, MAX_TITLE_LENGTH)
  const filename = readFilename(value.filename, `${path}.filename`, issues)
  const kindValue = readBoundedString(value.kind, `${path}.kind`, issues, 16)
  const kind = kindValue && KINDS.has(kindValue as ArtifactKind) ? kindValue as ArtifactKind : undefined
  if (kindValue && !kind) issues.push(`${path}.kind is not supported.`)
  const language = value.language === undefined ? undefined : readLanguage(value.language, `${path}.language`, issues)
  const content = readString(value.content, `${path}.content`, issues)
  if (language !== undefined && kind !== "code") issues.push(`${path}.language is supported only for code artifacts.`)
  if (!id || title === undefined || !filename || !kind || content === undefined) return undefined
  return { id, title, filename, kind, ...(language === undefined ? {} : { language }), content }
}

function validateSnapshot(snapshot: unknown, limits: Required<ArtifactStoreOptions>) {
  assertAcyclicPlainJSON(snapshot)
  if (!isPlainObject(snapshot)) throw new Error("Snapshot must be a plain object.")
  const issues: string[] = []
  inspectObject(snapshot, SNAPSHOT_KEYS, "$", issues)
  if (snapshot.version !== 1) issues.push("$.version must equal 1.")
  if (!Array.isArray(snapshot.records)) issues.push("$.records must be an array.")
  if (!Array.isArray(snapshot.receipts)) issues.push("$.receipts must be an array.")
  const records = new Map<string, ArtifactRecord>()
  let total = 0
  if (Array.isArray(snapshot.records)) {
    if (snapshot.records.length > limits.maxArtifacts) issues.push("Snapshot artifact count limit exceeded.")
    snapshot.records.forEach((value, index) => {
      const record = validateRecord(value, `$.records[${index}]`, issues)
      if (!record) return
      if (records.has(record.id)) issues.push(`Duplicate artifact ID at $.records[${index}].`)
      const bytes = utf8Bytes(record.content)
      if (bytes > limits.maxArtifactBytes) issues.push(`Artifact size limit exceeded at $.records[${index}].`)
      total += bytes
      records.set(record.id, record)
    })
  }
  if (total > limits.maxTotalBytes) issues.push("Snapshot total size limit exceeded.")
  const receipts = new Map<string, { canonical: string; receipt: ArtifactOperationReceipt }>()
  if (Array.isArray(snapshot.receipts)) snapshot.receipts.forEach((value, index) => {
    const path = `$.receipts[${index}]`
    if (!isPlainObject(value)) { issues.push(`${path} must be a plain object.`); return }
    inspectObject(value, RECEIPT_SNAPSHOT_KEYS, path, issues)
    const operationId = readSafeString(value.operationId, `${path}.operationId`, issues, SAFE_OPERATION_ID, 128)
    const canonical = readString(value.canonical, `${path}.canonical`, issues)
    const receipt = validateReceipt(value.receipt, `${path}.receipt`, issues)
    if (!operationId || canonical === undefined || !receipt) return
    if (receipt.operationId !== operationId) issues.push(`${path} operation IDs must match.`)
    if (receipts.has(operationId)) issues.push(`${path}.operationId must be unique.`)
    let parsedCanonical: ArtifactParseResult<ArtifactCreateCommand | ArtifactUpdateCommand>
    try {
      const parsed = JSON.parse(canonical) as unknown
      parsedCanonical = receipt.command === "create" ? validateCreateValue(parsed) : validateUpdateValue(parsed)
    } catch { parsedCanonical = { valid: false, issues: ["Invalid canonical command."] } }
    if (!parsedCanonical.valid || (receipt.command === "create" ? canonicalCreate(parsedCanonical.data as ArtifactCreateCommand) : canonicalUpdate(parsedCanonical.data as ArtifactUpdateCommand)) !== canonical) issues.push(`${path}.canonical is invalid.`)
    else if (!receiptMatchesCommand(receipt, parsedCanonical.data)) issues.push(`${path}.receipt does not match its canonical command.`)
    receipts.set(operationId, { canonical, receipt })
  })
  if (issues.length) throw new Error(issues.join(" "))
  return { records, receipts }
}

function validateReceipt(value: unknown, path: string, issues: string[]): ArtifactOperationReceipt | undefined {
  if (!isPlainObject(value)) { issues.push(`${path} must be a plain object.`); return undefined }
  inspectObject(value, RECEIPT_KEYS, path, issues)
  const operationId = readSafeString(value.operationId, `${path}.operationId`, issues, SAFE_OPERATION_ID, 128)
  const command = value.command === "create" || value.command === "update" ? value.command : undefined
  if (!command) issues.push(`${path}.command is invalid.`)
  const record = validateRecord(value.record, `${path}.record`, issues)
  if (!operationId || !command || !record) return undefined
  return freezeReceipt({ operationId, command, record })
}

function canonicalCreate(command: ArtifactCreateCommand): string {
  return JSON.stringify({ version: 1, operationId: command.operationId, artifact: { id: command.artifact.id, title: command.artifact.title, filename: command.artifact.filename, kind: command.artifact.kind, ...(command.artifact.language === undefined ? {} : { language: command.artifact.language }), content: command.artifact.content } })
}

function canonicalUpdate(command: ArtifactUpdateCommand): string {
  return JSON.stringify({ version: 1, operationId: command.operationId, id: command.id, baseRevision: command.baseRevision, content: command.content, ...(command.title === undefined ? {} : { title: command.title }), ...(command.filename === undefined ? {} : { filename: command.filename }), ...(command.language === undefined ? {} : { language: command.language }) })
}

function receiptMatchesCommand(receipt: ArtifactOperationReceipt, command: ArtifactCreateCommand | ArtifactUpdateCommand): boolean {
  if (receipt.operationId !== command.operationId) return false
  if (receipt.command === "create") {
    if (!("artifact" in command) || receipt.record.revision !== 0) return false
    return sameArtifact(receipt.record, command.artifact)
  }
  if (!("id" in command)) return false
  if (receipt.record.id !== command.id || receipt.record.revision !== command.baseRevision + 1 || receipt.record.content !== command.content) return false
  if (command.title !== undefined && receipt.record.title !== command.title) return false
  if (command.filename !== undefined && receipt.record.filename !== command.filename) return false
  return command.language === undefined || receipt.record.language === command.language
}

function sameArtifact(record: ArtifactRecord, artifact: ArtifactDefinition): boolean {
  return record.id === artifact.id
    && record.title === artifact.title
    && record.filename === artifact.filename
    && record.kind === artifact.kind
    && record.language === artifact.language
    && record.content === artifact.content
}

function statusOutput(success: boolean): RenderOutput {
  return { kind: "element", tag: "div", props: { "data-aigui-artifact-command": success ? "accepted" : "rejected", role: "status" }, children: [{ kind: "element", tag: "span", children: [{ kind: "html", html: success ? "Artifact command accepted." : "Artifact command could not be applied." }] }] }
}

function previewRecord(record: ArtifactRecord): HTMLElement {
  const container = element("div", { "data-artifact-preview": "", "data-artifact-kind": record.kind })
  if (record.kind === "markdown") container.append(renderMarkdown(record.content))
  else if (record.kind === "json") container.append(renderJson(record.content))
  else {
    const pre = element("pre")
    const code = element("code", record.kind === "code" && record.language ? { "data-language": record.language } : undefined)
    code.textContent = record.content
    pre.append(code); container.append(pre)
  }
  return container
}

function sourceView(content: string): HTMLElement {
  const pre = element("pre", { "data-artifact-source": "" })
  const code = element("code")
  code.textContent = content
  pre.append(code)
  return pre
}

function renderJson(content: string): HTMLElement {
  const pre = element("pre")
  const code = element("code")
  try { code.textContent = JSON.stringify(JSON.parse(content), null, 2) } catch { code.textContent = content }
  pre.append(code)
  return pre
}

function renderMarkdown(content: string): HTMLElement {
  const root = element("div", { "data-artifact-markdown": "" })
  const lines = content.split(/\r\n|\r|\n/)
  let paragraph: string[] = []
  let code: string[] | undefined
  const flushParagraph = () => {
    if (!paragraph.length) return
    const p = element("p")
    appendInlineMarkdown(p, paragraph.join(" "))
    root.append(p); paragraph = []
  }
  const flushCode = () => {
    if (!code) return
    const pre = element("pre"); const child = element("code"); child.textContent = code.join("\n"); pre.append(child); root.append(pre); code = undefined
  }
  for (const line of lines) {
    if (line.startsWith("```")) { if (code) flushCode(); else { flushParagraph(); code = [] }; continue }
    if (code) { code.push(line); continue }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) { flushParagraph(); const h = element(`h${heading[1].length}`); appendInlineMarkdown(h, heading[2]); root.append(h); continue }
    if (/^\s*[-*+]\s+/.test(line)) { flushParagraph(); const ul = root.lastElementChild?.tagName === "UL" ? root.lastElementChild : element("ul"); if (!ul.parentNode) root.append(ul); const li = element("li"); appendInlineMarkdown(li, line.replace(/^\s*[-*+]\s+/, "")); ul.append(li); continue }
    if (line.trim() === "") { flushParagraph(); continue }
    paragraph.push(line)
  }
  flushParagraph(); flushCode()
  return root
}

function appendInlineMarkdown(parent: HTMLElement, text: string): void {
  const pattern = /\[([^\]\n]{1,512})\]\(([^)\s]{1,2048})\)/g
  let offset = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    parent.append(document.createTextNode(text.slice(offset, index)))
    const href = safeHttpsUrl(match[2])
    if (href) {
      const link = element("a", { href, rel: "noreferrer noopener", target: "_blank" }, match[1])
      parent.append(link)
    } else parent.append(document.createTextNode(match[0]))
    offset = index + match[0].length
  }
  parent.append(document.createTextNode(text.slice(offset)))
}

function safeHttpsUrl(value: string): string | undefined {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined } catch { return undefined }
}

function tabButton(tab: "preview" | "source", active: "preview" | "source", activate: () => void): HTMLButtonElement {
  const button = element("button", { type: "button", role: "tab", "data-artifact-tab": tab, "aria-selected": String(tab === active), tabindex: tab === active ? "0" : "-1" }, tab === "preview" ? "Preview" : "Source") as HTMLButtonElement
  button.addEventListener("click", activate)
  return button
}

async function copyText(content: string): Promise<void> {
  try { await navigator.clipboard?.writeText(content) } catch { /* Generic UI intentionally exposes no model or platform details. */ }
}

function downloadRecord(record: ArtifactRecord, urls: Set<string>, timers: Set<ReturnType<typeof setTimeout>>): void {
  const blob = new Blob([record.content], { type: artifactMime(record) })
  const url = URL.createObjectURL(blob)
  urls.add(url)
  const link = document.createElement("a")
  link.href = url
  link.download = record.filename
  link.rel = "noopener"
  link.click()
  const timer = setTimeout(() => { timers.delete(timer); urls.delete(url); URL.revokeObjectURL(url) }, 0)
  timers.add(timer)
}

function artifactMime(record: ArtifactRecord): string {
  if (record.kind === "markdown") return "text/markdown;charset=utf-8"
  if (record.kind === "json") return "application/json;charset=utf-8"
  if (record.kind === "code") return "text/plain;charset=utf-8"
  return "text/plain;charset=utf-8"
}

function element(tag: string, attrs?: Record<string, string>, text?: string): HTMLElement {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs ?? {})) node.setAttribute(key, value)
  if (text !== undefined) node.textContent = text
  return node
}

function inspectObject(value: Record<string, unknown>, allowed: Set<string>, path: string, issues: string[]): void {
  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key)) issues.push(`${path} contains a dangerous key.`)
    else if (!allowed.has(key)) issues.push(`${path}.${key} is not allowed.`)
  }
}

function readSafeString(value: unknown, path: string, issues: string[], pattern: RegExp, max: number): string | undefined {
  const string = readBoundedString(value, path, issues, max)
  if (string !== undefined && !pattern.test(string)) issues.push(`${path} is not safe.`)
  return string
}

function readBoundedString(value: unknown, path: string, issues: string[], max: number): string | undefined {
  const string = readString(value, path, issues)
  if (string !== undefined && (string.length === 0 || string.length > max)) issues.push(`${path} must contain 1 to ${max} characters.`)
  return string
}

function readString(value: unknown, path: string, issues: string[]): string | undefined {
  if (typeof value !== "string") { issues.push(`${path} must be a string.`); return undefined }
  return value
}

function readFilename(value: unknown, path: string, issues: string[]): string | undefined {
  const filename = readBoundedString(value, path, issues, MAX_FILENAME_LENGTH)
  if (filename !== undefined && (filename === "." || filename === ".." || /[\\/\u0000-\u001f\u007f]/.test(filename))) issues.push(`${path} is not a safe filename.`)
  return filename
}

function readLanguage(value: unknown, path: string, issues: string[]): string | undefined {
  const language = readBoundedString(value, path, issues, MAX_LANGUAGE_LENGTH)
  if (language !== undefined && !/^[A-Za-z0-9][A-Za-z0-9_+.-]{0,63}$/.test(language)) issues.push(`${path} is not a safe language name.`)
  return language
}

function readRevision(value: unknown, path: string, issues: string[]): number | undefined {
  if (!Number.isSafeInteger(value) || (value as number) < 0) { issues.push(`${path} must be a non-negative safe integer.`); return undefined }
  return value as number
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function assertPlainOptions(options: ArtifactStoreOptions): void {
  if (!isPlainObject(options)) throw new TypeError("ArtifactStore options must be a plain object.")
  rejectDangerousObjectKeys(options, "ArtifactStore options")
  for (const key of Object.keys(options)) if (key !== "maxArtifacts" && key !== "maxArtifactBytes" && key !== "maxTotalBytes") throw new TypeError(`Unknown ArtifactStore option: ${key}`)
}

function rejectDangerousObjectKeys(value: object, label: string): void {
  for (const key of Object.keys(value)) if (DANGEROUS_KEYS.has(key)) throw new TypeError(`${label} contains a dangerous key.`)
}

function readPositiveLimit(value: number | undefined, fallback: number, name: string, maximum: number): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) throw new TypeError(`${name} must be a positive safe integer no greater than ${maximum}.`)
  return value
}

function assertAcyclicPlainJSON(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error("Snapshot contains a non-finite number."); return }
  if (typeof value !== "object") throw new Error("Snapshot contains an unsupported value.")
  if (seen.has(value)) throw new Error("Snapshot contains a cycle.")
  seen.add(value)
  if (Array.isArray(value)) for (const item of value) assertAcyclicPlainJSON(item, seen)
  else {
    if (!isPlainObject(value)) throw new Error("Snapshot contains a class instance.")
    rejectDangerousObjectKeys(value, "Snapshot")
    for (const item of Object.values(value)) assertAcyclicPlainJSON(item, seen)
  }
  seen.delete(value)
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function freezeRecord(record: ArtifactRecord): ArtifactRecord {
  return Object.freeze(record)
}

function freezeReceipt(receipt: ArtifactOperationReceipt): ArtifactOperationReceipt {
  return Object.freeze(receipt)
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

function safeCall<T>(listener: (value: T) => void, value: T): void {
  try { listener(value) } catch { /* Observers cannot affect committed artifact state. */ }
}
