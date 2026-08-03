import { describe, expect, it } from "vitest"
import { buildSystemPrompt, collectNodeRenderers, type ASTNode, type RenderOutput } from "@ai-gui/core"
import { solid, solidPromptSpec } from "./index"

const renderNode = (content: string, complete = true): Promise<RenderOutput> =>
  collectNodeRenderers([solid()]).solid({ key: "0:0", type: "solid", content, complete } as ASTNode) as Promise<RenderOutput>

const CUBE = JSON.stringify({ solid: "cube", label: "ABCD-A1B1C1D1", edge: 2, section: { through: ["A", "B1", "D1"] } })

describe("the solid plugin", () => {
  it("claims the solid fence", () => {
    expect(Object.keys(collectNodeRenderers([solid()]))).toEqual(["solid"])
  })
  it("mounts a figure for a valid definition", async () => {
    const output = await renderNode(CUBE)
    expect(output.kind).toBe("mount")
  })
  it("shows a skeleton while the fence is still streaming", async () => {
    const output = await renderNode('{"solid":"cube"', false)
    expect(output.kind).toBe("html")
    if (output.kind === "html") expect(output.html).toContain("data-aigui-solid-loading")
  })
  it("says why a figure could not be drawn rather than showing a blank box", async () => {
    const output = await renderNode(JSON.stringify({ solid: "cone", label: "P-O", radius: 1, height: 2, highlight: [{ plane: ["P", "A", "B"] }] }))
    expect(output.kind).toBe("html")
    if (output.kind === "html") {
      expect(output.html).toContain("data-aigui-solid-error")
      expect(output.html).toContain("refers to A")
    }
  })
  it("refuses a label that names no vertices instead of mounting an empty figure", async () => {
    const output = await renderNode(JSON.stringify({ solid: "cube", label: "<img src=x onerror=alert(1)>", edge: 2 }))
    expect(output.kind).toBe("html")
    if (output.kind === "html") {
      expect(output.html).toContain("data-aigui-solid-error")
      // Whatever the model wrote, what reaches the page is this plugin's own text, escaped.
      expect(output.html).not.toContain("<img")
    }
  })
  it("refuses a label with too few vertices for the solid", async () => {
    const output = await renderNode(JSON.stringify({ solid: "pyramid", label: "P-ABC", base: 4, edge: 2, height: 3 }))
    expect(output.kind).toBe("html")
    if (output.kind === "html") expect(output.html).toContain("needs 5")
  })
})

describe("isBlockComplete", () => {
  const complete = solid().isBlockComplete!
  it("waits for the whole JSON object", () => {
    expect(complete("solid", '{"solid":"cube"')).toBe(false)
    expect(complete("solid", '{"solid":"cube","label":"ABCD-A1B1C1D1","edge":2}')).toBe(true)
  })
  it("waits through a half-written nested value", () => {
    // Without this the reader watches a cube redraw as each field lands.
    expect(complete("solid", '{"solid":"cube","section":{"through":["A","B1"')).toBe(false)
  })
})

describe("solidPromptSpec", () => {
  it("carries the two rules the probe showed the model needs", () => {
    const spec = solidPromptSpec("zh-CN")
    expect(spec).toContain("不要自己算")
    // `highlight` drifted to a bare object the moment no example demonstrated it.
    expect(spec).toContain("是一个数组")
    expect(spec).toContain("apexOver")
    expect(spec).toContain("onCircle")
  })
  it("shows every rule in a worked example, because that is what a model copies", () => {
    const spec = solidPromptSpec("zh-CN")
    for (const shown of ['"highlight": [{ "plane"', '"apexOver"', '"onCircle": "base"']) {
      expect(spec).toContain(shown.slice(0, 12))
    }
    expect(spec.match(/```solid\n\{/g) ?? []).toHaveLength(3)
  })
  it("falls back to English for a locale it does not ship", () => {
    expect(solidPromptSpec("de")).toContain("State conditions only")
  })
  it("is what the plugin hands buildSystemPrompt", () => {
    const prompt = buildSystemPrompt({ base: "你是数学老师。", plugins: [solid()], locale: "zh-CN" })
    expect(prompt).toContain("你是数学老师。")
    expect(prompt).toContain("立体几何图形")
  })
})
