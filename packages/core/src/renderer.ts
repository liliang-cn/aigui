import { createParser } from "./parser"
import { diffAst } from "./diff"
import { repairMarkdown } from "./repair-markdown"
import { sanitizeHtml } from "./sanitizer"
import type { ASTNode, Patch, RendererOptions } from "./types"

/**
 * Streaming render orchestrator: accumulate incoming markdown chunks, repair the
 * partial buffer, parse it into an AST, diff against the previous AST, and emit
 * the resulting patches via `onPatch`.
 */
export class Renderer {
  private buffer = ""
  private prevAst: ASTNode[] = []
  private parse: (src: string) => ASTNode[]
  private options: RendererOptions
  private sanitize: boolean

  constructor(options: RendererOptions = {}) {
    this.options = options
    // Sanitization is on by default; only an explicit `false` disables it.
    this.sanitize = options.sanitize !== false
    this.parse = createParser({ registry: options.registry })
  }

  push(chunk: string): void {
    this.buffer += chunk
    this.render()
  }

  async feed(source: AsyncIterable<string> | ReadableStream<string>): Promise<void> {
    if (Symbol.asyncIterator in source) {
      for await (const chunk of source as AsyncIterable<string>) this.push(chunk)
      return
    }
    const reader = (source as ReadableStream<string>).getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value != null) this.push(value)
    }
  }

  reset(): void {
    this.buffer = ""
    this.prevAst = []
  }

  private render(): void {
    const repaired = repairMarkdown(this.buffer)
    const nextAst = this.parse(repaired)
    if (this.sanitize) sanitizeNodes(nextAst)
    const patches: Patch[] = diffAst(this.prevAst, nextAst)
    this.prevAst = nextAst
    if (patches.length > 0) this.options.onPatch?.(patches)
  }
}

/** Recursively replace the content of every `html` node with a sanitized copy. */
function sanitizeNodes(nodes: ASTNode[]): void {
  for (const node of nodes) {
    if (node.type === "html" && typeof node.content === "string") {
      node.content = sanitizeHtml(node.content)
    }
    if (node.children) sanitizeNodes(node.children)
  }
}
