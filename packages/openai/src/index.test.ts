import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"
import { readableBytes } from "@ai-gui/core"
import { openAIStream } from "./index"

describe("openAIStream", () => {
  it("converts recorded Responses API SSE and ignores tool calls", async () => {
    const fixture = await readFile(fileURLToPath(new URL("../test/fixtures/responses.sse", import.meta.url)))
    await expect(collect(openAIStream(readableBytes([fixture.slice(0, 23), fixture.slice(23)])))).resolves.toEqual([
      { type: "content", delta: "Hello " },
      { type: "reasoning", delta: "brief thought" },
      { type: "citation", data: { type: "url_citation", url: "https://example.com/source", title: "Source" } },
      { type: "usage", data: { inputTokens: 10, outputTokens: 4, totalTokens: 14 } },
    ])
  })

  it("accepts Chat Completions SDK-shaped async events", async () => {
    const source = values([
      { choices: [{ delta: { content: "Hi", reasoning_content: "why", tool_calls: [{ id: "call" }] } }] },
      { choices: [], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } },
      { error: { message: "rate limited", type: "server_error" } },
    ])
    await expect(collect(openAIStream(source))).resolves.toEqual([
      { type: "reasoning", delta: "why" },
      { type: "content", delta: "Hi" },
      { type: "usage", data: { inputTokens: 2, outputTokens: 3, totalTokens: 5 } },
      { type: "error", error: { message: "rate limited", type: "server_error" } },
    ])
  })

  it("returns manual iterators on consumer break and [DONE] through prepend", async () => {
    const objects = manualIterator([{ choices: [{ delta: { content: "Hi" } }] }, { choices: [] }])
    for await (const event of openAIStream(objects.source)) {
      expect(event).toEqual({ type: "content", delta: "Hi" })
      break
    }
    expect(objects.returned).toHaveBeenCalledOnce()

    const bytes = manualIterator(["data: {\"type\":\"response.output_text.delta\",\"delta\":\"Hi\"}\n\ndata: [DONE]\n\n", "ignored"])
    await expect(collect(openAIStream(bytes.source))).resolves.toEqual([{ type: "content", delta: "Hi" }])
    expect(bytes.returned).toHaveBeenCalledOnce()
  })

  it("returns manual iterators on iterator errors", async () => {
    const returned = vi.fn().mockResolvedValue({ done: true, value: undefined })
    const source = {
      [Symbol.asyncIterator]() {
        return { next: vi.fn().mockRejectedValue(new Error("failed")), return: returned }
      },
    }
    await expect(collect(openAIStream(source))).rejects.toThrow("failed")
    expect(returned).toHaveBeenCalledOnce()
  })

  it("aborts a pending manual iterator next and returns it", async () => {
    const returned = vi.fn().mockResolvedValue({ done: true, value: undefined })
    const source = { [Symbol.asyncIterator]: () => ({ next: vi.fn(() => new Promise<IteratorResult<unknown>>(() => {})), return: returned }) }
    const controller = new AbortController()
    const consuming = collect(openAIStream(source, { signal: controller.signal }))
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
