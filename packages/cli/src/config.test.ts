import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { ConfigError, applyFlags, readConfig, validateConfig } from "./config"

const valid = (raw: unknown) => validateConfig(raw, { dir: "/nowhere", readText: () => "" })
const invalid = (raw: unknown) => {
  try {
    valid(raw)
  } catch (error) {
    if (error instanceof ConfigError) return error.message
    throw error
  }
  throw new Error("expected the config to be refused")
}

describe("validateConfig", () => {
  it("accepts an empty config", () => {
    expect(valid({})).toEqual({ plugins: [], cards: [], actions: [] })
  })

  it("takes plugins as a list of names, each with no options", () => {
    expect(valid({ plugins: ["katex", "graph"] }).plugins).toEqual([
      { name: "katex", options: {} },
      { name: "graph", options: {} },
    ])
  })

  it("takes plugins as an object of name to options, in the order written", () => {
    expect(valid({ plugins: { graph: { height: 300 }, katex: { chemistry: true } } }).plugins).toEqual([
      { name: "graph", options: { height: 300 } },
      { name: "katex", options: { chemistry: true } },
    ])
  })

  it("refuses a plugin it does not know, and says which ones it does", () => {
    const message = invalid({ plugins: ["katex", "kaTeX"] })
    expect(message).toContain('unknown plugin "kaTeX"')
    expect(message).toContain("katex")
    expect(message).toContain("mermaid")
    expect(invalid({ plugins: { graph: "yes" } })).toContain("plugins.graph must be an object")
    expect(invalid({ plugins: 3 })).toContain("plugins must be")
  })

  it("keeps base and locale as strings", () => {
    expect(valid({ base: "You are…", locale: "zh-CN" })).toMatchObject({ base: "You are…", locale: "zh-CN" })
    expect(invalid({ base: 1 })).toContain("base must be a string")
    expect(invalid({ locale: [] })).toContain("locale must be a string")
  })

  it("reads baseFile relative to the config's own directory", () => {
    const seen: string[] = []
    const config = validateConfig({ baseFile: "persona.md" }, {
      dir: "/etc/app",
      readText: (path) => {
        seen.push(path)
        return "persona text"
      },
    })
    expect(seen).toEqual([join("/etc/app", "persona.md")])
    expect(config.base).toBe("persona text")
    expect(invalid({ base: "a", baseFile: "b" })).toContain("base and baseFile")
  })

  it("takes cards with the prompt-facing fields only", () => {
    const config = valid({ cards: [{ type: "weather", description: "Weather", schema: { type: "object" }, example: { c: 1 } }] })
    expect(config.cards).toEqual([{ type: "weather", description: "Weather", schema: { type: "object" }, example: { c: 1 } }])
    expect(invalid({ cards: [{ description: "x" }] })).toContain("cards[0].type")
    expect(invalid({ cards: [{ type: "a" }] })).toContain("cards[0].description")
    expect(invalid({ cards: [{ type: "a", description: "d", render: 1 }] })).toContain("cards[0].render is not a field")
    expect(invalid({ cards: {} })).toContain("cards must be an array")
  })

  it("takes actions with a type and an optional schema", () => {
    expect(valid({ actions: [{ type: "plan.submit", schema: { type: "object" } }] }).actions).toEqual([{ type: "plan.submit", schema: { type: "object" } }])
    expect(invalid({ actions: [{}] })).toContain("actions[0].type")
    expect(invalid({ actions: [{ type: "a", run: 1 }] })).toContain("actions[0].run is not a field")
  })

  it("names a field it does not know", () => {
    expect(invalid({ plugin: ["katex"] })).toContain("plugin is not a field")
    expect(invalid([])).toContain("must be a JSON object")
  })
})

describe("readConfig", () => {
  it("parses a file and resolves baseFile beside it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aigui-cli-"))
    await writeFile(join(dir, "persona.md"), "Be terse.")
    await writeFile(join(dir, "aigui.prompt.json"), JSON.stringify({ baseFile: "persona.md", plugins: ["graph"] }))
    const config = await readConfig(join(dir, "aigui.prompt.json"))
    expect(config.base).toBe("Be terse.")
    expect(config.plugins).toEqual([{ name: "graph", options: {} }])
  })

  it("says which file is not JSON, and which is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aigui-cli-"))
    await writeFile(join(dir, "bad.json"), "{")
    await expect(readConfig(join(dir, "bad.json"))).rejects.toThrow(/bad\.json is not valid JSON/)
    await expect(readConfig(join(dir, "none.json"))).rejects.toThrow(/none\.json/)
  })
})

describe("applyFlags", () => {
  const base = valid({ base: "from config", locale: "en", plugins: { katex: { chemistry: true } } })
  it("replaces the plugin list, with default options, when --plugins is given", () => {
    expect(applyFlags(base, { plugins: ["graph", "mermaid"] }).plugins).toEqual([
      { name: "graph", options: {} },
      { name: "mermaid", options: {} },
    ])
  })
  it("overrides locale and base, and leaves what was not given", () => {
    const merged = applyFlags(base, { locale: "zh-CN", base: "from flag" })
    expect(merged).toMatchObject({ locale: "zh-CN", base: "from flag" })
    expect(merged.plugins).toEqual(base.plugins)
    expect(applyFlags(base, {})).toEqual(base)
  })
  it("refuses an unknown plugin name from the flag too", () => {
    expect(() => applyFlags(base, { plugins: ["nope"] })).toThrow(/unknown plugin "nope"/)
  })
  it("adds cards from a flag file's contents", () => {
    const merged = applyFlags(base, { cards: [{ type: "weather", description: "Weather" }] })
    expect(merged.cards).toEqual([{ type: "weather", description: "Weather" }])
  })
})
