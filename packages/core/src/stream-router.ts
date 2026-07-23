/** A consumer of a channel's text stream. `Renderer` satisfies this shape. */
export interface ChannelSink { push(chunk: string): void }

/** Handler for structured data values (and text deltas as raw strings). */
type ChannelHandler = (value: unknown) => void
type StreamChunk = string | Uint8Array

const DEFAULT_CHANNEL = "content"

/** Demultiplex JSON-lines and standards-compliant SSE into named channels. */
export class StreamRouter {
  private readonly sinks = new Map<string, ChannelSink>()
  private readonly handlers = new Map<string, ChannelHandler>()

  /** Most recently received SSE `id` field. */
  lastEventId = ""
  /** Most recently received valid non-negative SSE reconnection delay. */
  retry: number | undefined

  channel(name: string, sink: ChannelSink): this {
    this.sinks.set(name, sink)
    return this
  }

  on(name: string, handler: ChannelHandler): this {
    this.handlers.set(name, handler)
    return this
  }

  async feed(source: AsyncIterable<StreamChunk> | ReadableStream<StreamChunk>): Promise<void> {
    let buffer = ""
    let eventName = ""
    let dataLines: string[] = []
    const decoder = new TextDecoder()

    const dispatchEvent = () => {
      if (dataLines.length === 0) {
        eventName = ""
        return
      }
      const payload = dataLines.join("\n")
      const channel = eventName || DEFAULT_CHANNEL
      dataLines = []
      eventName = ""
      this.dispatchPayload(channel, payload, channel === DEFAULT_CHANNEL)
    }

    const processLine = (rawLine: string) => {
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine
      if (line === "") {
        dispatchEvent()
        return
      }
      if (line.startsWith(":")) return
      const bareJson = tryParseJson(line)
      if (isEnvelope(bareJson)) {
        this.dispatchEnvelope(bareJson)
        return
      }

      const colon = line.indexOf(":")
      const field = colon === -1 ? line : line.slice(0, colon)
      let value = colon === -1 ? "" : line.slice(colon + 1)
      if (value.startsWith(" ")) value = value.slice(1)

      if (field === "event") {
        eventName = value
      } else if (field === "data") {
        const envelope = tryParseJson(value)
        if (!eventName && isEnvelope(envelope)) this.dispatchEnvelope(envelope)
        else dataLines.push(value)
      } else if (field === "id") {
        if (!value.includes("\0")) this.lastEventId = value
      } else if (field === "retry") {
        if (/^\d+$/.test(value)) this.retry = Number(value)
      } else if (colon === -1) {
        dataLines.push(line)
      }
    }

    const consume = (chunk: StreamChunk) => {
      const text = typeof chunk === "string"
        ? decoder.decode() + chunk
        : decoder.decode(chunk, { stream: true })
      buffer += text
      let newline: number
      while ((newline = buffer.indexOf("\n")) !== -1) {
        processLine(buffer.slice(0, newline))
        buffer = buffer.slice(newline + 1)
      }
    }

    if (isReadableStream(source)) {
      const reader = source.getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (value != null) consume(value)
        }
      } finally {
        reader.releaseLock()
      }
    } else {
      for await (const chunk of source) consume(chunk)
    }
    const tail = decoder.decode()
    if (tail) consume(tail)
    if (buffer.length > 0) processLine(buffer)
    dispatchEvent()
  }

  private dispatchPayload(channel: string, payload: string, defaultIsDelta: boolean): void {
    const parsed = tryParseJson(payload)
    if (isEnvelope(parsed)) {
      this.dispatchEnvelope(parsed)
    } else if (defaultIsDelta) {
      this.routeDelta(channel, payload)
    } else {
      this.routeData(channel, parsed !== undefined ? parsed : payload)
    }
  }

  private dispatchEnvelope(envelope: Record<string, unknown>): void {
    const channel = envelope.ch as string
    if ("delta" in envelope) this.routeDelta(channel, String(envelope.delta))
    else this.routeData(channel, envelope.data)
  }

  private routeDelta(channel: string, text: string): void {
    this.sinks.get(channel)?.push(text)
    this.handlers.get(channel)?.(text)
  }

  private routeData(channel: string, value: unknown): void {
    const handler = this.handlers.get(channel)
    if (handler) handler(value)
    else if (typeof value === "string") this.sinks.get(channel)?.push(value)
  }
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function isEnvelope(value: unknown): value is Record<string, unknown> & { ch: string } {
  return typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).ch === "string"
}

function isReadableStream(
  source: AsyncIterable<StreamChunk> | ReadableStream<StreamChunk>,
): source is ReadableStream<StreamChunk> {
  return "getReader" in source && typeof source.getReader === "function"
}
