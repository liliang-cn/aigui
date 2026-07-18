import { describe, expect, it, vi } from "vitest"
import { Renderer } from "./renderer"
import type { Patch } from "./types"

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
})
