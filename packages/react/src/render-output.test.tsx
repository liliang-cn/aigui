// @vitest-environment jsdom
import { render, act } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ASTNode, AIGuiPlugin } from "@ai-gui/core"
import { renderNode } from "./render-node"
import { AsyncOutput, renderOutput } from "./render-output"

const syncPlugin: AIGuiPlugin = { name: "s", nodeRenderers: { widget: () => ({ kind: "element", tag: "span", props: { className: "w" }, children: [] }) } }
const htmlPlugin: AIGuiPlugin = { name: "h", nodeRenderers: { box: () => ({ kind: "html", html: "<i>boxed</i>" }) } }
const asyncPlugin: AIGuiPlugin = { name: "a", nodeRenderers: { chart: () => Promise.resolve({ kind: "html", html: "<b>chart</b>" }) } }

describe("react plugin rendering", () => {
  it("renders a sync element RenderOutput", () => {
    const node: ASTNode = { key: "0:widget", type: "widget", content: "x" }
    const { container } = render(<>{renderNode(node, { plugins: [syncPlugin] })}</>)
    expect(container.querySelector("span.w")).toBeTruthy()
  })
  it("renders a sync html RenderOutput", () => {
    const node: ASTNode = { key: "0:box", type: "box", content: "x" }
    const { container } = render(<>{renderNode(node, { plugins: [htmlPlugin] })}</>)
    expect(container.querySelector("i")?.textContent).toBe("boxed")
  })
  it("renders an async RenderOutput after resolution (placeholder first)", async () => {
    const node: ASTNode = { key: "0:chart", type: "chart", content: "x" }
    const { container } = render(<>{renderNode(node, { plugins: [asyncPlugin] })}</>)
    expect(container.querySelector("[data-aigui-async-pending]")).toBeTruthy()
    await act(async () => { await Promise.resolve() })
    expect(container.querySelector("b")?.textContent).toBe("chart")
  })

  it("does not restart an async node renderer after its promise resolves", async () => {
    const node: ASTNode = { key: "0:chart-stable", type: "chart", content: "x" }
    let calls = 0
    const plugin: AIGuiPlugin = {
      name: "stable-async",
      nodeRenderers: {
        chart: () => {
          calls++
          return Promise.resolve({ kind: "html", html: "<b>stable</b>" })
        },
      },
    }
    const view = render(<>{renderNode(node, { plugins: [plugin] })}</>)
    await act(async () => { await Promise.resolve() })
    expect(view.container.textContent).toBe("stable")
    view.rerender(<>{renderNode({ ...node }, { plugins: [plugin] })}</>)
    await act(async () => { await Promise.resolve() })
    expect(view.container.textContent).toBe("stable")
    expect(calls).toBe(1)
  })
  it("restarts an async node renderer when the node content changes", async () => {
    let calls = 0
    const plugin: AIGuiPlugin = {
      name: "changing-async",
      nodeRenderers: {
        chart: (node) => {
          calls++
          return Promise.resolve({ kind: "html", html: `<b>${node.content}</b>` })
        },
      },
    }
    const view = render(<>{renderNode({ key: "chart", type: "chart", content: "first" }, { plugins: [plugin] })}</>)
    await act(async () => { await Promise.resolve() })
    view.rerender(<>{renderNode({ key: "chart", type: "chart", content: "second" }, { plugins: [plugin] })}</>)
    await act(async () => { await Promise.resolve() })
    expect(view.container.textContent).toBe("second")
    expect(calls).toBe(2)
  })
  it("does not share async outputs between renderer instances", async () => {
    let calls = 0
    const plugin: AIGuiPlugin = {
      name: "isolated-async",
      nodeRenderers: {
        chart: () => {
          calls++
          return Promise.resolve({ kind: "html", html: `<b>${calls}</b>` })
        },
      },
    }
    const node: ASTNode = { key: "same", type: "chart", content: "same" }
    const first = render(<>{renderNode(node, { plugins: [plugin] })}</>)
    const second = render(<>{renderNode(node, { plugins: [plugin] })}</>)
    await act(async () => { await Promise.resolve() })
    expect(first.container.textContent).toBe("1")
    expect(second.container.textContent).toBe("2")
    expect(calls).toBe(2)
  })
  it("restarts an async node renderer when the renderer identity changes", async () => {
    const node: ASTNode = { key: "same", type: "chart", content: "same" }
    const first: AIGuiPlugin = { name: "first", nodeRenderers: { chart: () => Promise.resolve({ kind: "html", html: "<b>first</b>" }) } }
    const second: AIGuiPlugin = { name: "second", nodeRenderers: { chart: () => Promise.resolve({ kind: "html", html: "<b>second</b>" }) } }
    const view = render(<>{renderNode(node, { plugins: [first] })}</>)
    await act(async () => { await Promise.resolve() })
    view.rerender(<>{renderNode(node, { plugins: [second] })}</>)
    await act(async () => { await Promise.resolve() })
    expect(view.container.textContent).toBe("second")
  })
  it("resets for a replacement promise and ignores an older resolution", async () => {
    let resolveFirst!: (value: any) => void
    let resolveSecond!: (value: any) => void
    const first = new Promise<any>((resolve) => { resolveFirst = resolve })
    const second = new Promise<any>((resolve) => { resolveSecond = resolve })
    const { container, rerender } = render(<AsyncOutput promise={first} />)
    rerender(<AsyncOutput promise={second} />)
    expect(container.querySelector("[data-aigui-async-pending]")).toBeTruthy()
    await act(async () => { resolveFirst({ kind: "html", html: "<b>old</b>" }); await first })
    expect(container.textContent).not.toContain("old")
    await act(async () => { resolveSecond({ kind: "html", html: "<b>new</b>" }); await second })
    expect(container.textContent).toBe("new")
  })
  it("renders a stable error boundary for a rejected output", async () => {
    const promise = Promise.reject(new Error("broken"))
    const { container } = render(<AsyncOutput promise={promise} />)
    await act(async () => { await promise.catch(() => undefined) })
    expect(container.querySelector("[data-aigui-async-error]")).toBeTruthy()
  })
  it("does not update after unmount", async () => {
    let resolve!: (value: any) => void
    const promise = new Promise<any>((r) => { resolve = r })
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const view = render(<AsyncOutput promise={promise} />)
    view.unmount()
    await act(async () => { resolve({ kind: "html", html: "late" }); await promise })
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })
})

describe("HTML boolean attributes", () => {
  it("renders `open: \"\"` as an open <details>", () => {
    // React drops falsy props, and "" is falsy — so a `<details open="">` from a
    // plugin rendered collapsed, with nothing thrown and nothing warned. That is
    // exactly how `evidence({ defaultOpen: true })` looked like a no-op.
    const { container } = render(
      <>{renderOutput({ kind: "element", tag: "details", props: { open: "" }, children: [] })}</>,
    )
    expect(container.querySelector("details")?.hasAttribute("open")).toBe(true)
  })

  it("leaves a data attribute's empty string alone", () => {
    // Only presence attributes get the treatment: `data-x=""` is a real, distinct
    // value, and turning it into `data-x="true"` would change what a CSS selector
    // like [data-x=""] matches.
    const { container } = render(
      <>{renderOutput({ kind: "element", tag: "div", props: { "data-aigui-evidence": "" }, children: [] })}</>,
    )
    expect(container.querySelector("div")?.getAttribute("data-aigui-evidence")).toBe("")
  })
})
