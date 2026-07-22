// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ASTNode, AIGuiPlugin } from "@ai-gui/core"
import { renderNode } from "./render-node"

describe("react mount RenderOutput", () => {
  it("calls mount with a DOM element and cleanup on unmount", () => {
    const cleanup = vi.fn()
    const mount = vi.fn((el: HTMLElement) => { el.setAttribute("data-mounted", ""); return cleanup })
    const plugin: AIGuiPlugin = { name: "live", nodeRenderers: { live: () => ({ kind: "mount", mount }) } }
    const node: ASTNode = { key: "0:live", type: "live", content: "" }
    const { container, unmount } = render(<>{renderNode(node, { plugins: [plugin] })}</>)
    expect(mount).toHaveBeenCalledTimes(1)
    expect(container.querySelector("[data-mounted]")).toBeTruthy()
    unmount()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})
