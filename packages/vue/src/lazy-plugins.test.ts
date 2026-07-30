// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { mount } from "@vue/test-utils"
import { nextTick } from "vue"
import type { AIGuiPlugin, ASTNode } from "@ai-gui/core"
import { AIRenderer } from "./ai-renderer"

const widget: AIGuiPlugin = {
  name: "widget",
  css: ".widget{color:red}",
  nodeRenderers: { widget: (node) => ({ kind: "html", html: `<b data-widget>${node.content?.trim()}</b>`, trusted: true }) },
}

const flush = async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); await nextTick() }

describe("AIRenderer with a plugin loader", () => {
  it("renders plain markdown first and redraws when the plugins land", async () => {
    const w = mount(AIRenderer, { props: { text: "```widget\nhello\n```", plugins: () => Promise.resolve([widget]) } })
    // Before any microtask has run: the import is still in flight and the fence is a code block.
    expect(w.find("pre").exists()).toBe(true)

    await flush()

    expect(w.find("[data-widget]").text()).toBe("hello")
    expect(w.find("pre").exists()).toBe(false)
  })
  it("needs no replay: text pushed before and after the chunk both render", async () => {
    const w = mount(AIRenderer, { props: { plugins: () => Promise.resolve([widget]) } })
    ;(w.vm as any).push("# Title\n\n```widget\nhal")
    await flush()
    ;(w.vm as any).push("f\n```\n")
    await nextTick()

    expect(w.find("h1").text()).toBe("Title")
    expect(w.find("[data-widget]").text()).toBe("half")
  })
  it("injects the late plugins' stylesheets", async () => {
    const styled: AIGuiPlugin = { ...widget, name: "vue-late-styles", css: ".late{color:blue}" }
    expect(document.querySelector('style[data-aigui-style="vue-late-styles"]')).toBeNull()
    mount(AIRenderer, { props: { text: "hi", plugins: () => Promise.resolve([styled]) } })
    await flush()
    expect(document.querySelector('style[data-aigui-style="vue-late-styles"]')?.textContent).toBe(".late{color:blue}")
  })
  it("keeps rendering plain markdown and reports a failed import", async () => {
    const onDebugEvent = vi.fn()
    const w = mount(AIRenderer, {
      props: { text: "```widget\nhello\n```", plugins: () => Promise.reject(new Error("chunk 404")), debug: true, onDebugEvent },
    })
    await flush()
    expect(w.find("pre").text()).toContain("hello")
    expect(onDebugEvent.mock.calls.map(([event]) => event.type)).toContain("plugins-load-failed")
  })
  it("still accepts a plain array, with no intermediate redraw", async () => {
    const w = mount(AIRenderer, { props: { text: "```widget\nhello\n```", plugins: [widget] } })
    await nextTick()
    expect(w.find("[data-widget]").text()).toBe("hello")
  })
  it("keeps the rendered answer when a new array holds the same plugins", async () => {
    const w = mount(AIRenderer, { props: { text: "# Title", plugins: [widget] } })
    await nextTick()
    await w.setProps({ plugins: [widget] })
    await nextTick()
    expect(w.find("h1").text()).toBe("Title")
  })
})

describe("onNodeClick", () => {
  it("reports the node a clicked block came from", async () => {
    const clicked: Array<[ASTNode, string | null | undefined]> = []
    const w = mount(AIRenderer, {
      props: {
        text: "# Title\n\nSome `/Users/me/file.ts` here\n",
        onNodeClick: (node: ASTNode, event: MouseEvent) => clicked.push([node, (event.target as HTMLElement).textContent]),
      },
    })
    await nextTick()

    await w.find("code").trigger("click")

    expect(clicked).toHaveLength(1)
    expect(clicked[0][0].type).toBe("paragraph")
    // The exact element clicked is what a host needs — the path is in the inline code.
    expect(clicked[0][1]).toBe("/Users/me/file.ts")
  })
  it("distinguishes the blocks of one answer", async () => {
    const seen: string[] = []
    const w = mount(AIRenderer, {
      props: { text: "# Title\n\nA paragraph\n\n```js\nconst a = 1\n```\n", onNodeClick: (node: ASTNode) => seen.push(node.type) },
    })
    await nextTick()

    await w.find("h1").trigger("click")
    await w.find("p").trigger("click")
    await w.find("pre code").trigger("click")

    expect(seen).toEqual(["heading", "paragraph", "code"])
  })
  it("reports the node behind a plugin's own markup", async () => {
    const plugin: AIGuiPlugin = {
      name: "widget",
      nodeRenderers: { widget: (node) => ({ kind: "html", html: `<div><span>${node.content?.trim()}</span></div>`, trusted: true }) },
    }
    const clicked: ASTNode[] = []
    const w = mount(AIRenderer, {
      props: { text: "```widget\nhello\n```", plugins: [plugin], onNodeClick: (node: ASTNode) => clicked.push(node) },
    })
    await nextTick()

    await w.find("span").trigger("click")

    expect(clicked).toHaveLength(1)
    expect(clicked[0]).toMatchObject({ type: "widget", content: "hello\n" })
  })
  it("adds no box of its own, and nothing at all without the handler", async () => {
    const plain = mount(AIRenderer, { props: { text: "# Title" } })
    const clickable = mount(AIRenderer, { props: { text: "# Title", onNodeClick: () => {} } })
    await nextTick()
    expect(plain.find("[data-aigui-node]").exists()).toBe(false)
    expect((clickable.find("[data-aigui-node]").element as HTMLElement).style.display).toBe("contents")
  })
})
