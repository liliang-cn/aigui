// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { baseCss, collectPluginStyles, injectPluginStyles } from "./plugin-styles"
import type { AIGuiPlugin } from "./types"

const plugin = (name: string, css?: string): AIGuiPlugin => ({ name, css })

describe("collectPluginStyles", () => {
  it("always leads with the base stylesheet", () => {
    const styles = collectPluginStyles()
    expect(styles).toEqual([{ name: "base", css: baseCss }])
  })

  it("keeps blocks inside their column on a narrow screen", () => {
    // The whole point of the base sheet: nothing a model emits may widen the page.
    expect(baseCss).toContain("[data-aigui-renderer] table{display:block")
    expect(baseCss).toContain("overflow-x:auto")
    expect(baseCss).toContain("max-width:100%")
  })

  it("collects each plugin's css after the base", () => {
    const styles = collectPluginStyles([plugin("a", ".a{color:red}"), plugin("b", ".b{color:blue}")])
    expect(styles.map((s) => s.name)).toEqual(["base", "a", "b"])
    expect(styles[1].css).toBe(".a{color:red}")
  })

  it("skips plugins without styles", () => {
    const styles = collectPluginStyles([plugin("a"), plugin("b", "   "), plugin("c", ".c{}")])
    expect(styles.map((s) => s.name)).toEqual(["base", "c"])
  })

  it("keeps one stylesheet per plugin name, last wins", () => {
    const styles = collectPluginStyles([plugin("dup", ".first{}"), plugin("dup", ".second{}")])
    expect(styles).toHaveLength(2)
    expect(styles[1].css).toBe(".second{}")
  })

  it("skips a bare-specifier @import, which only a bundler can resolve", () => {
    // plugin-katex ships exactly this; injected into a <style> it would silently do nothing.
    const styles = collectPluginStyles([plugin("katex", '@import "katex/dist/katex.min.css";')])
    expect(styles.map((s) => s.name)).toEqual(["base"])
  })

  it("keeps an @import a browser can actually fetch", () => {
    const url = collectPluginStyles([plugin("x", '@import url("https://cdn.example.com/x.css");')])
    expect(url.map((s) => s.name)).toEqual(["base", "x"])
    const absolute = collectPluginStyles([plugin("y", '@import "https://cdn.example.com/y.css";')])
    expect(absolute.map((s) => s.name)).toEqual(["base", "y"])
  })
})

describe("injectPluginStyles", () => {
  it("adds one style element per plugin", () => {
    const doc = document.implementation.createHTMLDocument("t")
    injectPluginStyles([plugin("a", ".a{}")], doc)
    const styles = doc.head.querySelectorAll("style[data-aigui-style]")
    expect(styles).toHaveLength(2)
    expect(styles[0].getAttribute("data-aigui-style")).toBe("base")
    expect(styles[1].textContent).toBe(".a{}")
  })

  it("is idempotent, so several renderers share one copy", () => {
    const doc = document.implementation.createHTMLDocument("t")
    injectPluginStyles([plugin("a", ".a{}")], doc)
    injectPluginStyles([plugin("a", ".a{}")], doc)
    injectPluginStyles([plugin("a", ".a{}")], doc)
    expect(doc.head.querySelectorAll("style[data-aigui-style]")).toHaveLength(2)
  })

  it("adds only what is missing when a later renderer brings more plugins", () => {
    const doc = document.implementation.createHTMLDocument("t")
    injectPluginStyles([plugin("a", ".a{}")], doc)
    injectPluginStyles([plugin("a", ".a{}"), plugin("b", ".b{}")], doc)
    const names = [...doc.head.querySelectorAll("style[data-aigui-style]")].map((el) => el.getAttribute("data-aigui-style"))
    expect(names).toEqual(["base", "a", "b"])
  })

  it("survives a plugin name that would break an attribute selector", () => {
    const doc = document.implementation.createHTMLDocument("t")
    expect(() => injectPluginStyles([plugin('we"ird\\name', ".x{}")], doc)).not.toThrow()
    expect(doc.head.querySelectorAll("style[data-aigui-style]")).toHaveLength(2)
  })

  it("does nothing without a document, which is what SSR gets", () => {
    expect(() => injectPluginStyles([plugin("a", ".a{}")], undefined as unknown as Document)).not.toThrow()
  })
})
