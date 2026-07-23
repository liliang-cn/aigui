// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { CardRegistry, type AIGuiPlugin, type RenderOutput } from "@ai-gui/core"
import { createRenderer } from "./create-renderer"

describe("createRenderer", () => {
  it("push renders into the element", () => {
    const el = document.createElement("div")
    const r = createRenderer(el)
    r.push("# Hi")
    expect(el.querySelector("h1")?.textContent).toBe("Hi")
  })
  it("streaming updates in place (heading node reused, content grows)", () => {
    const el = document.createElement("div")
    const r = createRenderer(el)
    r.push("# Ti"); const first = el.querySelector("h1")
    r.push("tle"); const second = el.querySelector("h1")
    expect(second?.textContent).toBe("Title")
    expect(first).toBe(second) // same element instance reused via keyed reconcile
  })
  it("reset clears the element", () => {
    const el = document.createElement("div")
    const r = createRenderer(el)
    r.push("hello"); r.reset()
    expect(el.children.length).toBe(0)
  })
  it("renders a card and routes onCardAction", () => {
    const registry = new CardRegistry()
    registry.register({ type: "poll", description: "p", render: (data: any, api: any) => { const b = document.createElement("button"); b.onclick = () => api.onAction({ type: "vote", params: data }); return b } })
    const onCardAction = vi.fn()
    const el = document.createElement("div")
    const r = createRenderer(el, { registry, onCardAction })
    r.push('```card:poll\n{"q":"x"}\n```')
    el.querySelector("button")!.click()
    expect(onCardAction).toHaveBeenCalledWith({ type: "vote", params: { q: "x" }, cardType: "poll" })
  })
  it("ignores push and pending feed updates after destroy", async () => {
    let release!: () => void
    const source = (async function* () {
      yield "first"
      await new Promise<void>((resolve) => { release = resolve })
      yield " late"
    })()
    const el = document.createElement("div")
    const r = createRenderer(el)
    const feeding = r.feed(source)
    await new Promise((resolve) => setTimeout(resolve))
    r.destroy()
    r.push("ignored")
    release()
    await feeding
    expect(el.children).toHaveLength(0)
  })
  it("does not revive an async plugin placeholder after reset", async () => {
    let resolve!: (output: RenderOutput) => void
    const plugin: AIGuiPlugin = { name: "async", nodeRenderers: { async: () => new Promise((r) => { resolve = r }) } }
    const el = document.createElement("div")
    const r = createRenderer(el, { plugins: [plugin] })
    r.push("```async\n \n```")
    r.reset()
    resolve({ kind: "html", html: "<b>late</b>" })
    await Promise.resolve()
    expect(el.children).toHaveLength(0)
  })
  it("re-renders a plugin node when its streamed fence becomes complete", () => {
    const render = vi.fn(() => ({ kind: "html" as const, html: "<strong>ready</strong>" }))
    const plugin: AIGuiPlugin = { name: "widget", nodeRenderers: { widget: render } }
    const el = document.createElement("div")
    const r = createRenderer(el, { plugins: [plugin] })
    r.push("```widget\nstreaming")
    expect(render).not.toHaveBeenCalled()
    expect(el.querySelector("[data-aigui-block-loading]")).toBeTruthy()
    r.push("\n```")
    expect(render).toHaveBeenCalledOnce()
    expect(el.querySelector("strong")?.textContent).toBe("ready")
  })
  it("does not inject streamed plugin content while replacing its loading gate", () => {
    const plugin: AIGuiPlugin = {
      name: "widget",
      nodeRenderers: { widget: () => ({ kind: "html", html: "<span>safe</span>" }) },
    }
    const el = document.createElement("div")
    const r = createRenderer(el, { plugins: [plugin] })
    r.push('```widget\n<img src=x onerror="globalThis.pwned=true">')
    expect(el.querySelector("img")).toBeNull()
    r.push("\n```")
    expect(el.querySelector("img")).toBeNull()
    expect(el.querySelector("span")?.textContent).toBe("safe")
  })
  it("await feed observes the final scheduled DOM update", async () => {
    const scheduled: Array<() => void> = []
    const el = document.createElement("div")
    const renderer = createRenderer(el, { scheduler: (render) => scheduled.push(render) })
    await renderer.feed((async function* () { yield "# Ready" })())
    expect(el.querySelector("h1")?.textContent).toBe("Ready")
    expect(scheduled).toHaveLength(1)
  })
  it("decodes a fetch byte stream across UTF-8 chunk boundaries", async () => {
    const bytes = new TextEncoder().encode("你好")
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 2))
        controller.enqueue(bytes.slice(2))
        controller.close()
      },
    })
    const el = document.createElement("div")
    const renderer = createRenderer(el)
    await renderer.feed(source)
    expect(el.textContent).toBe("你好")
  })
})
