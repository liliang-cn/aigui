import { describe, expect, it } from "vitest"
import { assertPlugins, collectNodeRenderers } from "./plugins"
import { Renderer } from "./renderer"
import type { AIGuiPlugin } from "./types"

/** Stands in for a plugin package's export: a factory whose `.name` is the plugin's name. */
function katex(): AIGuiPlugin {
  return { name: "katex", nodeRenderers: { math: () => ({ kind: "html", html: "m" }) } }
}

describe("assertPlugins", () => {
  it("rejects the factory itself, and says how to fix it", () => {
    // The mistake this exists for. `katex` is a function whose `name` is "katex", so the renderer
    // used to accept it, find nothing to do, and render markdown with the maths silently missing.
    expect(() => assertPlugins([katex])).toThrow(TypeError)
    expect(() => assertPlugins([katex])).toThrow("plugins[0] is a factory function, not a plugin. Call it: katex()")
  })
  it("points at the offending position when only one of several is wrong", () => {
    expect(() => assertPlugins([katex(), katex])).toThrow("plugins[1]")
  })
  it("names the factory even when it is anonymous", () => {
    expect(() => assertPlugins([() => ({ name: "x" })])).toThrow("Call it: the factory")
  })
  it("rejects things that are not plugin objects at all", () => {
    expect(() => assertPlugins([null])).toThrow("plugins[0] is null, not a plugin object")
    expect(() => assertPlugins(["katex"])).toThrow("plugins[0] is string, not a plugin object")
    expect(() => assertPlugins([undefined])).toThrow("not a plugin object")
  })
  it("rejects a plugin with no name, which its stylesheet and debug events are keyed by", () => {
    expect(() => assertPlugins([{ nodeRenderers: {} } as AIGuiPlugin])).toThrow("has no `name`")
    expect(() => assertPlugins([{ name: "" } as AIGuiPlugin])).toThrow("has no `name`")
  })
  it("accepts real plugins, an empty list and nothing at all", () => {
    expect(() => assertPlugins([katex()])).not.toThrow()
    expect(() => assertPlugins([])).not.toThrow()
    expect(() => assertPlugins(undefined)).not.toThrow()
  })
  it("uses the label it was given", () => {
    expect(() => assertPlugins([katex], "options.plugins")).toThrow("options.plugins[0]")
  })
})

describe("the renderer refuses to start with a factory in the list", () => {
  it("throws from the constructor rather than rendering an answer with the maths missing", () => {
    expect(() => new Renderer({ plugins: [katex] as unknown as AIGuiPlugin[] })).toThrow("Call it: katex()")
  })
  it("throws from setPlugins too", () => {
    const r = new Renderer()
    expect(() => r.setPlugins([katex] as unknown as AIGuiPlugin[])).toThrow("Call it: katex()")
    // Rejected before anything changed: the renderer is still usable.
    expect(r.plugins).toEqual([])
  })
  it("throws from collectNodeRenderers, which a host may call on its own", () => {
    expect(() => collectNodeRenderers([katex] as unknown as AIGuiPlugin[])).toThrow("Call it: katex()")
  })
  it("still accepts a correctly built list everywhere", () => {
    const plugins = [katex()]
    expect(() => new Renderer({ plugins })).not.toThrow()
    expect(Object.keys(collectNodeRenderers(plugins))).toEqual(["math"])
  })
})
