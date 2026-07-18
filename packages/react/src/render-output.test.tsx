// @vitest-environment jsdom
import { render, act } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { ASTNode, AIGuiPlugin } from "@aigui/core"
import { renderNode } from "./render-node"

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
})
