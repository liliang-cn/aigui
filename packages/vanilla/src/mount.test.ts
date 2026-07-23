// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { createRenderer } from "./create-renderer"
import type { AIGuiPlugin, ASTNode, RenderOutput } from "@ai-gui/core"
import { createReconcileState, reconcile } from "./reconcile"

describe("vanilla mount RenderOutput", () => {
  it("mounts a live widget and cleans up on reset", async () => {
    const cleanup = vi.fn()
    const mountFn = vi.fn((el: HTMLElement) => { el.setAttribute("data-mounted", ""); return cleanup })
    const plugin: AIGuiPlugin = { name: "live", nodeRenderers: { live: () => ({ kind: "mount", mount: mountFn }) } }
    const host = document.createElement("div")
    document.body.appendChild(host)
    const r = createRenderer(host, { plugins: [plugin] })
    r.push("```live\n \n```")
    await new Promise((res) => setTimeout(res))
    expect(mountFn).toHaveBeenCalledTimes(1)
    expect(host.querySelector("[data-mounted]")).toBeTruthy()
    r.reset()
    expect(cleanup).toHaveBeenCalledTimes(1)
    host.remove()
  })
  it("does not run a delayed mount after reset", async () => {
    const mountFn = vi.fn()
    const plugin: AIGuiPlugin = { name: "live", nodeRenderers: { live: () => ({ kind: "mount", mount: mountFn }) } }
    const host = document.createElement("div")
    const r = createRenderer(host, { plugins: [plugin] })
    r.push("```live\n \n```")
    r.reset()
    await Promise.resolve()
    expect(mountFn).not.toHaveBeenCalled()
  })
  it("does not run a delayed mount after destroy", async () => {
    const mountFn = vi.fn()
    const plugin: AIGuiPlugin = { name: "live", nodeRenderers: { live: () => ({ kind: "mount", mount: mountFn }) } }
    const host = document.createElement("div")
    const r = createRenderer(host, { plugins: [plugin] })
    r.push("```live\n \n```")
    r.destroy()
    await Promise.resolve()
    expect(mountFn).not.toHaveBeenCalled()
  })
  it("cleans up a mounted plugin before rebuilding an updated node", async () => {
    const cleanup = vi.fn()
    const render = vi.fn((node: ASTNode) => ({
      kind: "mount" as const,
      mount: (el: HTMLElement) => {
        el.textContent = node.content ?? ""
        return cleanup
      },
    }))
    const container = document.createElement("div")
    const state = createReconcileState()
    const ctx = { nodeRenderers: { live: render } }
    reconcile(container, [{ key: "0:0", type: "live", content: "first", complete: true }], ctx, state)
    await Promise.resolve()
    reconcile(container, [{ key: "0:0", type: "live", content: "second", complete: true }], ctx, state)
    expect(cleanup).toHaveBeenCalledOnce()
    await Promise.resolve()
    expect(render).toHaveBeenCalledTimes(2)
    expect(container.textContent).toBe("second")
  })
  it("does not revive an async plugin result replaced by a newer node", async () => {
    let resolveFirst!: (output: RenderOutput) => void
    const render = vi.fn((node: ASTNode) => node.content === "first"
      ? new Promise<RenderOutput>((resolve) => { resolveFirst = resolve })
      : { kind: "html" as const, html: "<b>second</b>" })
    const container = document.createElement("div")
    const state = createReconcileState()
    const ctx = { nodeRenderers: { live: render } }
    reconcile(container, [{ key: "0:0", type: "live", content: "first", complete: true }], ctx, state)
    reconcile(container, [{ key: "0:0", type: "live", content: "second", complete: true }], ctx, state)
    resolveFirst({ kind: "html", html: "<i>stale</i>" })
    await Promise.resolve()
    expect(container.querySelector("i")).toBeNull()
    expect(container.querySelector("b")?.textContent).toBe("second")
  })
})
