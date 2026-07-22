// @vitest-environment jsdom
import { mount } from "@vue/test-utils"
import { nextTick } from "vue"
import { describe, expect, it } from "vitest"
import type { ASTNode, AIGuiPlugin } from "@ai-gui/core"
import { renderNode } from "./render-node"

const syncPlugin: AIGuiPlugin = { name: "s", nodeRenderers: { widget: () => ({ kind: "element", tag: "span", props: { class: "w" }, children: [] }) } }
const htmlPlugin: AIGuiPlugin = { name: "h", nodeRenderers: { box: () => ({ kind: "html", html: "<i>boxed</i>" }) } }
const asyncPlugin: AIGuiPlugin = { name: "a", nodeRenderers: { chart: () => Promise.resolve({ kind: "html", html: "<b>chart</b>" }) } }
const wrap = (node: ASTNode, ctx: any) => mount({ render: () => renderNode(node, ctx) })

describe("vue plugin rendering", () => {
  it("renders a sync element RenderOutput", () => {
    const w = wrap({ key: "0:widget", type: "widget", content: "x" }, { plugins: [syncPlugin] })
    expect(w.find("span.w").exists()).toBe(true)
  })
  it("renders a sync html RenderOutput", () => {
    const w = wrap({ key: "0:box", type: "box", content: "x" }, { plugins: [htmlPlugin] })
    expect(w.find("i").text()).toBe("boxed")
  })
  it("renders an async RenderOutput after resolution (placeholder first)", async () => {
    const w = wrap({ key: "0:chart", type: "chart", content: "x" }, { plugins: [asyncPlugin] })
    expect(w.find("[data-aigui-async-pending]").exists()).toBe(true)
    await Promise.resolve(); await nextTick()
    expect(w.find("b").text()).toBe("chart")
  })
})
