import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
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
})

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> { const out = []; for await (const value of source) out.push(value); return out }
async function* values<T>(items: T[]) { yield* items }
