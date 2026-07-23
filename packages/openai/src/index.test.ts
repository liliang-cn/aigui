import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
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
})

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> { const out = []; for await (const value of source) out.push(value); return out }
async function* values<T>(items: T[]) { yield* items }
