// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import type { ASTNode, AIGuiPlugin } from "@ai-gui/core"
import { renderNodeToElement } from "./render-node-dom"

const syncPlugin: AIGuiPlugin = { name: "s", nodeRenderers: { widget: () => ({ kind: "element", tag: "span", props: { class: "w" }, children: [] }) } }
const htmlPlugin: AIGuiPlugin = { name: "h", nodeRenderers: { box: () => ({ kind: "html", html: "<i>boxed</i>" }) } }
const asyncPlugin: AIGuiPlugin = { name: "a", nodeRenderers: { chart: () => Promise.resolve({ kind: "html", html: "<b>chart</b>" }) } }

describe("vanilla plugin rendering", () => {
  it("renders a sync element RenderOutput", () => {
    const el = renderNodeToElement({ key: "0:widget", type: "widget", content: "x" } as ASTNode, { plugins: [syncPlugin] })
    expect(el.tagName).toBe("SPAN"); expect(el.className).toBe("w")
  })
  it("renders a sync html RenderOutput", () => {
    const el = renderNodeToElement({ key: "0:box", type: "box", content: "x" } as ASTNode, { plugins: [htmlPlugin] })
    expect(el.querySelector("i")?.textContent).toBe("boxed")
  })
  it("renders a placeholder then swaps in the async result", async () => {
    const host = document.createElement("div")
    const el = renderNodeToElement({ key: "0:chart", type: "chart", content: "x" } as ASTNode, { plugins: [asyncPlugin] })
    host.appendChild(el)
    expect(host.querySelector("[data-aigui-async-pending]")).toBeTruthy()
    await new Promise((r) => setTimeout(r))
    expect(host.querySelector("b")?.textContent).toBe("chart")
  })
})
