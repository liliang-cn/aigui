// @vitest-environment jsdom
import { mount } from "@vue/test-utils"
import { h, nextTick, ref } from "vue"
import { describe, expect, it, vi } from "vitest"
import type { ASTNode, AIGuiPlugin } from "@ai-gui/core"
import { renderNode } from "./render-node"
import { AsyncOutput } from "./render-output"

const syncPlugin: AIGuiPlugin = { name: "s", nodeRenderers: { widget: () => ({ kind: "element", tag: "span", props: { class: "w" }, children: [] }) } }
const htmlPlugin: AIGuiPlugin = { name: "h", nodeRenderers: { box: () => ({ kind: "html", html: "<i>boxed</i>" }) } }
const asyncPlugin: AIGuiPlugin = { name: "a", nodeRenderers: { chart: () => Promise.resolve({ kind: "html", html: "<b>chart</b>" }) } }
const wrap = (node: ASTNode, ctx: any) => mount({ render: () => renderNode(node, ctx) })

describe("vue plugin rendering", () => {
  it("renders a sync element RenderOutput", () => {
    const node = { key: "0:widget", type: "widget", content: "x" }
    const vnode = renderNode(node, { plugins: [syncPlugin] })
    expect(vnode.key).toBe(node.key)
    const w = mount({ render: () => vnode })
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
  it("resets for a replacement promise and ignores out-of-order resolution", async () => {
    let resolveFirst!: (value: any) => void
    let resolveSecond!: (value: any) => void
    const promise = ref(new Promise<any>((resolve) => { resolveFirst = resolve }))
    const w = mount({ setup: () => () => h(AsyncOutput, { promise: promise.value }) })
    const second = new Promise<any>((resolve) => { resolveSecond = resolve })
    promise.value = second
    await nextTick()
    resolveFirst({ kind: "html", html: "<b>old</b>" })
    await Promise.resolve(); await nextTick()
    expect(w.text()).not.toContain("old")
    resolveSecond({ kind: "html", html: "<b>new</b>" })
    await second; await nextTick()
    expect(w.text()).toBe("new")
  })
  it("renders rejection state and ignores resolution after unmount", async () => {
    let reject!: (reason: unknown) => void
    const rejected = new Promise<any>((_, rejectPromise) => { reject = rejectPromise })
    const w = mount(AsyncOutput, { props: { promise: rejected } })
    reject(new Error("broken"))
    await rejected.catch(() => undefined); await nextTick()
    expect(w.find("[data-aigui-async-error]").exists()).toBe(true)
    let resolve!: (value: any) => void
    const pending = new Promise<any>((r) => { resolve = r })
    await w.setProps({ promise: pending })
    w.unmount()
    resolve({ kind: "html", html: "late" })
    await pending
  })
  it("contains plugin renderer exceptions", () => {
    const plugin: AIGuiPlugin = { name: "bad", nodeRenderers: { bad: () => { throw new Error("boom") } } }
    expect(() => wrap({ key: "bad", type: "bad", content: "fallback" }, { plugins: [plugin] })).not.toThrow()
  })
})
