import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"
import { readableBytes } from "@ai-gui/core"
import { vercelAIStream } from "./index"

describe("vercelAIStream", () => {
  it("converts recorded AI SDK data stream protocol and ignores tool calls", async () => {
    const fixture = await readFile(fileURLToPath(new URL("../test/fixtures/data-stream.txt", import.meta.url)))
    await expect(collect(vercelAIStream(readableBytes([fixture.slice(0, 17), fixture.slice(17)])))).resolves.toEqual([
      { type: "reasoning", delta: "thinking" },
      { type: "content", delta: "Hello" },
      { type: "citation", data: { type: "url", id: "src_1", url: "https://example.com/vercel", title: "Vercel source" } },
      { type: "usage", data: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } },
    ])
  })

  it("accepts AI SDK full-stream object parts", async () => {
    const source = values([
      { type: "text-delta", textDelta: "Hi" },
      { type: "reasoning-delta", textDelta: "why" },
      { type: "source", source: { sourceType: "url", id: "s", url: "https://example.com" } },
      { type: "tool-call", toolCallId: "call", toolName: "noop", input: {} },
      { type: "finish", totalUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } },
      { type: "error", error: "failed" },
    ])
    await expect(collect(vercelAIStream(source))).resolves.toEqual([
      { type: "content", delta: "Hi" },
      { type: "reasoning", delta: "why" },
      { type: "citation", data: { sourceType: "url", id: "s", url: "https://example.com" } },
      { type: "usage", data: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } },
      { type: "error", error: "failed" },
    ])
  })

  it("supports standard SSE errorText and sourceId fields plus legacy error", async () => {
    const source = values([
      { type: "source-url", sourceId: "src", url: "https://example.com" },
      { type: "error", errorText: "standard failure" },
      { type: "error", error: "legacy failure" },
    ])
    await expect(collect(vercelAIStream(source))).resolves.toEqual([
      { type: "citation", data: { type: "source-url", id: "src", url: "https://example.com" } },
      { type: "error", error: "standard failure" },
      { type: "error", error: "legacy failure" },
    ])
  })

  it("returns manual iterators on consumer break, errors, and [DONE] through prepend", async () => {
    const objects = manualIterator([{ type: "text-delta", delta: "Hi" }, { type: "finish" }])
    for await (const event of vercelAIStream(objects.source)) {
      expect(event).toEqual({ type: "content", delta: "Hi" })
      break
    }
    expect(objects.returned).toHaveBeenCalledOnce()

    const bytes = manualIterator(["data: {\"type\":\"text-delta\",\"delta\":\"Hi\"}\n\ndata: [DONE]\n\n", "ignored"])
    await expect(collect(vercelAIStream(bytes.source, { protocol: "sse" }))).resolves.toEqual([{ type: "content", delta: "Hi" }])
    expect(bytes.returned).toHaveBeenCalledOnce()

    const returned = vi.fn().mockResolvedValue({ done: true, value: undefined })
    const failing = { [Symbol.asyncIterator]: () => ({ next: vi.fn().mockRejectedValue(new Error("failed")), return: returned }) }
    await expect(collect(vercelAIStream(failing))).rejects.toThrow("failed")
    expect(returned).toHaveBeenCalledOnce()
  })

  it("aborts a pending manual iterator next and returns it", async () => {
    const returned = vi.fn().mockResolvedValue({ done: true, value: undefined })
    const source = { [Symbol.asyncIterator]: () => ({ next: vi.fn(() => new Promise<IteratorResult<unknown>>(() => {})), return: returned }) }
    const controller = new AbortController()
    const consuming = collect(vercelAIStream(source, { signal: controller.signal }))
    await Promise.resolve()
    controller.abort()
    await expect(consuming).rejects.toMatchObject({ name: "AbortError" })
    expect(returned).toHaveBeenCalledOnce()
  })
})

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> { const out = []; for await (const value of source) out.push(value); return out }
async function* values<T>(items: T[]) { yield* items }
function manualIterator<T>(items: T[]) {
  let index = 0
  const returned = vi.fn().mockResolvedValue({ done: true, value: undefined })
  return {
    returned,
    source: { [Symbol.asyncIterator]: () => ({ next: async () => index < items.length ? { done: false as const, value: items[index++]! } : { done: true as const, value: undefined }, return: returned }) },
  }
}
