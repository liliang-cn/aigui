import { describe, expect, it, vi } from "vitest"
import { Renderer } from "./renderer"
import type { AIGuiPlugin } from "./types"

describe("plugin AST commit hooks", () => {
  it("runs synchronously before patches are dispatched", () => {
    const order: string[] = []
    const plugin: AIGuiPlugin = {
      name: "commit",
      nodeRenderers: { command: () => ({ kind: "html", html: "" }) },
      onASTCommit: (nodes, context) => {
        order.push(`commit:${context.generation}:${nodes[0]?.complete}`)
      },
    }
    const renderer = new Renderer({ plugins: [plugin], onPatch: () => order.push("patch") })
    renderer.push("```command\n{}\n```")
    expect(order).toEqual(["commit:0:true", "patch"])
  })

  it("runs hooks in plugin order and isolates failures", () => {
    const order: string[] = []
    const first: AIGuiPlugin = { name: "first", onASTCommit: () => { order.push("first"); throw new Error("boom") } }
    const second: AIGuiPlugin = { name: "second", onASTCommit: () => order.push("second") }
    const onPatch = vi.fn()
    new Renderer({ plugins: [first, second], onPatch }).push("hello")
    expect(order).toEqual(["first", "second"])
    expect(onPatch).toHaveBeenCalledOnce()
  })

  it("increments the commit generation after reset", () => {
    const generations: number[] = []
    const renderer = new Renderer({ plugins: [{ name: "commit", onASTCommit: (_nodes, context) => generations.push(context.generation) }] })
    renderer.push("first")
    renderer.reset()
    renderer.push("second")
    expect(generations).toEqual([0, 1])
  })

  it("emits a bounded debug event for hook failures", () => {
    const onDebugEvent = vi.fn()
    const renderer = new Renderer({
      debug: true,
      onDebugEvent,
      plugins: [{ name: "broken", onASTCommit: () => { throw new Error("secret failure") } }],
    })
    renderer.push("hello")
    expect(onDebugEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: "plugin-commit-failed",
      source: "renderer",
      data: expect.objectContaining({ plugin: "broken", error: expect.objectContaining({ name: "Error" }) }),
    }))
  })
})
