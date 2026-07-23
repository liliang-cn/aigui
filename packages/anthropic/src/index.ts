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
    } else if (type === "content_block_start") {
      const block = object(event.content_block)
      if (text(block?.type) === "web_search_tool_result") {
        for (const item of Array.isArray(block?.content) ? block.content : []) { const data = citation(item); if (data) yield { type: "citation", data } }
      }
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
  const first = await iterator.next()
  if (first.done) return
  if (typeof first.value === "string" || first.value instanceof Uint8Array) {
    for await (const event of parseSSE(prepend(first.value, iterator), { ...options, parseJSON: true })) yield event.data
    return
  }
  yield first.value
  for (;;) { const result = await iterator.next(); if (result.done) return; yield result.value }
}
function citation(value: unknown): Citation | undefined {
  const source = object(value)
  if (!source) return undefined
  const result = defined({ type: text(source.type), id: text(source.id), url: text(source.url), title: text(source.title) ?? text(source.document_title), citedText: text(source.cited_text) })
  return Object.keys(result).length ? result : undefined
}
function usage(inputTokens?: number, outputTokens?: number): Usage | undefined { return inputTokens === undefined && outputTokens === undefined ? undefined : defined({ inputTokens, outputTokens, totalTokens: inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined }) }
function isTransport(value: AnthropicStreamSource): value is ByteStreamSource { return (typeof Response !== "undefined" && value instanceof Response) || (typeof value === "object" && value !== null && "getReader" in value) }
async function* prepend(first: string | Uint8Array, iterator: AsyncIterator<unknown>): AsyncGenerator<string | Uint8Array> { yield first; for (;;) { const result = await iterator.next(); if (result.done) return; if (typeof result.value !== "string" && !(result.value instanceof Uint8Array)) throw new TypeError("Mixed Anthropic stream chunk types"); yield result.value } }
function object(value: unknown): Record<string, unknown> | undefined { return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined }
function text(value: unknown): string | undefined { return typeof value === "string" ? value : undefined }
function numeric(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined }
function defined<T extends Record<string, unknown>>(value: T): T { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T }
