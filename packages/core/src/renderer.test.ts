import { describe, expect, it, vi } from "vitest"
import { CardRegistry } from "./card-registry"
import { Renderer } from "./renderer"
import type { ASTNode, Patch } from "./types"

describe("Renderer", () => {
  it("push accumulates and fires onPatch after each chunk", () => {
    const onPatch = vi.fn()
    const r = new Renderer({ onPatch })
    r.push("hello")
    expect(onPatch).toHaveBeenCalled()
    const patches: Patch[] = onPatch.mock.calls.at(-1)![0]
    expect(patches.some((p) => p.op === "insert")).toBe(true)
  })
  it("feed consumes an async iterable", async () => {
    const onPatch = vi.fn()
    const r = new Renderer({ onPatch })
    async function* gen() { yield "# Ti"; yield "tle" }
    await r.feed(gen())
    expect(onPatch).toHaveBeenCalledTimes(2)
  })
  it("feed decodes split UTF-8 bytes from an async iterable", async () => {
    const snapshots: ASTNode[][] = []
    const r = new Renderer({ onPatch: (_patches, nodes) => snapshots.push(nodes) })
    const bytes = new TextEncoder().encode("你好")
    async function* gen() {
      yield bytes.slice(0, 2)
      yield bytes.slice(2, 4)
      yield bytes.slice(4)
    }
    await r.feed(gen())
    expect(snapshots.at(-1)?.[0]?.content).toBe("你好")
  })
  it("feed decodes split UTF-8 bytes from a ReadableStream and releases its reader", async () => {
    const snapshots: ASTNode[][] = []
    const bytes = new TextEncoder().encode("€")
    const releaseLock = vi.fn()
    const reader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: bytes.slice(0, 1) })
        .mockResolvedValueOnce({ done: false, value: bytes.slice(1) })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: vi.fn(),
      releaseLock,
    }
    const stream = { getReader: () => reader } as unknown as ReadableStream<Uint8Array>
    await new Renderer({ onPatch: (_patches, nodes) => snapshots.push(nodes) }).feed(stream)
    expect(snapshots.at(-1)?.[0]?.content).toBe("€")
    expect(releaseLock).toHaveBeenCalledOnce()
    expect(reader.cancel).not.toHaveBeenCalled()
  })
  it("a newer feed wins and closes the superseded async iterator", async () => {
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve })
    const returned = vi.fn()
    const first = {
      [Symbol.asyncIterator]() {
        let step = 0
        return {
          async next() {
            if (step++ === 0) return { done: false as const, value: "old " }
            await firstGate
            return { done: false as const, value: "stale" }
          },
          return: async () => { returned(); return { done: true as const, value: undefined } },
        }
      },
    }
    const snapshots: ASTNode[][] = []
    const r = new Renderer({ onPatch: (_patches, nodes) => snapshots.push(nodes) })
    const oldFeed = r.feed(first)
    await Promise.resolve()
    await r.feed((async function* () { yield "new" })())
    releaseFirst()
    await oldFeed
    expect(returned).toHaveBeenCalledOnce()
    expect(snapshots.at(-1)?.[0]?.content).toBe("old new")
    expect(snapshots.at(-1)?.[0]?.content).not.toContain("stale")
  })
  it("reset cancels an active stream reader and notifies an empty AST", async () => {
    let resolveRead!: (result: ReadableStreamReadResult<string>) => void
    const cancel = vi.fn().mockResolvedValue(undefined)
    const releaseLock = vi.fn()
    const reader = {
      read: vi.fn(() => new Promise<ReadableStreamReadResult<string>>((resolve) => { resolveRead = resolve })),
      cancel,
      releaseLock,
    }
    const onPatch = vi.fn()
    const r = new Renderer({ onPatch })
    r.push("visible")
    const feeding = r.feed({ getReader: () => reader } as unknown as ReadableStream<string>)
    await Promise.resolve()
    r.reset()
    resolveRead({ done: true, value: undefined })
    await feeding
    expect(cancel).toHaveBeenCalledOnce()
    expect(releaseLock).toHaveBeenCalledOnce()
    expect(onPatch.mock.calls.at(-1)?.[1]).toEqual([])
    expect(onPatch.mock.calls.at(-1)?.[0]).toEqual([{ op: "remove", key: "0:0" }])
  })
  it("supports AbortSignal and cancels an active stream reader", async () => {
    let resolveRead!: (result: ReadableStreamReadResult<string>) => void
    const cancel = vi.fn().mockResolvedValue(undefined)
    const releaseLock = vi.fn()
    const reader = {
      read: vi.fn(() => new Promise<ReadableStreamReadResult<string>>((resolve) => { resolveRead = resolve })),
      cancel,
      releaseLock,
    }
    const controller = new AbortController()
    const feeding = new Renderer().feed(
      { getReader: () => reader } as unknown as ReadableStream<string>,
      { signal: controller.signal },
    )
    await Promise.resolve()
    controller.abort()
    resolveRead({ done: true, value: undefined })
    await expect(feeding).rejects.toMatchObject({ name: "AbortError" })
    expect(cancel).toHaveBeenCalledOnce()
    expect(releaseLock).toHaveBeenCalledOnce()
  })
  it("contains a rejected cancellation without an unhandled rejection", async () => {
    let resolveRead!: (result: ReadableStreamReadResult<string>) => void
    const reader = {
      read: vi.fn(() => new Promise<ReadableStreamReadResult<string>>((resolve) => { resolveRead = resolve })),
      cancel: vi.fn().mockRejectedValue(new Error("cancel failed")),
      releaseLock: vi.fn(),
    }
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)
    const renderer = new Renderer()
    const feeding = renderer.feed({ getReader: () => reader } as unknown as ReadableStream<string>)
    await Promise.resolve()
    renderer.reset()
    resolveRead({ done: true, value: undefined })
    await feeding
    await Promise.resolve()
    process.off("unhandledRejection", unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })
  it("passes the full current AST as the second onPatch arg", () => {
    const onPatch = vi.fn()
    const r = new Renderer({ onPatch })
    r.push("# A")
    const [, nodes] = onPatch.mock.calls.at(-1)!
    expect(Array.isArray(nodes)).toBe(true)
    expect(nodes.some((n: any) => n.type === "heading")).toBe(true)
  })
  it("reset clears state", () => {
    const onPatch = vi.fn()
    const r = new Renderer({ onPatch })
    r.push("hello")
    r.reset()
    onPatch.mockClear()
    r.push("world")
    const patches: Patch[] = onPatch.mock.calls.at(-1)![0]
    expect(patches[0]).toMatchObject({ op: "insert", index: 0 })
  })
  it("can batch renders through an injected scheduler and flush explicitly", () => {
    const scheduled: Array<() => void> = []
    const onPatch = vi.fn()
    const r = new Renderer({ onPatch, scheduler: (render) => scheduled.push(render) })
    r.push("a")
    r.push("b")
    expect(onPatch).not.toHaveBeenCalled()
    r.flush()
    expect(onPatch).toHaveBeenCalledOnce()
    expect(onPatch.mock.calls[0][1][0].content).toBe("ab")
    scheduled[0]()
    expect(onPatch).toHaveBeenCalledOnce()
  })
  it("flushes the final scheduled render before feed resolves", async () => {
    const scheduled: Array<() => void> = []
    const onPatch = vi.fn()
    const r = new Renderer({ onPatch, scheduler: (render) => scheduled.push(render) })
    await r.feed((async function* () { yield "final" })())
    expect(onPatch).toHaveBeenCalledOnce()
    expect(onPatch.mock.calls[0][1][0].content).toBe("final")
    scheduled[0]()
    expect(onPatch).toHaveBeenCalledOnce()
  })
  it("registers plugin cards into the registry", () => {
    const registry = new CardRegistry()
    const r = new Renderer({ registry, plugins: [{ name: "pl", cards: [{ type: "poll", description: "p" }] }] })
    r.push("hi")
    expect(registry.has("poll")).toBe(true)
  })
})
