import { parseSSE } from "@ai-gui/core"
import type { ByteStreamSource, Citation, ModelStreamEvent, StreamParseOptions, Usage } from "@ai-gui/core"

export type AnthropicStreamSource = ByteStreamSource | AsyncIterable<unknown>
export type AnthropicStreamOptions = StreamParseOptions

export async function* anthropicStream(source: AnthropicStreamSource, options: AnthropicStreamOptions = {}): AsyncGenerator<ModelStreamEvent> {
  let inputTokens: number | undefined
  for await (const value of events(source, options)) {
    const event = object(value)
    if (!event) continue
    const type = text(event.type)
    if (type === "message_start") {
      inputTokens = numeric(object(object(event.message)?.usage)?.input_tokens) ?? inputTokens
    } else if (type === "content_block_delta") {
      const delta = object(event.delta)
      if (text(delta?.type) === "text_delta" && text(delta?.text)) yield { type: "content", delta: text(delta?.text)! }
      else if (text(delta?.type) === "thinking_delta" && text(delta?.thinking)) yield { type: "reasoning", delta: text(delta?.thinking)! }
      else if (text(delta?.type) === "citations_delta") { const data = citation(delta?.citation); if (data) yield { type: "citation", data } }
    } else if (type === "message_delta") {
      const outputTokens = numeric(object(event.usage)?.output_tokens)
      const data = usage(inputTokens, outputTokens)
      if (data) yield { type: "usage", data }
    } else if (type === "error") yield { type: "error", error: event.error ?? event }
  }
}

async function* events(source: AnthropicStreamSource, options: AnthropicStreamOptions): AsyncGenerator<unknown> {
  if (isTransport(source)) { for await (const event of parseSSE(source, { ...options, parseJSON: true })) yield event.data; return }
  const iterator = source[Symbol.asyncIterator]()
  let done = false
  let delegated = false
  try {
    const first = await next(iterator, options.signal)
    if (first.done) { done = true; return }
    if (typeof first.value === "string" || first.value instanceof Uint8Array) {
      delegated = true
      for await (const event of parseSSE(prepend(first.value, iterator), { ...options, parseJSON: true })) yield event.data
      return
    }
    yield first.value
    for (;;) { const result = await next(iterator, options.signal); if (result.done) { done = true; return }; yield result.value }
  } finally {
    if (!done && !delegated) await iterator.return?.()
  }
}
function citation(value: unknown): Citation | undefined {
  const source = object(value)
  if (!source) return undefined
  const result = defined({ type: text(source.type), id: text(source.id), url: text(source.url), title: text(source.title) ?? text(source.document_title), citedText: text(source.cited_text) })
  return Object.keys(result).length ? result : undefined
}
function usage(inputTokens?: number, outputTokens?: number): Usage | undefined { return inputTokens === undefined && outputTokens === undefined ? undefined : defined({ inputTokens, outputTokens, totalTokens: inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined }) }
function isTransport(value: AnthropicStreamSource): value is ByteStreamSource { return (typeof Response !== "undefined" && value instanceof Response) || (typeof value === "object" && value !== null && "getReader" in value) }
async function* prepend(first: string | Uint8Array, iterator: AsyncIterator<unknown>): AsyncGenerator<string | Uint8Array> { let done = false; try { yield first; for (;;) { const result = await iterator.next(); if (result.done) { done = true; return }; if (typeof result.value !== "string" && !(result.value instanceof Uint8Array)) throw new TypeError("Mixed Anthropic stream chunk types"); yield result.value } } finally { if (!done) await iterator.return?.() } }
async function next<T>(iterator: AsyncIterator<T>, signal?: AbortSignal): Promise<IteratorResult<T>> { if (!signal) return iterator.next(); if (signal.aborted) throw abortReason(signal); const pending = Promise.resolve(iterator.next()); let abort!: () => void; const aborted = new Promise<never>((_resolve, reject) => { abort = () => reject(abortReason(signal)); signal.addEventListener("abort", abort, { once: true }) }); try { const result = await Promise.race([pending, aborted]); if (signal.aborted) throw abortReason(signal); return result } finally { signal.removeEventListener("abort", abort) } }
function abortReason(signal: AbortSignal): unknown { if (signal.reason !== undefined) return signal.reason; const error = new Error("The operation was aborted"); error.name = "AbortError"; return error }
function object(value: unknown): Record<string, unknown> | undefined { return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined }
function text(value: unknown): string | undefined { return typeof value === "string" ? value : undefined }
function numeric(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined }
function defined<T extends Record<string, unknown>>(value: T): T { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T }
