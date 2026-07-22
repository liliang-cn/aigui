// @vitest-environment jsdom
import { mount as vueMount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"
import type { ASTNode, AIGuiPlugin } from "@ai-gui/core"
import { renderNode } from "./render-node"

describe("vue mount RenderOutput", () => {
  it("calls mount with a DOM element and cleanup on unmount", async () => {
    const cleanup = vi.fn()
    const mountFn = vi.fn((el: HTMLElement) => { el.setAttribute("data-mounted", ""); return cleanup })
    const plugin: AIGuiPlugin = { name: "live", nodeRenderers: { live: () => ({ kind: "mount", mount: mountFn }) } }
    const node: ASTNode = { key: "0:live", type: "live", content: "" }
    const w = vueMount({ render: () => renderNode(node, { plugins: [plugin] }) })
    expect(mountFn).toHaveBeenCalledTimes(1)
    expect(w.find("[data-mounted]").exists()).toBe(true)
    w.unmount()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})
