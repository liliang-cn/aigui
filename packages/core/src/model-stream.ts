export interface Citation {
  type?: string
  id?: string
  url?: string
  title?: string
  citedText?: string
  [key: string]: unknown
}

export interface Usage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  [key: string]: unknown
}

export type ModelStreamEvent =
  | { type: "content"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "citation"; data: Citation }
  | { type: "usage"; data: Usage }
  | { type: "error"; error: unknown }

export type ByteStreamSource =
  | Response
  | ReadableStream<Uint8Array>
  | AsyncIterable<Uint8Array | string>

export interface StreamParseOptions {
  signal?: AbortSignal
  onMalformed?: (error: Error, input: string) => "skip" | void
}

export interface SSEOptions extends StreamParseOptions {
  parseJSON?: boolean
  doneData?: string | false
}

export interface SSEEvent<T = string> {
  data: T
  event?: string
  id?: string
  retry?: number
}

export function parseSSE(
  source: ByteStreamSource,
  options: SSEOptions & { parseJSON: true },
): AsyncGenerator<SSEEvent<unknown>>
export function parseSSE(
  source: ByteStreamSource,
  options?: SSEOptions,
): AsyncGenerator<SSEEvent<string>>
export async function* parseSSE(
  source: ByteStreamSource,
  options: SSEOptions = {},
): AsyncGenerator<SSEEvent<unknown>> {
  let buffer = ""
  let eventName: string | undefined
  let id: string | undefined
  let retry: number | undefined
  let data: string[] = []
  const doneData = options.doneData === undefined ? "[DONE]" : options.doneData

  const dispatch = (): SSEEvent<unknown> | "done" | undefined => {
    if (data.length === 0) {
      eventName = undefined
      retry = undefined
      return undefined
    }
    const raw = data.join("\n")
    data = []
    const result: SSEEvent<unknown> = { data: raw }
    if (eventName !== undefined) result.event = eventName
    if (id !== undefined) result.id = id
    if (retry !== undefined) result.retry = retry
    eventName = undefined
    retry = undefined
    if (doneData !== false && raw === doneData) return "done"
    if (options.parseJSON) {
      try {
        result.data = JSON.parse(raw)
      } catch (cause) {
        const error = malformedError("Invalid SSE JSON", raw, cause)
        if (options.onMalformed?.(error, raw) === "skip") return undefined
        throw error
      }
    }
    return result
  }

  const processLine = (line: string): SSEEvent<unknown> | "done" | undefined => {
    if (line === "") return dispatch()
    if (line.startsWith(":")) return undefined
    const colon = line.indexOf(":")
    const field = colon < 0 ? line : line.slice(0, colon)
    let value = colon < 0 ? "" : line.slice(colon + 1)
    if (value.startsWith(" ")) value = value.slice(1)
    if (field === "data") data.push(value)
    else if (field === "event") eventName = value
    else if (field === "id" && !value.includes("\0")) id = value
    else if (field === "retry" && /^\d+$/.test(value)) retry = Number(value)
    return undefined
  }

  const drainLines = function* (eof = false): Generator<SSEEvent<unknown> | "done"> {
    for (;;) {
      const cr = buffer.indexOf("\r")
      const lf = buffer.indexOf("\n")
      let newline = cr < 0 ? lf : lf < 0 ? cr : Math.min(cr, lf)
      if (newline < 0) break
      if (!eof && buffer[newline] === "\r" && newline === buffer.length - 1) break
      const width = buffer[newline] === "\r" && buffer[newline + 1] === "\n" ? 2 : 1
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + width)
      const event = processLine(line)
      if (event) yield event
    }
  }

  for await (const chunk of decodedChunks(source, options.signal)) {
    buffer += chunk
    for (const event of drainLines()) {
      if (event === "done") return
      yield event
    }
  }

  for (const event of drainLines(true)) {
    if (event === "done") return
    yield event
  }
  if (buffer) processLine(buffer)
  const event = dispatch()
  if (event && event !== "done") yield event
}

export async function* jsonLines<T = unknown>(
  source: ByteStreamSource,
  options: StreamParseOptions = {},
): AsyncGenerator<T> {
  let buffer = ""
  for await (const chunk of decodedChunks(source, options.signal)) {
    buffer += chunk
    for (;;) {
      const newline = buffer.indexOf("\n")
      if (newline < 0) break
      const line = buffer.slice(0, newline).replace(/\r$/, "")
      buffer = buffer.slice(newline + 1)
      const value = parseJSONLine<T>(line, options)
      if (value !== SKIP) yield value
    }
  }
  const value = parseJSONLine<T>(buffer.replace(/\r$/, ""), options)
  if (value !== SKIP) yield value
}

export const ndjson = jsonLines

export async function* textLines(
  source: ByteStreamSource,
  options: Pick<StreamParseOptions, "signal"> = {},
): AsyncGenerator<string> {
  let buffer = ""
  for await (const chunk of decodedChunks(source, options.signal)) {
    buffer += chunk
    for (;;) {
      const newline = buffer.indexOf("\n")
      if (newline < 0) break
      yield buffer.slice(0, newline).replace(/\r$/, "")
      buffer = buffer.slice(newline + 1)
    }
  }
  if (buffer) yield buffer.replace(/\r$/, "")
}

export async function* contentDeltas(events: AsyncIterable<ModelStreamEvent>): AsyncGenerator<string> {
  for await (const event of events) {
    if (event.type === "content") yield event.delta
  }
}

export async function* mockModelStream(
  events: Iterable<ModelStreamEvent> | AsyncIterable<ModelStreamEvent>,
  options: { delayMs?: number; signal?: AbortSignal } = {},
): AsyncGenerator<ModelStreamEvent> {
  for await (const event of events) {
    throwIfAborted(options.signal)
    if (options.delayMs && options.delayMs > 0) await delay(options.delayMs, options.signal)
    yield event
  }
}

export function readableBytes(
  chunks: Iterable<string | Uint8Array> | AsyncIterable<string | Uint8Array>,
): ReadableStream<Uint8Array> {
  const iterator = toAsyncIterator(chunks)
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await iterator.next()
        if (result.done) controller.close()
        else controller.enqueue(typeof result.value === "string" ? encoder.encode(result.value) : result.value)
      } catch (error) {
        controller.error(error)
      }
    },
    async cancel(reason) {
      await iterator.return?.(reason)
    },
  })
}

async function* decodedChunks(source: ByteStreamSource, signal?: AbortSignal): AsyncGenerator<string> {
  throwIfAborted(signal)
  const decoder = new TextDecoder()
  const body = isResponse(source) ? source.body : source
  if (!body) throw new TypeError("Response body is null")
  if (isReadableStream(body)) {
    const reader = body.getReader()
    let done = false
    let primaryError: unknown
    let cancelPromise: Promise<void> | undefined
    const cancel = (reason: unknown): Promise<void> => {
      if (done) return Promise.resolve()
      cancelPromise ??= Promise.resolve().then(() => reader.cancel(reason))
      return cancelPromise
    }
    const abort = () => { void cancel(abortReason(signal)).catch(() => {}) }
    signal?.addEventListener("abort", abort, { once: true })
    try {
      for (;;) {
        throwIfAborted(signal)
        const result = await reader.read()
        throwIfAborted(signal)
        if (result.done) { done = true; break }
        const text = decoder.decode(result.value, { stream: true })
        if (text) yield text
      }
      throwIfAborted(signal)
      const tail = decoder.decode()
      if (tail) yield tail
    } catch (error) {
      primaryError = error
      throw error
    } finally {
      signal?.removeEventListener("abort", abort)
      try {
        if (!done) await cancel(abortReason(signal, "Stream iteration stopped"))
      } catch (error) {
        if (primaryError === undefined) throw error
      } finally {
        reader.releaseLock()
      }
    }
    return
  }

  const iterator = body[Symbol.asyncIterator]()
  let done = false
  let primaryError: unknown
  try {
    for (;;) {
      throwIfAborted(signal)
      const result = await nextWithAbort(iterator, signal)
      throwIfAborted(signal)
      if (result.done) { done = true; break }
      const text = typeof result.value === "string"
        ? decoder.decode() + result.value
        : decoder.decode(result.value, { stream: true })
      if (text) yield text
    }
    const tail = decoder.decode()
    if (tail) yield tail
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    if (!done) {
      try { await iterator.return?.() }
      catch (error) { if (primaryError === undefined) throw error }
    }
  }
}

async function nextWithAbort<T>(iterator: AsyncIterator<T>, signal?: AbortSignal): Promise<IteratorResult<T>> {
  if (!signal) return iterator.next()
  throwIfAborted(signal)
  const next = Promise.resolve(iterator.next())
  let abort!: () => void
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(abortReason(signal))
    signal.addEventListener("abort", abort, { once: true })
  })
  try {
    return await Promise.race([next, aborted])
  } finally {
    signal.removeEventListener("abort", abort)
  }
}

const SKIP = Symbol("skip")

function parseJSONLine<T>(line: string, options: StreamParseOptions): T | typeof SKIP {
  if (!line.trim()) return SKIP
  try {
    return JSON.parse(line) as T
  } catch (cause) {
    const error = malformedError("Invalid JSON line", line, cause)
    if (options.onMalformed?.(error, line) === "skip") return SKIP
    throw error
  }
}

function malformedError(message: string, input: string, cause: unknown): SyntaxError {
  const error = new SyntaxError(`${message}: ${input}`)
  error.cause = cause
  return error
}

function isResponse(value: ByteStreamSource): value is Response {
  return typeof Response !== "undefined" && value instanceof Response
}

function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return typeof value === "object" && value !== null && "getReader" in value
    && typeof (value as ReadableStream<Uint8Array>).getReader === "function"
}

function toAsyncIterator<T>(source: Iterable<T> | AsyncIterable<T>): AsyncIterator<T> {
  if (Symbol.asyncIterator in source) return source[Symbol.asyncIterator]()
  const iterator = source[Symbol.iterator]()
  return {
    next: async () => iterator.next(),
    return: iterator.return ? async (value?: unknown) => iterator.return!(value as never) : undefined,
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal)
}

function abortReason(signal?: AbortSignal, fallback = "The operation was aborted"): unknown {
  if (signal?.reason !== undefined) return signal.reason
  const error = new Error(fallback)
  error.name = "AbortError"
  return error
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortReason(signal)); return }
    const finish = () => {
      signal?.removeEventListener("abort", abort)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    const abort = () => {
      clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
      reject(abortReason(signal))
    }
    signal?.addEventListener("abort", abort, { once: true })
  })
}
