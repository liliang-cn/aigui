import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { customPluginDir, loadCustomPlugins, scaffoldCustomPlugin } from "./custom"

describe("custom blocks", () => {
  it("scaffolds a block that loads, with its fence, rules and a script that registers a pack", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aigui-custom-"))
    await scaffoldCustomPlugin("ticket", dir)
    const { plugins, problems } = await loadCustomPlugins(dir)
    expect(problems).toEqual([])
    expect(plugins).toMatchObject([{ name: "ticket", fences: ["ticket"], picture: true }])
    expect(plugins[0].spec).toContain("```ticket")
    expect(plugins[0].hash).toMatch(/^[0-9a-f]{10}$/)
    const script = await readFile(plugins[0].script, "utf8")
    // Evaluated the way a page does: as a classic script registering on the global.
    const g: { __aiguiPacks?: Record<string, (theme: string, still: boolean) => Array<{ name: string; nodeRenderers: Record<string, unknown> }>> } = {}
    new Function("globalThis", script)(g)
    expect(Object.keys(g.__aiguiPacks!)).toEqual(["ticket"])
    expect(Object.keys(g.__aiguiPacks!.ticket("light", false)[0].nodeRenderers)).toEqual(["ticket"])
    await expect(scaffoldCustomPlugin("ticket", dir)).rejects.toThrow("already exists")
    await expect(scaffoldCustomPlugin("Bad Name", dir)).rejects.toThrow("lowercase")
  })

  it("skips a broken folder with a reason, and keeps the rest", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aigui-custom-"))
    await scaffoldCustomPlugin("good", dir)
    const bad = async (name: string, manifest: unknown, files: Record<string, string> = { "plugin.js": "", "spec.md": "x" }) => {
      await mkdir(join(dir, name))
      await writeFile(join(dir, name, "aigui.json"), JSON.stringify(manifest))
      for (const [f, text] of Object.entries(files)) await writeFile(join(dir, name, f), text)
    }
    await bad("a-taken", { name: "chartish", fences: ["chart"], description: "x" })
    await bad("b-nospec", { name: "nospec", fences: ["nospec"], description: "x" }, { "plugin.js": "" })
    await bad("c-badname", { name: "Has Space", fences: ["x"], description: "x" })
    const { plugins, problems } = await loadCustomPlugins(dir, ["chart"])
    expect(plugins.map((p) => p.name)).toEqual(["good"])
    expect(problems).toEqual([
      'a-taken: "chart" is already a block',
      "b-nospec: spec.md is missing — it is what tells the model how to write the block",
      "c-badname: name must be lowercase letters, digits and dashes",
    ])
  })

  it("lives in AIGUI_PLUGIN_DIR, else under the config home", () => {
    expect(customPluginDir({ AIGUI_PLUGIN_DIR: "/x" })).toBe("/x")
    expect(customPluginDir({ XDG_CONFIG_HOME: "/cfg" })).toBe("/cfg/aigui/plugins")
  })
})
