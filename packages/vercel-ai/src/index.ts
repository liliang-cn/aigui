import { parseSSE, textLines } from "@ai-gui/core"
import type { ByteStreamSource, Citation, ModelStreamEvent, StreamParseOptions, Usage } from "@ai-gui/core"

export type VercelAIStreamSource = ByteStreamSource | AsyncIterable<unknown>
export type VercelAIStreamOptions = StreamParseOptions & { protocol?: "auto" | "sse" | "data" }

export async function* vercelAIStream(source: VercelAIStreamSource, options: VercelAIStreamOptions = {}): AsyncGenerator<ModelStreamEvent> {
  for await (const part of parts(source, options)) yield* convert(part)
}

async function* parts(source: VercelAIStreamSource, options: VercelAIStreamOptions): AsyncGenerator<unknown> {
  if (!isTransport(source)) {
    const iterator = source[Symbol.asyncIterator]()
    const first = await iterator.next()
    if (first.done) return
    if (typeof first.value === "string" || first.value instanceof Uint8Array) {
      yield* transportParts(prepend(first.value, iterator), options, options.protocol === "sse" ? "sse" : "data")
      return
    }
    yield first.value
    for (;;) { const result = await iterator.next(); if (result.done) return; yield result.value }
    return
  }
  const protocol = options.protocol === "sse" || (options.protocol !== "data" && isSSEResponse(source)) ? "sse" : "data"
  yield* transportParts(source, options, protocol)
}

async function* transportParts(source: ByteStreamSource, options: VercelAIStreamOptions, protocol: "sse" | "data"): AsyncGenerator<unknown> {
  if (protocol === "sse") {
    for await (const event of parseSSE(source, { ...options, parseJSON: true })) yield event.data
    return
  }
  for await (const line of textLines(source, options)) {
    if (!line) continue
    const colon = line.indexOf(":")
    if (colon < 0) { malformed(options, `Invalid Vercel AI data stream line: ${line}`, line); continue }
    const code = line.slice(0, colon)
    const input = line.slice(colon + 1)
    try { yield { __dataCode: code, value: JSON.parse(input) } }
    catch (cause) { const error = new SyntaxError(`Invalid Vercel AI data stream JSON: ${input}`, { cause }); if (options.onMalformed?.(error, input) !== "skip") throw error }
  }
}

async function* convert(value: unknown): AsyncGenerator<ModelStreamEvent> {
  const part = object(value)
  if (!part) return
  const code = text(part.__dataCode)
  if (code !== undefined) {
    const payload = part.value
    if (code === "0") { if (typeof payload === "string") yield { type: "content", delta: payload } }
    else if (code === "8") { for (const item of Array.isArray(payload) ? payload : [payload]) { const data = citation(item); if (data) yield { type: "citation", data } } }
    else if (code === "d" || code === "e") { const data = usage(object(payload)?.usage); if (data) yield { type: "usage", data } }
    else if (code === "3") yield { type: "error", error: payload }
    else if (code === "g") yield* convert(payload)
    return
  }
  const type = text(part.type)
  if (type === "text-delta") {
    const delta = text(part.textDelta) ?? text(part.delta)
    if (delta) yield { type: "content", delta }
  } else if (type === "reasoning-delta") {
    const delta = text(part.textDelta) ?? text(part.delta)
    if (delta) yield { type: "reasoning", delta }
  } else if (type === "source" || type === "source-url" || type === "source-document") {
    const data = citation(part.source ?? part)
    if (data) yield { type: "citation", data }
  } else if (type === "finish" || type === "finish-step") {
    const data = usage(part.totalUsage ?? part.usage)
    if (data) yield { type: "usage", data }
  } else if (type === "error") yield { type: "error", error: part.error }
}

function citation(value: unknown): Citation | undefined {
  const source = object(value)
  if (!source) return undefined
  const result = defined({ type: text(source.type), sourceType: text(source.sourceType), id: text(source.id), url: text(source.url), title: text(source.title) })
  return Object.keys(result).length ? result : undefined
}
function usage(value: unknown): Usage | undefined {
  const source = object(value)
  if (!source) return undefined
  const inputTokens = numeric(source.inputTokens) ?? numeric(source.promptTokens)
  const outputTokens = numeric(source.outputTokens) ?? numeric(source.completionTokens)
  const totalTokens = numeric(source.totalTokens) ?? (inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined)
  return inputTokens === undefined && outputTokens === undefined && totalTokens === undefined ? undefined : defined({ inputTokens, outputTokens, totalTokens })
}
function malformed(options: VercelAIStreamOptions, message: string, input: string): void { const error = new SyntaxError(message); if (options.onMalformed?.(error, input) !== "skip") throw error }
function isSSEResponse(value: ByteStreamSource): boolean { return typeof Response !== "undefined" && value instanceof Response && (value.headers.get("content-type") ?? "").includes("text/event-stream") }
function isTransport(value: VercelAIStreamSource): value is ByteStreamSource { return (typeof Response !== "undefined" && value instanceof Response) || (typeof value === "object" && value !== null && "getReader" in value) }
async function* prepend(first: string | Uint8Array, iterator: AsyncIterator<unknown>): AsyncGenerator<string | Uint8Array> { yield first; for (;;) { const result = await iterator.next(); if (result.done) return; if (typeof result.value !== "string" && !(result.value instanceof Uint8Array)) throw new TypeError("Mixed Vercel AI stream chunk types"); yield result.value } }
function object(value: unknown): Record<string, unknown> | undefined { return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined }
function text(value: unknown): string | undefined { return typeof value === "string" ? value : undefined }
function numeric(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined }
function defined<T extends Record<string, unknown>>(value: T): T { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T }
