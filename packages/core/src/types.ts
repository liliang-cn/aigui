import type MarkdownIt from "markdown-it"
import type { CardRegistry } from "./card-registry"

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
  card?: { type: string; data: unknown; complete: boolean; valid: boolean }
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
  | { kind: "mount"; mount: (el: HTMLElement) => void | (() => void) }

export type NodeRenderer = (node: ASTNode) => RenderOutput | Promise<RenderOutput>

export interface JSONSchema {
  type?: string
  properties?: Record<string, JSONSchema>
  items?: JSONSchema
  required?: string[]
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
  css?: string
  /** LLM-facing guidance describing this plugin's fence syntax. */
  promptSpec?: string
}

export interface RendererOptions {
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
