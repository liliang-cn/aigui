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
})
