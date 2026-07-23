import { describe, expect, it, vi } from "vitest"
import { StreamRouter } from "./stream-router"

async function* gen(...chunks: Array<string | Uint8Array>) { for (const c of chunks) yield c }

describe("StreamRouter", () => {
  it("routes JSON-envelope delta to a bound channel sink", async () => {
    const pushed: string[] = []
    const router = new StreamRouter().channel("content", { push: (s) => pushed.push(s) })
    await router.feed(gen('data: {"ch":"content","delta":"he"}\n', 'data: {"ch":"content","delta":"llo"}\n'))
    expect(pushed.join("")).toBe("hello")
  })

  it("routes JSON-envelope data to an on() handler", async () => {
    const handler = vi.fn()
    const router = new StreamRouter().on("progress", handler)
    await router.feed(gen('data: {"ch":"progress","data":42}\n'))
    expect(handler).toHaveBeenCalledWith(42)
  })

  it("routes bare line-delimited JSON (no data: prefix)", async () => {
    const handler = vi.fn()
    const router = new StreamRouter().on("progress", handler)
    await router.feed(gen('{"ch":"progress","data":7}\n'))
    expect(handler).toHaveBeenCalledWith(7)
  })

  it("routes SSE event: named events, parsing JSON payloads", async () => {
    const handler = vi.fn()
    const router = new StreamRouter().on("progress", handler)
    await router.feed(gen("event: progress\ndata: 42\n\n"))
    expect(handler).toHaveBeenCalledWith(42)
  })

  it("routes SSE event: with non-JSON payload as raw string", async () => {
    const handler = vi.fn()
    const router = new StreamRouter().on("status", handler)
    await router.feed(gen("event: status\ndata: working\n\n"))
    expect(handler).toHaveBeenCalledWith("working")
  })

  it("sends a plain data: line (no ch, no event) to default content channel", async () => {
    const pushed: string[] = []
    const router = new StreamRouter().channel("content", { push: (s) => pushed.push(s) })
    await router.feed(gen("data: hello world\n"))
    expect(pushed.join("")).toBe("hello world")
  })
  it("keeps JSON-shaped default content as text deltas", async () => {
    const pushed: string[] = []
    const router = new StreamRouter().channel("content", { push: (s) => pushed.push(s) })
    await router.feed(gen("data: 42\n\ndata: true\n\ndata: {\"answer\":1}\n\n"))
    expect(pushed).toEqual(["42", "true", '{"answer":1}'])
  })

  it("handles a line split across chunks", async () => {
    const handler = vi.fn()
    const router = new StreamRouter().on("progress", handler)
    await router.feed(gen('data: {"ch":"pro', 'gress","data":9}\n'))
    expect(handler).toHaveBeenCalledWith(9)
  })

  it("routes multiple channels from one stream independently", async () => {
    const content: string[] = []
    const progress = vi.fn()
    const router = new StreamRouter()
      .channel("content", { push: (s) => content.push(s) })
      .on("progress", progress)
    await router.feed(gen(
      'data: {"ch":"content","delta":"loading "}\n',
      'data: {"ch":"progress","data":50}\n',
      'data: {"ch":"content","delta":"done"}\n',
    ))
    expect(content.join("")).toBe("loading done")
    expect(progress).toHaveBeenCalledWith(50)
  })

  it("feed consumes a ReadableStream of Uint8Array (SSE bytes)", async () => {
    const pushed: string[] = []
    const enc = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(enc.encode('data: {"ch":"content","delta":"hi"}\n')); c.close() },
    })
    const router = new StreamRouter().channel("content", { push: (s) => pushed.push(s) })
    await router.feed(stream)
    expect(pushed.join("")).toBe("hi")
  })
  it("decodes UTF-8 split across async-iterable byte chunks", async () => {
    const pushed: string[] = []
    const bytes = new TextEncoder().encode("data: 你好\n\n")
    const router = new StreamRouter().channel("content", { push: (s) => pushed.push(s) })
    await router.feed(gen(bytes.slice(0, 8), bytes.slice(8, 10), bytes.slice(10)))
    expect(pushed).toEqual(["你好"])
  })
  it("implements standard SSE multi-data events and ignores comments/id/retry fields", async () => {
    const handler = vi.fn()
    const router = new StreamRouter().on("message", handler)
    await router.feed(gen(
      ": keep-alive\n",
      "id: 42\n",
      "retry: 1500\n",
      "event: message\n",
      "data: first\n",
      "data: second\n\n",
    ))
    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith("first\nsecond")
    expect(router.lastEventId).toBe("42")
    expect(router.retry).toBe(1500)
  })
  it("dispatches the final SSE event even without a trailing blank line", async () => {
    const handler = vi.fn()
    await new StreamRouter().on("status", handler).feed(gen("event: status\ndata: done"))
    expect(handler).toHaveBeenCalledWith("done")
  })
})
