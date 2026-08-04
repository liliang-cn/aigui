import { readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { buildSystemPrompt, collectNodeRenderers, type ASTNode, type RenderOutput } from "@ai-gui/core"
import { fn, functionPromptSpec, parseFunction } from "./index"

const render = (content: string, complete = true): RenderOutput =>
  collectNodeRenderers([fn()]).function({ key: "0:0", type: "function", content, complete } as ASTNode) as RenderOutput

const CURVE = JSON.stringify({ plot: [{ id: "f", expr: "x^2", domain: [-2, 2] }], marks: [{ tangent: { of: "f", at: 1 } }] })
const reason = (value: unknown): string => {
  const result = parseFunction(typeof value === "string" ? value : JSON.stringify(value))
  if (result.ok) throw new Error("expected the definition to be rejected")
  return result.error.message
}

describe("the function plugin", () => {
  it("claims the function fence", () => {
    expect(Object.keys(collectNodeRenderers([fn()]))).toEqual(["function"])
  })
  it("renders an SVG with no library to load", () => {
    const output = render(CURVE)
    expect(output.kind).toBe("html")
    if (output.kind === "html") {
      expect(output.html).toContain("<svg")
      expect(output.html).toContain("polyline")
      expect(output.trusted).toBe(true)
    }
  })
  it("is a pure function of the definition, so it renders the same every time", () => {
    // No canvas, no timing, no randomness: the same fence gives byte-identical markup, which is
    // what lets it be server-rendered, exported and asserted on.
    expect((render(CURVE) as { html: string }).html).toBe((render(CURVE) as { html: string }).html)
  })
  it("draws for the page it is on", () => {
    const light = collectNodeRenderers([fn()]).function({ key: "0:0", type: "function", content: CURVE, complete: true } as ASTNode, { theme: "light" }) as RenderOutput
    const dark = collectNodeRenderers([fn()]).function({ key: "0:0", type: "function", content: CURVE, complete: true } as ASTNode, { theme: "dark" }) as RenderOutput
    if (light.kind === "html" && dark.kind === "html") expect(light.html).not.toBe(dark.html)
  })
  it("shows a skeleton while the fence is still streaming", () => {
    const output = render('{"plot":[{"id":"f"', false)
    if (output.kind === "html") expect(output.html).toContain("data-aigui-function-loading")
  })
  it("says why a figure could not be drawn", () => {
    const output = render(JSON.stringify({ plot: [{ id: "f", expr: "2x" }] }))
    if (output.kind === "html") {
      expect(output.html).toContain("data-aigui-function-error")
      expect(output.html).toContain("write 2*x")
    }
  })
  it("never puts the model's text into the page as markup", () => {
    const output = render(JSON.stringify({ plot: [{ id: "f", expr: "x", label: "<img src=x onerror=alert(1)>" }] }))
    if (output.kind === "html") {
      expect(output.html).not.toContain("<img")
      expect(output.html).toContain("&lt;img")
    }
  })
})

describe("what the protocol refuses", () => {
  it("refuses sampled points, which is the whole reason it exists", () => {
    expect(reason({ plot: [{ id: "f", expr: "x^2" }], points: [[0, 0], [1, 1]] })).toContain("not sampled points")
    expect(reason({ plot: [{ id: "f", expr: "x^2", data: [1, 2] }] })).toContain("not sampled points")
  })
  it("refuses a mark naming a curve no plot defines", () => {
    expect(reason({ plot: [{ id: "f", expr: "x" }], marks: [{ tangent: { of: "g", at: 1 } }] })).toContain("no plot defines")
  })
  it("refuses an expression it cannot evaluate", () => {
    expect(reason({ plot: [{ id: "f", expr: "sin x" }] })).toContain("brackets")
    expect(reason({ plot: [{ id: "f", expr: "sqrt(x)", domain: [-4, -1] }] })).toContain("finite")
  })
  it("refuses marks written as a bare object", () => {
    expect(reason({ plot: [{ id: "f", expr: "x" }], marks: { tangent: { of: "f", at: 1 } } })).toContain("must be an array")
  })
  it("refuses an invented field", () => {
    expect(reason({ plot: [{ id: "f", expr: "x" }], title: "hi" })).toContain("not a field")
  })
  it("accepts an interval written the way a question states it", () => {
    const result = parseFunction(JSON.stringify({ plot: [{ id: "f", expr: "sin(x)", domain: [0, "2*pi"] }] }))
    expect(result.ok).toBe(true)
  })
})

describe("functionPromptSpec", () => {
  it("carries the rules the probe showed the model needs", () => {
    const spec = functionPromptSpec("zh-CN")
    expect(spec).toContain("不要自己算")
    expect(spec).toContain("2*x")
    expect(spec).toContain("2*pi")
  })
  it("falls back to English for a locale it does not ship", () => {
    expect(functionPromptSpec("de")).toContain("never the result")
  })
  it("is what the plugin hands buildSystemPrompt", () => {
    expect(buildSystemPrompt({ plugins: [fn()], locale: "zh-CN" })).toContain("函数图像")
  })
})

/**
 * The figures a model actually produced, kept as fixtures.
 *
 * Twenty questions through `gemini-3.6-flash-high` given this plugin's own prompt spec. A protocol
 * change that these stop parsing is one that breaks answers already being written.
 */
describe("the model's own figures", () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures")
  const fixtures = readdirSync(dir).filter((name) => name.endsWith(".json")).sort()

  it("has the whole probe run to check against", () => {
    expect(fixtures.length).toBe(20)
  })
  it.each(fixtures)("%s parses", (name) => {
    const result = parseFunction(readFileSync(join(dir, name), "utf8"))
    if (!result.ok) throw new Error(`${name}: ${result.error.message}`)
    expect(result.value.plot.length).toBeGreaterThan(0)
  })
  it.each(fixtures)("%s renders to an SVG", (name) => {
    const output = render(readFileSync(join(dir, name), "utf8"))
    expect(output.kind).toBe("html")
    if (output.kind === "html") {
      expect(output.html).toContain("<svg")
      expect(output.html).not.toContain("data-aigui-function-error")
    }
  })
})
