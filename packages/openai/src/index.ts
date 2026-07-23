import { parseSSE } from "@ai-gui/core"
import type { ByteStreamSource, Citation, ModelStreamEvent, StreamParseOptions, Usage } from "@ai-gui/core"

export type OpenAIStreamSource = ByteStreamSource | AsyncIterable<unknown>
export type OpenAIStreamOptions = StreamParseOptions

export async function* openAIStream(source: OpenAIStreamSource, options: OpenAIStreamOptions = {}): AsyncGenerator<ModelStreamEvent> {
  for await (const value of events(source, options)) yield* convert(value)
}

async function* events(source: OpenAIStreamSource, options: OpenAIStreamOptions): AsyncGenerator<unknown> {
  if (isTransport(source)) {
    for await (const event of parseSSE(source, { ...options, parseJSON: true })) yield event.data
    return
  }
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

async function* convert(value: unknown): AsyncGenerator<ModelStreamEvent> {
  const event = object(value)
  if (!event) return
  if (event.error !== undefined) { yield { type: "error", error: event.error }; return }
  const type = text(event.type)
  if (type === "error" || type === "response.failed" || type === "response.incomplete") {
    yield { type: "error", error: event.error ?? event.response ?? event }
  } else if (type === "response.output_text.delta" || type === "response.refusal.delta") {
    if (text(event.delta)) yield { type: "content", delta: text(event.delta)! }
  } else if (type === "response.reasoning_summary_text.delta" || type === "response.reasoning_text.delta") {
    if (text(event.delta)) yield { type: "reasoning", delta: text(event.delta)! }
  } else if (type === "response.output_text.annotation.added") {
    const data = normalizeCitation(event.annotation)
    if (data) yield { type: "citation", data }
  } else if (type === "response.completed") {
    const data = normalizeUsage(object(event.response)?.usage)
    if (data) yield { type: "usage", data }
  } else {
    for (const choice of Array.isArray(event.choices) ? event.choices : []) {
      const delta = object(object(choice)?.delta)
      const reasoning = text(delta?.reasoning_content) ?? text(delta?.reasoning)
      if (reasoning) yield { type: "reasoning", delta: reasoning }
      const content = contentText(delta?.content)
      if (content) yield { type: "content", delta: content }
      for (const annotation of Array.isArray(delta?.annotations) ? delta.annotations : []) {
        const data = normalizeCitation(annotation)
        if (data) yield { type: "citation", data }
      }
    }
    const data = normalizeUsage(event.usage)
    if (data) yield { type: "usage", data }
  }
}

function normalizeUsage(value: unknown): Usage | undefined {
  const usage = object(value)
  if (!usage) return undefined
  const inputTokens = numeric(usage.input_tokens) ?? numeric(usage.prompt_tokens)
  const outputTokens = numeric(usage.output_tokens) ?? numeric(usage.completion_tokens)
  const totalTokens = numeric(usage.total_tokens) ?? total(inputTokens, outputTokens)
  return inputTokens === undefined && outputTokens === undefined && totalTokens === undefined
    ? undefined : defined({ inputTokens, outputTokens, totalTokens })
}

function normalizeCitation(value: unknown): Citation | undefined {
  const outer = object(value)
  if (!outer) return undefined
  const nested = object(outer.url_citation)
  const source = nested ?? outer
  const result = defined({ type: text(source.type) ?? (nested ? "url_citation" : undefined), id: text(source.id), url: text(source.url), title: text(source.title), citedText: text(source.cited_text) })
  return Object.keys(result).length ? result : undefined
}

function contentText(value: unknown): string | undefined {
  if (typeof value === "string") return value
  if (!Array.isArray(value)) return undefined
  return value.map((part) => text(object(part)?.text) ?? "").join("") || undefined
}
function isTransport(value: OpenAIStreamSource): value is ByteStreamSource { return (typeof Response !== "undefined" && value instanceof Response) || (typeof value === "object" && value !== null && "getReader" in value) }
async function* prepend(first: string | Uint8Array, iterator: AsyncIterator<unknown>): AsyncGenerator<string | Uint8Array> { let done = false; try { yield first; for (;;) { const result = await iterator.next(); if (result.done) { done = true; return }; if (typeof result.value !== "string" && !(result.value instanceof Uint8Array)) throw new TypeError("Mixed OpenAI stream chunk types"); yield result.value } } finally { if (!done) await iterator.return?.() } }
async function next<T>(iterator: AsyncIterator<T>, signal?: AbortSignal): Promise<IteratorResult<T>> { if (!signal) return iterator.next(); if (signal.aborted) throw abortReason(signal); const pending = Promise.resolve(iterator.next()); let abort!: () => void; const aborted = new Promise<never>((_resolve, reject) => { abort = () => reject(abortReason(signal)); signal.addEventListener("abort", abort, { once: true }) }); try { const result = await Promise.race([pending, aborted]); if (signal.aborted) throw abortReason(signal); return result } finally { signal.removeEventListener("abort", abort) } }
function abortReason(signal: AbortSignal): unknown { if (signal.reason !== undefined) return signal.reason; const error = new Error("The operation was aborted"); error.name = "AbortError"; return error }
function object(value: unknown): Record<string, unknown> | undefined { return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined }
function text(value: unknown): string | undefined { return typeof value === "string" ? value : undefined }
function numeric(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined }
function total(a?: number, b?: number): number | undefined { return a === undefined || b === undefined ? undefined : a + b }
function defined<T extends Record<string, unknown>>(value: T): T { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T }
