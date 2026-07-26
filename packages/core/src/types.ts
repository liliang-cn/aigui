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
  | { kind: "html"; html: string }
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
  /** LLM-facing guidance describing this plugin's fence syntax. */
  promptSpec?: string | (() => string)
}

export interface RendererOptions extends DebugOptions {
  registry?: CardRegistry
  plugins?: AIGuiPlugin[]
  sanitize?: boolean | import("./sanitizer").SanitizeHtmlOptions
  /** Coalesce multiple pushes by scheduling one render callback. */
  scheduler?: (render: () => void) => void
  onPatch?: (patches: Patch[], nodes: ASTNode[]) => void
}

export interface FeedOptions {
  signal?: AbortSignal
}

export type FeedChunk = string | Uint8Array
export type FeedSource = AsyncIterable<FeedChunk> | ReadableStream<FeedChunk>
