// @vitest-environment jsdom
import { render, act } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ASTNode, AIGuiPlugin } from "@ai-gui/core"
import { renderNode } from "./render-node"
import { AsyncOutput } from "./render-output"

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
