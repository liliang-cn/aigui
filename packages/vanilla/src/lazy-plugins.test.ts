// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import type { AIGuiPlugin } from "@ai-gui/core"
import { createRenderer } from "./create-renderer"

const widget: AIGuiPlugin = {
  name: "widget",
  css: ".widget{color:red}",
  nodeRenderers: { widget: (node) => ({ kind: "html", html: `<b data-widget>${node.content?.trim()}</b>` }) },
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe("createRenderer with a plugin loader", () => {
  it("renders plain markdown first and redraws when the plugins land", async () => {
    const el = document.createElement("div")
    const r = createRenderer(el, { plugins: () => Promise.resolve([widget]) })
    r.setText("```widget\nhello\n```")

    // The chunk has not arrived, so the fence is an ordinary code block.
    expect(el.querySelector("pre")).not.toBeNull()
    expect(el.querySelector("[data-widget]")).toBeNull()

    await flush()

    expect(el.querySelector("[data-widget]")?.textContent).toBe("hello")
    expect(el.querySelector("pre")).toBeNull()
    r.destroy()
  })
  it("needs no replay from the host: text pushed before and after the chunk both render", async () => {
    const el = document.createElement("div")
    const r = createRenderer(el, { plugins: () => Promise.resolve([widget]) })
    r.push("# Title\n\n```widget\nhal")
    await flush()
    r.push("f\n```\n")

    expect(el.querySelector("h1")?.textContent).toBe("Title")
    expect(el.querySelector("[data-widget]")?.textContent).toBe("half")
    r.destroy()
  })
  it("injects the late plugins' stylesheets", async () => {
    // Its own name: the injected styles live in the document, which every test in this file shares.
    const styled: AIGuiPlugin = { ...widget, name: "late-styles", css: ".late{color:blue}" }
    const el = document.createElement("div")
    document.body.appendChild(el)
    const r = createRenderer(el, { plugins: () => Promise.resolve([styled]) })
    expect(document.querySelector('style[data-aigui-style="late-styles"]')).toBeNull()
    await flush()
    expect(document.querySelector('style[data-aigui-style="late-styles"]')?.textContent).toBe(".late{color:blue}")
    r.destroy()
    el.remove()
  })
  it("keeps rendering plain markdown when the import fails", async () => {
    const el = document.createElement("div")
    const events: string[] = []
    const r = createRenderer(el, {
      plugins: () => Promise.reject(new Error("chunk 404")),
      debug: true,
      onDebugEvent: (event) => events.push(event.type),
    })
    r.setText("```widget\nhello\n```")
    await flush()
    expect(el.querySelector("pre")?.textContent).toContain("hello")
    expect(events).toContain("plugins-load-failed")
    r.destroy()
  })
  it("accepts a synchronous loader", () => {
    const el = document.createElement("div")
    const r = createRenderer(el, { plugins: () => [widget] })
    r.setText("```widget\nhello\n```")
    expect(el.querySelector("[data-widget]")).not.toBeNull()
    r.destroy()
  })
  it("still takes a plain array without a redraw", () => {
    const el = document.createElement("div")
    const r = createRenderer(el, { plugins: [widget] })
    r.setText("```widget\nhello\n```")
    // No intermediate <pre>: the plugins were there for the first parse.
    expect(el.querySelector("[data-widget]")?.textContent).toBe("hello")
    r.destroy()
  })
  it("ignores plugins that resolve after destroy", async () => {
    const el = document.createElement("div")
    const r = createRenderer(el, { plugins: () => Promise.resolve([widget]) })
    r.setText("```widget\nhello\n```")
    r.destroy()
    await flush()
    expect(el.querySelector("[data-widget]")).toBeNull()
  })
})

describe("VanillaRenderer.setPlugins", () => {
  it("swaps plugins in later and redraws what is on screen", () => {
    const el = document.createElement("div")
    const r = createRenderer(el)
    r.setText("```widget\nhello\n```")
    expect(el.querySelector("pre")).not.toBeNull()
    r.setPlugins([widget])
    expect(el.querySelector("[data-widget]")?.textContent).toBe("hello")
    r.destroy()
  })
  it("puts text with no plugin syntax back on screen", () => {
    const el = document.createElement("div")
    const r = createRenderer(el)
    r.setText("# Just a heading")
    r.setPlugins([widget])
    // The AST is unchanged, so no patches are dispatched — the DOM still has to survive.
    expect(el.querySelector("h1")?.textContent).toBe("Just a heading")
    r.destroy()
  })
  it("runs a mounted widget's cleanup when the plugins change under it", async () => {
    const cleanup = vi.fn()
    const mounted: AIGuiPlugin = {
      name: "mounted",
      nodeRenderers: { widget: () => ({ kind: "mount", mount: () => cleanup }) },
    }
    const el = document.createElement("div")
    const r = createRenderer(el, { plugins: [mounted] })
    r.setText("```widget\nhello\n```")
    // Mounting is deferred to a microtask so the element is in the DOM first.
    await flush()
    r.setPlugins([widget])
    expect(cleanup).toHaveBeenCalledOnce()
    r.destroy()
  })
  it("is a no-op for the same plugins in a new array", () => {
    const el = document.createElement("div")
    const r = createRenderer(el, { plugins: [widget] })
    r.setText("```widget\nhello\n```")
    const before = el.querySelector("[data-widget]")
    r.setPlugins([widget])
    // Rebuilding for a fresh array holding the same plugin would tear down every widget on screen.
    expect(el.querySelector("[data-widget]")).toBe(before)
    r.destroy()
  })
  it("drops the plugins again when handed none", () => {
    const el = document.createElement("div")
    const r = createRenderer(el, { plugins: [widget] })
    r.setText("```widget\nhello\n```")
    r.setPlugins(undefined)
    expect(el.querySelector("[data-widget]")).toBeNull()
    expect(el.querySelector("pre")?.textContent).toContain("hello")
    r.destroy()
  })
})

describe("a factory passed instead of a plugin", () => {
  function widgetFactory() { return widget }

  it("throws instead of rendering an answer with the plugin's blocks missing", () => {
    const el = document.createElement("div")
    expect(() => createRenderer(el, { plugins: [widgetFactory] as never })).toThrow("Call it: widgetFactory()")
  })
  it("throws from setPlugins without tearing down what is on screen", () => {
    const el = document.createElement("div")
    const r = createRenderer(el, { plugins: [widget] })
    r.setText("```widget\nhello\n```")
    expect(() => r.setPlugins([widgetFactory] as never)).toThrow("Call it: widgetFactory()")
    expect(el.querySelector("[data-widget]")?.textContent).toBe("hello")
    r.destroy()
  })
  it("rejects what a loader resolved to, on the same path the loader uses", async () => {
    const el = document.createElement("div")
    const resolved = [widgetFactory] as never
    const r = createRenderer(el, { plugins: () => Promise.resolve(resolved) })
    // The loader's continuation is `setPlugins`, so a resolved list of factories fails there — as a
    // rejected promise rather than synchronously, since it arrives a microtask later.
    await expect(Promise.resolve(resolved).then((p) => r.setPlugins(p))).rejects.toThrow("Call it: widgetFactory()")
    r.destroy()
  })
})
