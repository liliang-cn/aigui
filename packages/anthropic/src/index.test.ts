import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { readableBytes } from "@ai-gui/core"
import { anthropicStream } from "./index"

describe("anthropicStream", () => {
  it("converts recorded Messages SSE, combines usage, and ignores tool use", async () => {
    const fixture = await readFile(fileURLToPath(new URL("../test/fixtures/messages.sse", import.meta.url)))
    await expect(collect(anthropicStream(readableBytes([fixture])))).resolves.toEqual([
      { type: "reasoning", delta: "considering" },
      { type: "content", delta: "Answer" },
      { type: "citation", data: { type: "web_search_result", url: "https://example.com/a", title: "A" } },
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
})

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> { const out = []; for await (const value of source) out.push(value); return out }
async function* values<T>(items: T[]) { yield* items }
