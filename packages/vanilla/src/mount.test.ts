// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { createRenderer } from "./create-renderer"
import type { AIGuiPlugin } from "@aigui/core"

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
})
