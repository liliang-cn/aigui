// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { StrictMode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { AIGuiPlugin } from "@ai-gui/core"
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
  it("keeps sibling order correct when a heading precedes existing content", () => {
    const { result } = renderHook(() => useAIRenderer())
    act(() => result.current.push("para one"))
    act(() => result.current.reset())
    act(() => result.current.push("# Title\n\npara one"))
    const types = result.current.nodes.map((n) => n.type)
    expect(types[0]).toBe("heading")
    expect(types).toContain("paragraph")
  })
  it("reset mid-stream then continue pushing produces fresh nodes", () => {
    const { result } = renderHook(() => useAIRenderer())
    act(() => result.current.push("# First"))
    act(() => result.current.reset())
    act(() => result.current.push("# Second"))
    const headings = result.current.nodes.filter((n) => n.type === "heading")
    expect(headings).toHaveLength(1)
    expect(headings[0].html).toContain("Second")
  })
  it("keeps accepting pushes after StrictMode remounts the effects", () => {
    const { result } = renderHook(() => useAIRenderer(), { wrapper: StrictMode })
    act(() => result.current.push("# Hello"))
    expect(result.current.nodes.some((n) => n.type === "heading")).toBe(true)
  })
  it("clears old content when renderer configuration changes", () => {
    const first: AIGuiPlugin[] = []
    const second: AIGuiPlugin[] = []
    const { result, rerender } = renderHook(({ plugins }) => useAIRenderer({ plugins }), { initialProps: { plugins: first } })
    act(() => result.current.push("old"))
    rerender({ plugins: second })
    expect(result.current.nodes).toEqual([])
  })
  it("ignores an old feed after configuration changes", async () => {
    let release!: () => void
    const source = (async function* () {
      yield "old"
      await new Promise<void>((resolve) => { release = resolve })
      yield " late"
    })()
    const first: AIGuiPlugin[] = []
    const second: AIGuiPlugin[] = []
    const { result, rerender } = renderHook(({ plugins }) => useAIRenderer({ plugins }), { initialProps: { plugins: first } })
    let feeding!: Promise<void>
    await act(async () => { feeding = result.current.feed(source); await Promise.resolve() })
    rerender({ plugins: second })
    act(() => result.current.push("new"))
    await act(async () => { release(); await feeding })
    expect(result.current.nodes.map((node) => node.content ?? node.html).join(" ")).toContain("new")
    expect(result.current.nodes.map((node) => node.content ?? node.html).join(" ")).not.toContain("late")
  })
  it("cancels an old feed when renderer configuration changes", async () => {
    let resolveRead!: (result: ReadableStreamReadResult<string>) => void
    const cancel = vi.fn().mockResolvedValue(undefined)
    const reader = {
      read: vi.fn(() => new Promise<ReadableStreamReadResult<string>>((resolve) => { resolveRead = resolve })),
      cancel,
      releaseLock: vi.fn(),
    }
    const first: AIGuiPlugin[] = []
    const second: AIGuiPlugin[] = []
    const { result, rerender } = renderHook(({ plugins }) => useAIRenderer({ plugins }), { initialProps: { plugins: first } })
    const feeding = result.current.feed({ getReader: () => reader } as unknown as ReadableStream<string>)
    await act(async () => { await Promise.resolve() })
    rerender({ plugins: second })
    expect(cancel).toHaveBeenCalledOnce()
    resolveRead({ done: true, value: undefined })
    await feeding
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
    const { result } = renderHook(() => useAIRenderer())
    await act(async () => { await result.current.feed(source) })
    expect(result.current.nodes[0]?.content).toBe("你好")
  })
  it("await feed observes the final scheduled state update", async () => {
    const scheduled: Array<() => void> = []
    const scheduler = (render: () => void) => scheduled.push(render)
    const { result } = renderHook(() => useAIRenderer({ scheduler }))
    await act(async () => { await result.current.feed((async function* () { yield "ready" })()) })
    expect(result.current.nodes[0]?.content).toBe("ready")
    expect(scheduled).toHaveLength(1)
  })
})
