// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { useAIRenderer } from "./use-ai-renderer"

describe("useAIRenderer", () => {
  it("push updates nodes ref", () => {
    const { nodes, push } = useAIRenderer()
    push("# Hello")
    expect(nodes.value.some((n) => n.type === "heading")).toBe(true)
  })
  it("streaming accumulates", () => {
    const { nodes, push } = useAIRenderer()
    push("# Ti"); push("tle")
    expect(nodes.value.find((n) => n.type === "heading")?.html).toContain("Title")
  })
  it("reset clears nodes", () => {
    const { nodes, push, reset } = useAIRenderer()
    push("hi"); reset()
    expect(nodes.value).toEqual([])
  })
  it("decodes a fetch byte stream across UTF-8 chunk boundaries", async () => {
    const bytes = new TextEncoder().encode("你好")
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 2))
        controller.enqueue(bytes.slice(2))
        controller.close()
      },
    })
    const { nodes, feed } = useAIRenderer()
    await feed(source)
    expect(nodes.value[0]?.content).toBe("你好")
  })
  it("await feed observes the final scheduled ref update", async () => {
    const scheduled: Array<() => void> = []
    const { nodes, feed } = useAIRenderer({ scheduler: (render) => scheduled.push(render) })
    await feed((async function* () { yield "ready" })())
    expect(nodes.value[0]?.content).toBe("ready")
    expect(scheduled).toHaveLength(1)
  })
})
