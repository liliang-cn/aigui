import { createParser } from "./parser"
import { diffAst } from "./diff"
import { repairMarkdown } from "./repair-markdown"
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

  constructor(options: RendererOptions = {}) {
    this.options = options
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
    const patches: Patch[] = diffAst(this.prevAst, nextAst)
    this.prevAst = nextAst
    if (patches.length > 0) this.options.onPatch?.(patches)
  }
}
