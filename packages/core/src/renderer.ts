import { createParserWithMetadata } from "./parser"
import type { ParseResult } from "./parser"
import { diffAst } from "./diff"
import { repairMarkdown } from "./repair-markdown"
import { sanitizeHtml } from "./sanitizer"
import type { SanitizeHtmlOptions } from "./sanitizer"
import type { ASTNode, FeedChunk, FeedOptions, FeedSource, Patch, RendererOptions } from "./types"

interface ActiveFeed {
  generation: number
  cancel: (reason?: unknown) => void | Promise<void>
}

/**
 * Streaming render orchestrator: accumulate incoming markdown chunks, repair the
 * partial buffer, parse it into an AST, diff against the previous AST, and emit
 * the resulting patches via `onPatch`.
 */
export class Renderer {
  private buffer = ""
  private prevAst: ASTNode[] = []
  private parse: (src: string, rawSrc?: string, sourceOffset?: number) => ParseResult
  private parsed?: ParseResult
  private options: RendererOptions
  private sanitize: false | SanitizeHtmlOptions
  private generation = 0
  private activeFeed?: ActiveFeed
  private renderScheduled = false
  private scheduleGeneration = 0

  constructor(options: RendererOptions = {}) {
    this.options = options
    // Sanitization is on by default; only an explicit `false` disables it.
    this.sanitize = options.sanitize === false
      ? false
      : typeof options.sanitize === "object" ? options.sanitize : {}
    // Register plugin-provided cards into the registry once (not per render).
    if (options.registry) {
      for (const plugin of options.plugins ?? []) {
        for (const card of plugin.cards ?? []) options.registry.register(card)
      }
    }
    this.parse = createParserWithMetadata({ registry: options.registry, plugins: options.plugins })
  }

  push(chunk: string): void {
    this.buffer += chunk
    this.scheduleRender()
  }

  async feed(
    source: FeedSource,
    options: FeedOptions = {},
  ): Promise<void> {
    const generation = ++this.generation
    this.cancelActiveFeed(createAbortError("Superseded by a newer feed"))
    const decoder = new TextDecoder()
    const signal = options.signal
    if (signal?.aborted) throw abortReason(signal)

    let aborted = false
    let abortError: unknown
    const abort = () => {
      aborted = true
      abortError = abortReason(signal)
      if (this.activeFeed?.generation === generation) this.cancelActiveFeed(abortError)
    }
    signal?.addEventListener("abort", abort, { once: true })

    const consume = (chunk: FeedChunk) => {
      if (generation !== this.generation || aborted) return
      const text = typeof chunk === "string"
        ? decoder.decode() + chunk
        : decoder.decode(chunk, { stream: true })
      if (text) this.push(text)
    }

    try {
      if (isReadableStream(source)) {
        const reader = source.getReader()
        let cancelled = false
        this.activeFeed = {
          generation,
          cancel: async (reason) => {
            if (cancelled) return
            cancelled = true
            await reader.cancel(reason)
          },
        }
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done || generation !== this.generation || aborted) break
            if (value != null) consume(value)
          }
        } finally {
          reader.releaseLock()
        }
      } else {
        const iterator = source[Symbol.asyncIterator]()
        let returned = false
        this.activeFeed = {
          generation,
          cancel: async () => {
            if (returned) return
            returned = true
            await iterator.return?.()
          },
        }
        try {
          for (;;) {
            const { done, value } = await iterator.next()
            if (done || generation !== this.generation || aborted) break
            consume(value)
          }
        } finally {
          if ((generation !== this.generation || aborted) && !returned) {
            returned = true
            await iterator.return?.()
          }
        }
      }
      if (generation === this.generation && !aborted) {
        const tail = decoder.decode()
        if (tail) this.push(tail)
        this.flush()
      }
      if (aborted) throw abortError
    } finally {
      signal?.removeEventListener("abort", abort)
      if (this.activeFeed?.generation === generation) this.activeFeed = undefined
    }
  }

  reset(): void {
    this.generation++
    this.cancelActiveFeed(createAbortError("Renderer reset"))
    this.activeFeed = undefined
    this.buffer = ""
    this.renderScheduled = false
    this.scheduleGeneration++
    const patches = diffAst(this.prevAst, [])
    this.prevAst = []
    this.parsed = undefined
    this.options.onPatch?.(patches, [])
  }

  /** Immediately render pending buffered input, bypassing the scheduler. */
  flush(): void {
    if (!this.renderScheduled) return
    this.renderScheduled = false
    this.scheduleGeneration++
    this.render()
  }

  private scheduleRender(): void {
    if (!this.options.scheduler) {
      this.render()
      return
    }
    if (this.renderScheduled) return
    this.renderScheduled = true
    const scheduledGeneration = ++this.scheduleGeneration
    this.options.scheduler(() => {
      if (!this.renderScheduled || scheduledGeneration !== this.scheduleGeneration) return
      this.renderScheduled = false
      this.render()
    })
  }

  private cancelActiveFeed(reason: unknown): void {
    const active = this.activeFeed
    if (!active) return
    void Promise.resolve(active.cancel(reason)).catch(() => {})
  }

  private render(): void {
    const previous = this.parsed
    let next: ParseResult
    if (previous?.incrementalSafe && previous.blocks.length > 1) {
      const mutable = previous.blocks.at(-1)!
      const stableBlocks = previous.blocks.slice(0, -1)
      const stableNodeEnd = mutable.nodeStart
      const rawTail = this.buffer.slice(mutable.start)
      const tail = this.parse(repairMarkdown(rawTail), rawTail, mutable.start)
      if (tail.incrementalSafe) {
        if (this.sanitize !== false) sanitizeNodes(tail.nodes, this.sanitize)
        next = {
          nodes: [...previous.nodes.slice(0, stableNodeEnd), ...tail.nodes],
          blocks: [
            ...stableBlocks,
            ...tail.blocks.map((block) => ({
              ...block,
              nodeStart: block.nodeStart + stableNodeEnd,
              nodeEnd: block.nodeEnd + stableNodeEnd,
            })),
          ],
          incrementalSafe: true,
        }
      } else {
        next = this.parse(repairMarkdown(this.buffer), this.buffer)
        if (this.sanitize !== false) sanitizeNodes(next.nodes, this.sanitize)
      }
    } else {
      next = this.parse(repairMarkdown(this.buffer), this.buffer)
      if (this.sanitize !== false) sanitizeNodes(next.nodes, this.sanitize)
    }
    const nextAst = next.nodes
    const patches: Patch[] = diffAst(this.prevAst, nextAst)
    this.parsed = next
    this.prevAst = nextAst
    if (patches.length > 0) this.options.onPatch?.(patches, nextAst)
  }
}

/**
 * Recursively sanitize node markup in place: the content of `html` nodes and
 * the rendered inline `html` field carried by any node.
 */
function sanitizeNodes(nodes: ASTNode[], options: SanitizeHtmlOptions): void {
  for (const node of nodes) {
    if (node.type === "html" && typeof node.content === "string") {
      node.content = sanitizeHtml(node.content, options)
    }
    if (node.html) {
      node.html = sanitizeHtml(node.html, options)
    }
    if (node.children) sanitizeNodes(node.children, options)
  }
}

function isReadableStream(source: AsyncIterable<FeedChunk> | ReadableStream<FeedChunk>): source is ReadableStream<FeedChunk> {
  return "getReader" in source && typeof source.getReader === "function"
}

function abortReason(signal?: AbortSignal): unknown {
  return signal?.reason ?? createAbortError("The operation was aborted")
}

function createAbortError(message: string): Error {
  const error = new Error(message)
  error.name = "AbortError"
  return error
}
