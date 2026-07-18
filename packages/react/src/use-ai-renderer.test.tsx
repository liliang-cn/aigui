// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useAIRenderer } from "./use-ai-renderer"

describe("useAIRenderer", () => {
  it("push updates nodes state", () => {
    const { result } = renderHook(() => useAIRenderer())
    act(() => result.current.push("# Hello"))
    expect(result.current.nodes.some((n) => n.type === "heading")).toBe(true)
  })
  it("streaming multiple pushes accumulates", () => {
    const { result } = renderHook(() => useAIRenderer())
    act(() => result.current.push("# Ti"))
    act(() => result.current.push("tle"))
    const h = result.current.nodes.find((n) => n.type === "heading")
    expect(h?.html).toContain("Title")
  })
  it("reset clears nodes", () => {
    const { result } = renderHook(() => useAIRenderer())
    act(() => result.current.push("hello"))
    act(() => result.current.reset())
    expect(result.current.nodes).toEqual([])
  })
})
