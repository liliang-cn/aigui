import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"
import { readableBytes } from "@ai-gui/core"
import { anthropicStream } from "./index"

describe("anthropicStream", () => {
  it("converts recorded Messages SSE, combines usage, and ignores tool use", async () => {
    const fixture = await readFile(fileURLToPath(new URL("../test/fixtures/messages.sse", import.meta.url)))
    await expect(collect(anthropicStream(readableBytes([fixture])))).resolves.toEqual([
      { type: "reasoning", delta: "considering" },
      { type: "content", delta: "Answer" },
      { type: "usage", data: { inputTokens: 8, outputTokens: 5, totalTokens: 13 } },
    ])
  })

  it("converts citation deltas and provider errors from SDK-shaped events", async () => {
    const source = values([
      { type: "content_block_delta", delta: { type: "citations_delta", citation: { type: "char_location", cited_text: "quote", document_title: "Doc" } } },
      { type: "error", error: { type: "overloaded_error", message: "busy" } },
    ])
    await expect(collect(anthropicStream(source))).resolves.toEqual([
      { type: "citation", data: { type: "char_location", citedText: "quote", title: "Doc" } },
      { type: "error", error: { type: "overloaded_error", message: "busy" } },
    ])
  })

  it("returns manual iterators on consumer break, errors, and [DONE] through prepend", async () => {
    const objects = manualIterator([{ type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } }, { type: "message_stop" }])
    for await (const event of anthropicStream(objects.source)) {
      expect(event).toEqual({ type: "content", delta: "Hi" })
      break
    }
    expect(objects.returned).toHaveBeenCalledOnce()

    const bytes = manualIterator(["data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Hi\"}}\n\ndata: [DONE]\n\n", "ignored"])
    await expect(collect(anthropicStream(bytes.source))).resolves.toEqual([{ type: "content", delta: "Hi" }])
    expect(bytes.returned).toHaveBeenCalledOnce()

    const returned = vi.fn().mockResolvedValue({ done: true, value: undefined })
    const failing = { [Symbol.asyncIterator]: () => ({ next: vi.fn().mockRejectedValue(new Error("failed")), return: returned }) }
    await expect(collect(anthropicStream(failing))).rejects.toThrow("failed")
    expect(returned).toHaveBeenCalledOnce()
  })

  it("aborts a pending manual iterator next and returns it", async () => {
    const returned = vi.fn().mockResolvedValue({ done: true, value: undefined })
    const source = { [Symbol.asyncIterator]: () => ({ next: vi.fn(() => new Promise<IteratorResult<unknown>>(() => {})), return: returned }) }
    const controller = new AbortController()
    const consuming = collect(anthropicStream(source, { signal: controller.signal }))
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
