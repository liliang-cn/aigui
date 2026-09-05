import { describe, expect, it } from "vitest"
import { ActionRegistry, CardRegistry, buildSystemPrompt, createActionRuntime } from "@ai-gui/core"
import { graph } from "@ai-gui/plugin-graph"
import { katex } from "@ai-gui/plugin-katex"
import { ui } from "@ai-gui/plugin-ui"
import { buildPrompt } from "./build"
import { validateConfig } from "./config"

const config = (raw: unknown) => validateConfig(raw, { dir: "/", readText: () => "" })

describe("buildPrompt", () => {
  it("is exactly what buildSystemPrompt gives the browser for the same inputs", async () => {
    const registry = new CardRegistry()
    registry.register({ type: "weather", description: "Weather summary", schema: { type: "object", properties: { city: { type: "string" } } }, example: { city: "Tokyo" } })
    const expected = buildSystemPrompt({ base: "You are terse.", registry, plugins: [katex({ chemistry: true }), graph()], locale: "zh-CN" })

    const built = await buildPrompt(
      config({
        base: "You are terse.",
        locale: "zh-CN",
        plugins: { katex: { chemistry: true }, graph: {} },
        cards: [{ type: "weather", description: "Weather summary", schema: { type: "object", properties: { city: { type: "string" } } }, example: { city: "Tokyo" } }],
      }),
    )
    expect(built.prompt).toBe(expected)
    expect(built).toMatchObject({ locale: "zh-CN", plugins: ["katex", "graph"], cards: ["weather"] })
  })

  it("lets the ui plugin see the cards and actions from the config", async () => {
    const registry = new CardRegistry()
    registry.register({ type: "summary", description: "A summary card" })
    const actions = new ActionRegistry()
    actions.register({ type: "search.run", schema: { type: "object" }, run: () => undefined })
    const expected = buildSystemPrompt({ registry, plugins: [ui({ registry, actionRuntime: createActionRuntime({ registry: actions }) })], locale: "en" })

    const built = await buildPrompt(
      config({
        locale: "en",
        plugins: ["ui"],
        cards: [{ type: "summary", description: "A summary card" }],
        actions: [{ type: "search.run", schema: { type: "object" } }],
      }),
    )
    expect(built.prompt).toBe(expected)
    expect(built.prompt).toContain("search.run")
  })

  it("is just the base when there is nothing else", async () => {
    const built = await buildPrompt(config({ base: "Only this." }))
    expect(built.prompt).toBe("Only this.")
    expect(built.plugins).toEqual([])
  })

  it("keeps the plugins in the order given", async () => {
    const a = await buildPrompt(config({ plugins: ["graph", "katex"] }))
    const b = await buildPrompt(config({ plugins: ["katex", "graph"] }))
    expect(a.prompt).not.toBe(b.prompt)
    expect(a.prompt.indexOf("```graph")).toBeLessThan(a.prompt.indexOf("$$"))
  })
})
