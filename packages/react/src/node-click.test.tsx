// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { act, fireEvent, render } from "@testing-library/react"
import { createRef } from "react"
import type { AIGuiPlugin, ASTNode } from "@ai-gui/core"
import { AIRenderer, type AIRendererHandle } from "./ai-renderer"

describe("onNodeClick", () => {
  it("reports the node a clicked block came from", () => {
    const onNodeClick = vi.fn()
    const view = render(<AIRenderer text={"# Title\n\nSome `/Users/me/file.ts` here\n"} onNodeClick={onNodeClick} />)

    fireEvent.click(view.container.querySelector("code")!)

    expect(onNodeClick).toHaveBeenCalledOnce()
    const [node, event] = onNodeClick.mock.calls[0]
    expect(node.type).toBe("paragraph")
    // The exact element clicked is what a host needs — the path is in the inline code, not in the
    // paragraph the node describes.
    expect((event.target as HTMLElement).textContent).toBe("/Users/me/file.ts")
  })
  it("distinguishes the blocks of one answer", () => {
    const seen: string[] = []
    const view = render(<AIRenderer text={"# Title\n\nA paragraph\n\n```js\nconst a = 1\n```\n"} onNodeClick={(node) => seen.push(node.type)} />)

    fireEvent.click(view.container.querySelector("h1")!)
    fireEvent.click(view.container.querySelector("p")!)
    fireEvent.click(view.container.querySelector("pre code")!)

    expect(seen).toEqual(["heading", "paragraph", "code"])
  })
  it("reports the node behind a plugin's own markup", () => {
    const plugin: AIGuiPlugin = {
      name: "widget",
      nodeRenderers: { widget: (node) => ({ kind: "html", html: `<div><span>${node.content?.trim()}</span></div>` }) },
    }
    const clicked: ASTNode[] = []
    const view = render(<AIRenderer text={"```widget\nhello\n```"} plugins={[plugin]} onNodeClick={(node) => clicked.push(node)} />)

    fireEvent.click(view.container.querySelector("span")!)

    expect(clicked).toHaveLength(1)
    expect(clicked[0]).toMatchObject({ type: "widget", content: "hello\n" })
  })
  it("lays out exactly as it does without the handler", () => {
    const text = "# Title\n\nA paragraph\n"
    const plain = render(<AIRenderer text={text} />)
    const clickable = render(<AIRenderer text={text} onNodeClick={() => {}} />)
    // The wrapper carrying the handler must not become a box of its own.
    const wrapper = clickable.container.querySelector("[data-aigui-node]") as HTMLElement
    expect(wrapper.style.display).toBe("contents")
    expect(plain.container.querySelector("h1")?.textContent).toBe(clickable.container.querySelector("h1")?.textContent)
  })
  it("follows the nodes as the answer streams", () => {
    const seen: string[] = []
    const ref = createRef<AIRendererHandle>()
    const view = render(<AIRenderer ref={ref} onNodeClick={(node) => seen.push(node.content ?? "")} />)
    act(() => ref.current!.push("First paragraph\n"))
    act(() => ref.current!.push("\nSecond paragraph\n"))

    fireEvent.click(view.container.querySelectorAll("p")[1])

    expect(seen).toEqual(["Second paragraph"])
  })
  it("stays quiet without the prop", () => {
    const view = render(<AIRenderer text={"A paragraph\n"} />)
    expect(view.container.querySelector("[data-aigui-node]")).toBeNull()
  })
})
