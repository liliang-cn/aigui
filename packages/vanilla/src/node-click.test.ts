// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import type { AIGuiPlugin, ASTNode } from "@ai-gui/core"
import { createRenderer } from "./create-renderer"

const click = (el: Element) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }))

describe("onNodeClick", () => {
  it("reports the node a clicked block came from", () => {
    const onNodeClick = vi.fn<[ASTNode, MouseEvent]>()
    const el = document.createElement("div")
    const r = createRenderer(el, { onNodeClick })
    r.setText("# Title\n\nSome `/Users/me/file.ts` here\n")

    click(el.querySelector("code")!)

    expect(onNodeClick).toHaveBeenCalledOnce()
    const [node, event] = onNodeClick.mock.calls[0]
    expect(node.type).toBe("paragraph")
    // The exact element clicked is what a host needs — the path lives in the inline code, not in
    // the paragraph the node describes.
    expect((event.target as HTMLElement).textContent).toBe("/Users/me/file.ts")
    r.destroy()
  })
  it("distinguishes the blocks of one answer", () => {
    const seen: string[] = []
    const el = document.createElement("div")
    const r = createRenderer(el, { onNodeClick: (node) => seen.push(node.type) })
    r.setText("# Title\n\nA paragraph\n\n```js\nconst a = 1\n```\n")

    click(el.querySelector("h1")!)
    click(el.querySelector("p")!)
    click(el.querySelector("pre code")!)

    expect(seen).toEqual(["heading", "paragraph", "code"])
    r.destroy()
  })
  it("reports the node behind a plugin's own markup", () => {
    const plugin: AIGuiPlugin = {
      name: "widget",
      nodeRenderers: { widget: (node) => ({ kind: "html", html: `<div class="w"><span>${node.content?.trim()}</span></div>` }) },
    }
    const el = document.createElement("div")
    const clicked: ASTNode[] = []
    const r = createRenderer(el, { plugins: [plugin], onNodeClick: (node) => clicked.push(node) })
    r.setText("```widget\nhello\n```")

    click(el.querySelector("span")!)

    expect(clicked).toHaveLength(1)
    expect(clicked[0]).toMatchObject({ type: "widget", content: "hello\n" })
    r.destroy()
  })
  it("stays quiet for a click on the container itself", () => {
    const onNodeClick = vi.fn()
    const el = document.createElement("div")
    const r = createRenderer(el, { onNodeClick })
    r.setText("A paragraph\n")
    click(el)
    expect(onNodeClick).not.toHaveBeenCalled()
    r.destroy()
  })
  it("follows the nodes as the answer streams", () => {
    const seen: string[] = []
    const el = document.createElement("div")
    const r = createRenderer(el, { onNodeClick: (node) => seen.push(node.content ?? "") })
    r.push("First paragraph\n")
    r.push("\nSecond paragraph\n")
    click(el.querySelectorAll("p")[1])
    expect(seen).toEqual(["Second paragraph"])
    r.destroy()
  })
  it("stops listening once destroyed", () => {
    const onNodeClick = vi.fn()
    const el = document.createElement("div")
    document.body.appendChild(el)
    const r = createRenderer(el, { onNodeClick })
    r.setText("A paragraph\n")
    const paragraph = el.querySelector("p")!
    r.destroy()
    // The element is gone from the container, but a host holding a reference must not still be
    // called through it.
    paragraph.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(onNodeClick).not.toHaveBeenCalled()
    el.remove()
  })
})
