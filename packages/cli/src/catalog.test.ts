import { readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { ActionRegistry, CardRegistry, createActionRuntime } from "@ai-gui/core"
import { PLUGIN_CATALOG, pluginNames, type PluginContext } from "./catalog"

const packagesDir = fileURLToPath(new URL("../../", import.meta.url))
const pluginPackages = readdirSync(packagesDir)
  .filter((name) => name.startsWith("plugin-") && name !== "plugin-sdk")
  .map((name) => `@ai-gui/${name}`)
  .sort()

const context = (): PluginContext => ({
  registry: new CardRegistry(),
  actionRuntime: createActionRuntime({ registry: new ActionRegistry() }),
})

describe("the plugin catalog", () => {
  it("names every published plugin package exactly once", () => {
    const listed = Object.values(PLUGIN_CATALOG)
      .map((entry) => entry.package)
      .sort()
    expect(listed).toEqual(pluginPackages)
    expect(new Set(listed).size).toBe(listed.length)
  })

  it("lists names in a stable, alphabetical order", () => {
    expect(pluginNames()).toEqual([...pluginNames()].sort())
    expect(pluginNames()).toContain("graph")
    expect(pluginNames()).toContain("flashcards")
  })

  it("instantiates every plugin under plain Node and gets a prompt-bearing plugin back", async () => {
    for (const name of pluginNames()) {
      const plugin = await PLUGIN_CATALOG[name].load({}, context())
      expect(plugin.name, name).toBeTruthy()
      expect(plugin.promptSpec, `${name} has no promptSpec`).toBeTruthy()
    }
  }, 30_000)

  it("passes options through to the factory", async () => {
    const plain = await PLUGIN_CATALOG.katex.load({}, context())
    const chemistry = await PLUGIN_CATALOG.katex.load({ chemistry: true }, context())
    const spec = (plugin: typeof plain) => (typeof plugin.promptSpec === "function" ? plugin.promptSpec("en") : plugin.promptSpec)
    expect(spec(chemistry)).not.toBe(spec(plain))
  })

  it("hands the shared registry and runtime to the plugins that need them", async () => {
    const ctx = context()
    ctx.registry.register({ type: "weather", description: "Weather", schema: { type: "object" } })
    const ui = await PLUGIN_CATALOG.ui.load({}, ctx)
    const spec = typeof ui.promptSpec === "function" ? ui.promptSpec("en") : ui.promptSpec
    expect(spec).toContain("weather")
    await expect(PLUGIN_CATALOG.form.load({}, ctx)).resolves.toBeTruthy()
    await expect(PLUGIN_CATALOG.flashcards.load({}, ctx)).resolves.toBeTruthy()
    await expect(PLUGIN_CATALOG.artifact.load({}, ctx)).resolves.toBeTruthy()
  })
})
