import { describe, expect, it, vi } from "vitest"
import {
  contentDeltas,
  jsonLines,
  mockModelStream,
  parseSSE,
  readableBytes,
} from "./model-stream"

describe("model stream helpers", () => {
  it("parses SSE across UTF-8 and line boundaries and stops at [DONE]", async () => {
    const bytes = new TextEncoder().encode(
      ": keepalive\r\nevent: response.output_text.delta\r\ndata: {\"delta\":\"你\"}\r\n\r\n"
      + "data: {\"delta\":\"好\"}\n\ndata: [DONE]\n\ndata: {\"delta\":\"ignored\"}\n\n",
    )
    const stream = readableBytes([
      bytes.slice(0, 67),
      bytes.slice(67, 68),
      bytes.slice(68, 75),
      bytes.slice(75),
    ])

    await expect(collect(parseSSE(stream))).resolves.toEqual([
      { event: "response.output_text.delta", data: "{\"delta\":\"你\"}" },
      { data: "{\"delta\":\"好\"}" },
    ])
  })

  it("supports multiline SSE data and configurable malformed-event handling", async () => {
    const source = readableBytes(["data: first\ndata: second\n\ndata broken\n\n"])
    await expect(collect(parseSSE(source))).resolves.toEqual([{ data: "first\nsecond" }])

    const malformed = readableBytes(["data: {bad}\n\n"])
    await expect(collect(parseSSE(malformed, { parseJSON: true }))).rejects.toThrow("Invalid SSE JSON")

    const errors: unknown[] = []
    const skipped = parseSSE(readableBytes(["data: {bad}\n\ndata: {\"ok\":true}\n\n"]), {
      parseJSON: true,
      onMalformed(error) { errors.push(error); return "skip" },
    })
    await expect(collect(skipped)).resolves.toEqual([{ data: { ok: true } }])
    expect(errors).toHaveLength(1)
  })

  it("parses CR, LF, and CRLF SSE separators and preserves retry at EOF", async () => {
    const source = readableBytes([
      "event: one\rdata: a\r\rdata: b\n\nid: 3\r\nretry: 250\r\ndata: c",
    ])
    await expect(collect(parseSSE(source))).resolves.toEqual([
      { event: "one", data: "a" },
      { data: "b" },
      { id: "3", retry: 250, data: "c" },
    ])
  })

  it("parses JSONL and NDJSON with CRLF, blank lines, final lines, and malformed records", async () => {
    const bytes = new TextEncoder().encode("{\"text\":\"€\"}\r\n\r\n{bad}\n{\"done\":true}")
    const errors: unknown[] = []
    const events = jsonLines(readableBytes([bytes.slice(0, 10), bytes.slice(10, 11), bytes.slice(11)]), {
      onMalformed(error) { errors.push(error); return "skip" },
    })
    await expect(collect(events)).resolves.toEqual([{ text: "€" }, { done: true }])
    expect(errors).toHaveLength(1)
  })

  it("cancels and releases a ReadableStream reader when iteration stops", async () => {
    let finishCancel!: () => void
    const cancel = vi.fn(() => new Promise<void>((resolve) => { finishCancel = resolve }))
    const releaseLock = vi.fn()
    const reader = {
      read: vi.fn().mockResolvedValue({ done: false, value: new TextEncoder().encode("data: x\n\n") }),
      cancel,
      releaseLock,
    }
    const events = parseSSE({ getReader: () => reader } as unknown as ReadableStream<Uint8Array>)
    const consuming = (async () => { for await (const event of events) {
      expect(event).toEqual({ data: "x" })
      break
    } })()
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce())
    expect(releaseLock).not.toHaveBeenCalled()
    finishCancel()
    await consuming
    expect(cancel).toHaveBeenCalledOnce()
    expect(releaseLock).toHaveBeenCalledOnce()
  })

  it("cancels with AbortSignal and cleans up the reader", async () => {
    let resolveRead!: (value: ReadableStreamReadResult<Uint8Array>) => void
    const cancel = vi.fn().mockResolvedValue(undefined)
    const releaseLock = vi.fn()
    const reader = {
      read: vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) => { resolveRead = resolve })),
      cancel,
      releaseLock,
    }
    const controller = new AbortController()
    const consuming = collect(parseSSE(
      { getReader: () => reader } as unknown as ReadableStream<Uint8Array>,
      { signal: controller.signal },
    ))
    await Promise.resolve()
    controller.abort()
    resolveRead({ done: true, value: undefined })
    await expect(consuming).rejects.toMatchObject({ name: "AbortError" })
    expect(cancel).toHaveBeenCalledOnce()
    expect(releaseLock).toHaveBeenCalledOnce()
  })

  it("does not let cancel rejection mask the stream's primary error", async () => {
    const primary = new Error("read failed")
    const reader = {
      read: vi.fn().mockRejectedValue(primary),
      cancel: vi.fn().mockRejectedValue(new Error("cancel failed")),
      releaseLock: vi.fn(),
    }
    await expect(collect(parseSSE(
      { getReader: () => reader } as unknown as ReadableStream<Uint8Array>,
    ))).rejects.toBe(primary)
    expect(reader.cancel).toHaveBeenCalledOnce()
    expect(reader.releaseLock).toHaveBeenCalledOnce()
  })

  it("interrupts a pending AsyncIterator next on abort, returns it, and handles its late rejection", async () => {
    let rejectNext!: (error: unknown) => void
    const lateError = new Error("late next failure")
    const iterator = {
      next: vi.fn(() => new Promise<IteratorResult<Uint8Array>>((_resolve, reject) => { rejectNext = reject })),
      return: vi.fn().mockResolvedValue({ done: true, value: undefined }),
    }
    const source = { [Symbol.asyncIterator]: () => iterator }
    const controller = new AbortController()
    const unhandled: unknown[] = []
    const onUnhandled = (error: unknown) => unhandled.push(error)
    process.on("unhandledRejection", onUnhandled)
    try {
      const consuming = collect(parseSSE(source, { signal: controller.signal }))
      await Promise.resolve()
      controller.abort()
      await expect(consuming).rejects.toMatchObject({ name: "AbortError" })
      expect(iterator.return).toHaveBeenCalledOnce()
      rejectNext(lateError)
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(unhandled).toEqual([])
    } finally {
      process.off("unhandledRejection", onUnhandled)
    }
  })

  it("checks abort again after AsyncIterator next resolves", async () => {
    const controller = new AbortController()
    const iterator = {
      next: vi.fn(async () => {
        controller.abort()
        return { done: false, value: new TextEncoder().encode("data: ignored\n\n") }
      }),
      return: vi.fn().mockResolvedValue({ done: true, value: undefined }),
    }
    await expect(collect(parseSSE(
      { [Symbol.asyncIterator]: () => iterator },
      { signal: controller.signal },
    ))).rejects.toMatchObject({ name: "AbortError" })
    expect(iterator.return).toHaveBeenCalledOnce()
  })

  it("provides mock events and content-only chunks that can feed a Renderer", async () => {
    const events = mockModelStream([
      { type: "reasoning", delta: "thinking" },
      { type: "content", delta: "Hello " },
      { type: "citation", data: { url: "https://example.com" } },
      { type: "content", delta: "world" },
    ])
    await expect(collect(contentDeltas(events))).resolves.toEqual(["Hello ", "world"])
  })

  it("rejects pre-aborted mock delays immediately and removes delay listeners on completion", async () => {
    const preaborted = new AbortController()
    preaborted.abort(new Error("stopped"))
    await expect(collect(mockModelStream(
      [{ type: "content", delta: "ignored" }],
      { delayMs: 10_000, signal: preaborted.signal },
    ))).rejects.toThrow("stopped")

    vi.useFakeTimers()
    try {
      const controller = new AbortController()
      const add = vi.spyOn(controller.signal, "addEventListener")
      const remove = vi.spyOn(controller.signal, "removeEventListener")
      const consuming = collect(mockModelStream(
        [{ type: "content", delta: "ok" }],
        { delayMs: 10, signal: controller.signal },
      ))
      await vi.advanceTimersByTimeAsync(10)
      await expect(consuming).resolves.toEqual([{ type: "content", delta: "ok" }])
      expect(add).toHaveBeenCalledWith("abort", expect.any(Function), { once: true })
      expect(remove).toHaveBeenCalledWith("abort", expect.any(Function))
    } finally {
      vi.useRealTimers()
    }
  })
})

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = []
  for await (const value of source) values.push(value)
  return values
}
