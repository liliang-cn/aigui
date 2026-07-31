import type MarkdownIt from "markdown-it"
import type { CardRegistry } from "./card-registry"
import type { DebugOptions } from "./debug-events"

/** Framework-agnostic render node. */
export interface ASTNode {
  key: string          // stable id for diffing
  type: string         // "paragraph" | "heading" | "code" | "card" | "html" | plugin types
  tag?: string
  content?: string
  html?: string
  attrs?: Record<string, string>
  children?: ASTNode[]
  /** Whether a streaming block has enough source to invoke its renderer. */
  complete?: boolean
  /** card-specific payload */
  card?: { id?: string; type: string; data: unknown; complete: boolean; valid: boolean }
}

/** Patch event produced by diffing. */
export type Patch =
  | { op: "insert"; index: number; node: ASTNode }
  | { op: "update"; key: string; node: ASTNode }
  | { op: "move"; key: string; index: number }
  | { op: "remove"; key: string }

/** Framework-neutral render descriptor returned by plugin node renderers. */
export type RenderOutput =
  /**
   * `trusted` marks markup the plugin built itself rather than markup taken from the model.
   *
   * A plugin that renders a diagram returns SVG, and sanitizing SVG escapes it — the reader gets
   * the source text instead of the picture. Hosts worked around that by matching the plugin's
   * internal id prefix with a regular expression, which breaks the moment the plugin renames its
   * ids and lets any model output wearing that prefix through unsanitized. A plugin is code the
   * host chose to install, so it can say so itself; a host that disagrees sets
   * `sanitize: { trustPlugins: false }`.
   */
  | { kind: "html"; html: string; trusted?: boolean }
  | { kind: "element"; tag: string; props?: Record<string, unknown>; children?: RenderOutput[] }
  | { kind: "card"; type: string; data: unknown }
  | { kind: "mount"; mount: (el: HTMLElement, context: RenderMountContext) => void | (() => void) }

export interface MountCardSlotRequest {
  type: string
  data: unknown
}

export interface MountedCardSlot {
  update(data: unknown): void
  destroy(): void
}

export interface RenderMountContext {
  mountCard?: (host: HTMLElement, request: MountCardSlotRequest) => MountedCardSlot | undefined
}

/** What the host can tell a plugin about the surroundings it is rendering into. */
export interface NodeRenderContext {
  /**
   * The host's colour scheme, "light" or "dark" by convention.
   *
   * A diagram or a chart picks its own palette, and a plugin has no way to read the palette of
   * the page it is embedded in, so without this an answer rendered on a dark page comes back
   * with white plot areas.
   */
  readonly theme?: string
  /**
   * The host's locale as a BCP-47 tag, e.g. "zh-CN".
   *
   * A plugin draws its own labels — a Copy button, an error line — and cannot read the page's
   * language, so without this a Chinese product renders English chrome around Chinese content.
   * English is the fallback for anything a plugin has not translated.
   */
  readonly locale?: string
}

export type NodeRenderer = (node: ASTNode, context?: NodeRenderContext) => RenderOutput | Promise<RenderOutput>

export interface PluginCommitContext {
  readonly generation: number
  emitDebug(type: string, data?: Record<string, unknown>): void
}

type KnownJSONSchemaType = "object" | "array" | "string" | "number" | "integer" | "boolean" | "null"

export interface JSONSchema {
  type?: KnownJSONSchemaType | (string & {})
  properties?: Record<string, JSONSchema>
  items?: JSONSchema
  required?: readonly string[]
  additionalProperties?: boolean | JSONSchema
  enum?: readonly unknown[]
  const?: unknown
  minLength?: number
  maxLength?: number
  pattern?: string
  minimum?: number
  maximum?: number
  minItems?: number
  maxItems?: number
  [k: string]: unknown
}

export interface CardDef<TData = unknown, TComponent = unknown> {
  type: string
  description: string
  schema?: JSONSchema
  example?: TData
  render?: TComponent
  validate?: (data: TData) => boolean
}

export interface AIGuiPlugin {
  name: string
  extendParser?: (md: MarkdownIt) => void
  cards?: CardDef[]
  nodeRenderers?: Record<string, NodeRenderer>
  isBlockComplete?: (nodeType: string, raw: string) => boolean
  /** Runs synchronously after the AST is finalized and before patches are dispatched. */
  onASTCommit?: (nodes: readonly ASTNode[], context: PluginCommitContext) => void
  css?: string
  /**
   * LLM-facing guidance describing this plugin's fence syntax.
   *
   * A host does not read this field itself: `buildSystemPrompt({ registry, plugins, locale })`
   * collects the card specs and every enabled plugin's spec in one call, already in the product's
   * language. Assembling it by hand — reading each plugin's spec, joining them, writing the
   * localized wording again — reinvents that badly, and a plugin added later is then missing from
   * the prompt while its renderer is installed.
   *
   * Receives the locale asked of `buildSystemPrompt`, so the rules can be written in the language
   * the product answers in — a Chinese persona followed by English rules reads as a contradiction
   * to the model. Plugins that only ship English simply ignore the argument.
   */
  promptSpec?: string | ((locale?: string) => string)
}

export interface RendererOptions extends DebugOptions {
  registry?: CardRegistry
  plugins?: AIGuiPlugin[]
  sanitize?: boolean | import("./sanitizer").SanitizeHtmlOptions
  /**
   * Whether raw HTML in the model's output is interpreted as markup. On by default.
   *
   * A tag a model wrote inside prose is usually text it is describing, not markup it means: one
   * stray `<code>` in a sentence about code swallows the rest of the line into an element. Turning
   * this off escapes every tag the model writes and shows the characters instead, which is what a
   * product wants when the model is meant to produce markdown and nothing else. It is not a
   * substitute for `sanitize` — a plugin's own markup and the host's cards are unaffected either
   * way.
   */
  rawHtml?: boolean
  /** Coalesce multiple pushes by scheduling one render callback. */
  scheduler?: (render: () => void) => void
  onPatch?: (patches: Patch[], nodes: ASTNode[]) => void
}

export interface FeedOptions {
  signal?: AbortSignal
}

export type FeedChunk = string | Uint8Array
export type FeedSource = AsyncIterable<FeedChunk> | ReadableStream<FeedChunk>
