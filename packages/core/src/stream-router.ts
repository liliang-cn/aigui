/**
 * A consumer of a channel's text stream. `Renderer` satisfies this shape.
 */
export interface ChannelSink { push(chunk: string): void }

/** Handler for structured data values (and text deltas as raw strings). */
type ChannelHandler = (value: unknown) => void

const DEFAULT_CHANNEL = "content"

/**
 * Demultiplexes one incoming stream into multiple named channels so different
 * UI regions can update independently (e.g. `progress` + `content` from a single
 * SSE). Framing is auto-detected per line and supports:
 *
 *  1. JSON envelope: `{"ch":"<channel>","delta":"text"}` (a text delta) or
 *     `{"ch":"<channel>","data":<any>}` (a structured value). May appear bare or
 *     after a `data: ` prefix.
 *  2. SSE `event: <name>` sets the channel for the following `data:` line(s).
 *  3. A plain `data: <text>` line with no `ch` and no preceding `event:` is a
 *     text delta on the default `content` channel.
 */
export class StreamRouter {
  private readonly sinks = new Map<string, ChannelSink>()
  private readonly handlers = new Map<string, ChannelHandler>()

  /** Bind a text-stream sink to a channel: text deltas call `sink.push(delta)`. */
  channel(name: string, sink: ChannelSink): this {
    this.sinks.set(name, sink)
    return this
  }

  /** Bind a handler to a channel: data values (and deltas as strings) call it. */
  on(name: string, handler: ChannelHandler): this {
    this.handlers.set(name, handler)
    return this
  }

  /**
   * Consume a stream to completion, dispatching each parsed line to its channel.
   * Accepts an async iterable of strings, or a `ReadableStream` of either strings
   * or `Uint8Array` bytes (decoded as UTF-8).
   */
  async feed(source: AsyncIterable<string> | ReadableStream<Uint8Array | string>): Promise<void> {
    let buffer = ""
    let currentEvent: string | undefined

    const consume = (chunk: string) => {
      buffer += chunk
      let index: number
      while ((index = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 1)
        currentEvent = this.processLine(line, currentEvent)
      }
    }

    // Prefer the reader path: a `ReadableStream` may also be async-iterable in
    // some runtimes, but only the reader lets us decode bytes correctly.
    if ("getReader" in source && typeof source.getReader === "function") {
      const reader = source.getReader()
      const decoder = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (value == null) continue
        consume(
          typeof value === "string" ? value : decoder.decode(value, { stream: true }),
        )
      }
      // Flush any bytes held by the streaming decoder.
      const tail = decoder.decode()
      if (tail) consume(tail)
    } else {
      for await (const chunk of source as AsyncIterable<string>) consume(chunk)
    }

    // Process any trailing partial line left without a terminating newline.
    if (buffer.length > 0) this.processLine(buffer, currentEvent)
  }

  /** Process a single raw line; returns the (possibly updated) current event. */
  private processLine(rawLine: string, currentEvent: string | undefined): string | undefined {
    // Strip an optional trailing CR (CRLF line endings).
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine

    // A blank line resets the current SSE event name (SSE semantics).
    if (line.trim() === "") return undefined

    // `event: <name>` sets the channel for the following data line(s).
    if (line.startsWith("event:")) return line.slice("event:".length).trim()

    // Strip an optional `data:` / `data: ` prefix to get the payload.
    let payload = line
    if (payload.startsWith("data:")) {
      payload = payload.slice("data:".length)
      if (payload.startsWith(" ")) payload = payload.slice(1)
    }

    // JSON envelope: an object possibly carrying a `ch` field.
    if (payload.startsWith("{")) {
      const parsed = tryParseJson(payload)
      if (parsed !== undefined && isRecord(parsed) && typeof parsed.ch === "string") {
        if ("delta" in parsed) {
          this.routeDelta(parsed.ch, String(parsed.delta))
        } else {
          this.routeData(parsed.ch, parsed.data)
        }
        return currentEvent
      }
      // A JSON object without a `ch` field: route as data to the current
      // event channel, or default content.
      if (parsed !== undefined) {
        this.routeData(currentEvent ?? DEFAULT_CHANNEL, parsed)
        return currentEvent
      }
      // Not valid JSON despite the leading brace: fall through to text/raw.
    }

    // An SSE event name is set: route the payload as a data value, parsing JSON
    // when possible and otherwise passing the raw string.
    if (currentEvent !== undefined) {
      const parsed = tryParseJson(payload)
      this.routeData(currentEvent, parsed !== undefined ? parsed : payload)
      return currentEvent
    }

    // Default: a plain text delta on the content channel.
    this.routeDelta(DEFAULT_CHANNEL, payload)
    return currentEvent
  }

  /** Route a text delta: to a bound sink and/or an on() handler (either/both). */
  private routeDelta(channel: string, text: string): void {
    const sink = this.sinks.get(channel)
    const handler = this.handlers.get(channel)
    if (sink) sink.push(text)
    if (handler) handler(text)
  }

  /** Route a structured value: to the handler, or a string value to a lone sink. */
  private routeData(channel: string, value: unknown): void {
    const handler = this.handlers.get(channel)
    if (handler) {
      handler(value)
      return
    }
    const sink = this.sinks.get(channel)
    if (sink && typeof value === "string") sink.push(value)
  }
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
