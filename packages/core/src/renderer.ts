import { createParserWithMetadata } from "./parser"
import type { ParseResult } from "./parser"
import { diffAst } from "./diff"
import { repairMarkdown } from "./repair-markdown"
import { sanitizeHtml } from "./sanitizer"
import type { SanitizeHtmlOptions } from "./sanitizer"
import type { ASTNode, FeedChunk, FeedOptions, FeedSource, Patch, RendererOptions } from "./types"
import { DebugEmitter } from "./debug-events"
import type { DebugEventListener } from "./debug-events"

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
  readonly debugSource = "renderer" as const
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
  private readonly debug: DebugEmitter

  constructor(options: RendererOptions = {}) {
    this.options = options
    this.debug = new DebugEmitter(this.debugSource, options)
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

  get debugEnabled(): boolean {
    return this.debug.available
  }

  emitDebug(type: string, data: Record<string, unknown> = {}): void {
    this.debug.emit(type, data)
  }

  push(chunk: string): void {
    this.buffer += chunk
    if (this.debug.active) this.debug.emit("chunk-received", { chunk, length: chunk.length, bufferLength: this.buffer.length })
    this.scheduleRender()
  }

  subscribeDebug(listener: DebugEventListener): () => void {
    return this.debug.subscribe(listener)
  }

  async feed(
    source: FeedSource,
    options: FeedOptions = {},
  ): Promise<void> {
    const generation = ++this.generation
    this.cancelActiveFeed(createAbortError("Superseded by a newer feed"))
    if (this.debug.active) this.debug.emit("feed-started", { generation })
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
      if (aborted) {
        if (this.debug.active) this.debug.emit("feed-cancelled", { generation, error: abortError })
        throw abortError
      }
      if (generation === this.generation && this.debug.active) this.debug.emit("feed-completed", { generation, bufferLength: this.buffer.length })
    } finally {
      if (!aborted && generation !== this.generation && this.debug.active) {
        this.debug.emit("feed-cancelled", { generation, reason: "superseded-or-reset" })
      }
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
    if (this.debug.active) this.debug.emit("renderer-reset", { patches })
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
    const debug = this.debug.active
    const renderStarted = debug ? now() : 0
    const previous = this.parsed
    let next: ParseResult
    let mode: "full" | "mutable-tail" = "full"
    if (previous?.incrementalSafe && previous.blocks.length > 1) {
      const mutable = previous.blocks.at(-1)!
      const stableBlocks = previous.blocks.slice(0, -1)
      const stableNodeEnd = mutable.nodeStart
      const rawTail = this.buffer.slice(mutable.start)
      const repaired = repairMarkdown(rawTail)
      if (debug) this.debug.emit("markdown-repaired", { mode: "mutable-tail", raw: rawTail, rawLength: rawTail.length, repaired, repairedLength: repaired.length, sourceOffset: mutable.start })
      const parseStarted = debug ? now() : 0
      const tail = this.parse(repaired, rawTail, mutable.start)
      if (debug) this.debug.emit("mutable-tail-reparsed", { sourceOffset: mutable.start, durationMs: now() - parseStarted })
      if (tail.incrementalSafe) {
        mode = "mutable-tail"
        if (this.sanitize !== false) this.sanitizeNodesWithDebug(tail.nodes)
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
        if (debug) this.debug.emit("stable-prefix-committed", { blocks: stableBlocks.length, nodes: stableNodeEnd })
      } else {
        const fullRepaired = repairMarkdown(this.buffer)
        if (debug) this.debug.emit("markdown-repaired", { mode: "full", raw: this.buffer, rawLength: this.buffer.length, repaired: fullRepaired, repairedLength: fullRepaired.length })
        const fullParseStarted = debug ? now() : 0
        next = this.parse(fullRepaired, this.buffer)
        if (debug) this.debug.emit("parse-completed", { mode: "full", durationMs: now() - fullParseStarted })
        if (this.sanitize !== false) this.sanitizeNodesWithDebug(next.nodes)
      }
    } else {
      const repaired = repairMarkdown(this.buffer)
      if (debug) this.debug.emit("markdown-repaired", { mode: "full", raw: this.buffer, rawLength: this.buffer.length, repaired, repairedLength: repaired.length })
      const parseStarted = debug ? now() : 0
      next = this.parse(repaired, this.buffer)
      if (debug) this.debug.emit("parse-completed", { mode: "full", durationMs: now() - parseStarted })
      if (this.sanitize !== false) this.sanitizeNodesWithDebug(next.nodes)
    }
    const nextAst = next.nodes
    for (const plugin of this.options.plugins ?? []) {
      if (!plugin.onASTCommit) continue
      try {
        plugin.onASTCommit(nextAst, {
          generation: this.generation,
          emitDebug: (type, data = {}) => this.debug.emit(type, { plugin: plugin.name, ...data }),
        })
      } catch (error) {
        if (debug) this.debug.emit("plugin-commit-failed", { plugin: plugin.name, error })
      }
    }
    const diffStarted = debug ? now() : 0
    const patches: Patch[] = diffAst(this.prevAst, nextAst)
    const diffDurationMs = debug ? now() - diffStarted : 0
    this.parsed = next
    this.prevAst = nextAst
    const patchDispatchStarted = debug ? now() : 0
    if (patches.length > 0) this.options.onPatch?.(patches, nextAst)
    const patchDispatchDurationMs = debug ? now() - patchDispatchStarted : 0
    if (debug) {
      this.debug.emit("ast-snapshot", { mode, nodes: nextAst })
      this.debug.emit("ast-patches", { patches, durationMs: diffDurationMs })
      this.debug.emit("patch-dispatched", { patches: patches.length, durationMs: patchDispatchDurationMs, renderDurationMs: now() - renderStarted })
    }
  }

  private sanitizeNodesWithDebug(nodes: ASTNode[]): void {
    if (this.sanitize === false) return
    if (!this.debug.active) {
      sanitizeNodes(nodes, this.sanitize)
      return
    }
    const inputSize = nodeMarkupSize(nodes)
    const started = now()
    sanitizeNodes(nodes, this.sanitize)
    this.debug.emit("sanitizer-completed", { inputSize, outputSize: nodeMarkupSize(nodes), durationMs: now() - started })
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

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now()
}

function nodeMarkupSize(nodes: ASTNode[]): number {
  let size = 0
  for (const node of nodes) {
    size += node.content?.length ?? 0
    size += node.html?.length ?? 0
    if (node.children) size += nodeMarkupSize(node.children)
  }
  return size
}
