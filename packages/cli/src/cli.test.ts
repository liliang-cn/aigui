import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { buildSystemPrompt } from "@ai-gui/core"
import { graph } from "@ai-gui/plugin-graph"
import { run, type CliIO } from "./cli"
import { pluginNames } from "./catalog"

interface Captured {
  io: CliIO
  out: string[]
  err: string[]
  files: Map<string, string>
}

const capture = (): Captured => {
  const out: string[] = []
  const err: string[] = []
  const files = new Map<string, string>()
  return {
    out,
    err,
    files,
    io: {
      stdout: (text) => out.push(text),
      stderr: (text) => err.push(text),
      readFile: (path) => readFile(path, "utf8"),
      writeFile: async (path, text) => {
        files.set(path, text)
      },
    },
  }
}

describe("aigui prompt", () => {
  it("writes the prompt for the named plugins to stdout, and nothing to stderr", async () => {
    const c = capture()
    expect(await run(["prompt", "--plugins", "graph", "--locale", "zh-CN"], c.io)).toBe(0)
    expect(c.err).toEqual([])
    expect(c.out.join("")).toBe(`${buildSystemPrompt({ plugins: [graph()], locale: "zh-CN" })}\n`)
  })

  it("writes JSON with the fields a backend wants when asked", async () => {
    const c = capture()
    expect(await run(["prompt", "-p", "graph,katex", "--json"], c.io)).toBe(0)
    const parsed = JSON.parse(c.out.join(""))
    expect(parsed.plugins).toEqual(["graph", "katex"])
    expect(parsed.cards).toEqual([])
    expect(parsed.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(parsed.prompt).toContain("```graph")
  })

  it("writes to a file with --out and says nothing on stdout", async () => {
    const c = capture()
    expect(await run(["prompt", "-p", "graph", "-o", "/tmp/prompt.txt"], c.io)).toBe(0)
    expect(c.out).toEqual([])
    expect(c.files.get("/tmp/prompt.txt")).toContain("```graph")
  })

  it("reads a config file and lets flags override it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aigui-cli-"))
    await writeFile(join(dir, "persona.md"), "Be terse.")
    await writeFile(join(dir, "cards.json"), JSON.stringify([{ type: "weather", description: "Weather" }]))
    await writeFile(join(dir, "aigui.prompt.json"), JSON.stringify({ baseFile: "persona.md", locale: "en", plugins: { katex: { chemistry: true } } }))
    const c = capture()
    expect(await run(["prompt", "--config", join(dir, "aigui.prompt.json"), "--locale", "zh-CN", "--cards", join(dir, "cards.json"), "--json"], c.io)).toBe(0)
    const parsed = JSON.parse(c.out.join(""))
    expect(parsed.locale).toBe("zh-CN")
    expect(parsed.plugins).toEqual(["katex"])
    expect(parsed.cards).toEqual(["weather"])
    expect(parsed.prompt.startsWith("Be terse.")).toBe(true)
    expect(parsed.prompt).toContain("weather")
  })

  it("lists every plugin with its package and fence", async () => {
    const c = capture()
    expect(await run(["prompt", "--list"], c.io)).toBe(0)
    const text = c.out.join("")
    for (const name of pluginNames()) expect(text).toContain(`${name} `)
    expect(text).toContain("@ai-gui/plugin-graph")
    expect(text).toContain("chemistry")
  })

  it("refuses an unknown plugin with exit 1, names it on stderr, and writes no prompt", async () => {
    const c = capture()
    expect(await run(["prompt", "--plugins", "graph,nope"], c.io)).toBe(1)
    expect(c.out).toEqual([])
    expect(c.err.join("")).toContain('unknown plugin "nope"')
  })

  it("refuses a missing or broken config file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aigui-cli-"))
    await writeFile(join(dir, "bad.json"), "{")
    const c = capture()
    expect(await run(["prompt", "-c", join(dir, "bad.json")], c.io)).toBe(1)
    expect(c.err.join("")).toContain("bad.json is not valid JSON")
    expect(await run(["prompt", "-c", join(dir, "missing.json")], c.io)).toBe(1)
    expect(c.err.join("")).toContain("missing.json could not be read")
  })

  it("refuses an unknown flag or command with the usage on stderr", async () => {
    const c = capture()
    expect(await run(["prompt", "--plugin", "graph"], c.io)).toBe(1)
    expect(c.err.join("")).toContain("Usage: aigui prompt")
    expect(await run(["render"], c.io)).toBe(1)
    expect(c.err.join("")).toContain('Unknown command "render"')
    expect(await run([], c.io)).toBe(1)
    expect(c.out).toEqual([])
  })

  it("prints help and version", async () => {
    const c = capture()
    expect(await run(["--help"], c.io)).toBe(0)
    expect(c.out.join("")).toContain("--plugins")
    expect(await run(["-v"], c.io)).toBe(0)
    expect(c.out.at(-1)).toMatch(/^\d+\.\d+\.\d+/)
  })
})
