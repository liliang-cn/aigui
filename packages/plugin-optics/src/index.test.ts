import { readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { buildSystemPrompt, collectNodeRenderers, type ASTNode, type RenderOutput } from "@ai-gui/core"
import { conclusionText, optics, opticsPromptSpec, parseOptics } from "./index"

const draw = (content: string, context?: { theme?: string; locale?: string }): RenderOutput =>
  collectNodeRenderers([optics()]).optics({ key: "0:0", type: "optics", content, complete: true } as ASTNode, context) as RenderOutput

const reason = (value: unknown): string => {
  const result = parseOptics(typeof value === "string" ? value : JSON.stringify(value))
  if (result.ok) throw new Error("expected the definition to be rejected")
  return result.error.message
}

const LENS = JSON.stringify({ element: "convex-lens", focal: 10, object: { distance: 30, height: 4 } })

describe("the optics plugin", () => {
  it("claims the optics fence", () => {
    expect(Object.keys(collectNodeRenderers([optics()]))).toEqual(["optics"])
  })
  it("renders an SVG with no library to load", () => {
    const output = draw(LENS)
    if (output.kind === "html") {
      expect(output.html).toContain("<svg")
      expect(output.html).toContain("polyline")
    }
  })
  it("is a pure function of the definition", () => {
    expect((draw(LENS) as { html: string }).html).toBe((draw(LENS) as { html: string }).html)
  })
  it("says why a figure could not be drawn", () => {
    const output = draw(JSON.stringify({ element: "concave-lens", focal: 12, object: { distance: 18, height: 4 } }))
    if (output.kind === "html") {
      expect(output.html).toContain("data-aigui-optics-error")
      expect(output.html).toContain("diverges")
    }
  })
})

describe("the conclusion the plugin writes for itself", () => {
  it("states what the computed image actually is", () => {
    expect(conclusionText({ element: "convex-lens", focal: 10, object: { distance: 30, height: 4 } }, "zh-CN"))
      .toContain("倒立、缩小、实像")
    expect(conclusionText({ element: "convex-lens", focal: 10, object: { distance: 6, height: 3 } }, "zh-CN"))
      .toContain("正立、放大、虚像")
    expect(conclusionText({ element: "convex-mirror", focal: -10, object: { distance: 20, height: 4 } }, "zh-CN"))
      .toContain("正立、缩小、虚像")
  })
  it("appears in the figure even when the caption claims the opposite", () => {
    // A model that writes 倒立缩小实像 for a magnifying glass is stating the thing a reader takes
    // away. Generated from the same numbers as the rays, the conclusion contradicts it in place.
    const output = draw(JSON.stringify({
      element: "convex-lens", focal: 10, object: { distance: 6, height: 3 },
      caption: "凸透镜成倒立缩小实像",
    }), { locale: "zh-CN" })
    if (output.kind === "html") {
      expect(output.html).toContain("正立、放大、虚像")
      expect(output.html).toContain("凸透镜成倒立缩小实像")
    }
  })
  it("reports total internal reflection with its critical angle", () => {
    const text = conclusionText({ element: "interface", media: [1.5, 1], incidence: 50 }, "zh-CN")
    expect(text).toContain("全反射")
    expect(text).toContain("41.81")
  })
  it("reports a refraction angle otherwise", () => {
    expect(conclusionText({ element: "interface", media: [1, 1.5], incidence: 45 }, "zh-CN")).toContain("28.13")
  })
  it("falls back to English for a locale it does not ship", () => {
    expect(conclusionText({ element: "convex-lens", focal: 10, object: { distance: 30, height: 4 } }, "de"))
      .toContain("inverted")
  })
})

describe("what the protocol refuses", () => {
  it("refuses a diverging element written with a positive focal length", () => {
    // The likeliest slip, because a question quotes the focal length as a magnitude — and drawn
    // with a positive f a concave lens converges, which is the opposite figure.
    expect(reason({ element: "concave-lens", focal: 12, object: { distance: 18, height: 4 } })).toContain("negative")
    expect(reason({ element: "convex-mirror", focal: 10, object: { distance: 20, height: 4 } })).toContain("negative")
  })
  it("refuses a converging element written with a negative focal length", () => {
    expect(reason({ element: "convex-lens", focal: -10, object: { distance: 30, height: 4 } })).toContain("positive")
  })
  it("refuses the result being stated in a field", () => {
    expect(reason({ element: "convex-lens", focal: 10, object: { distance: 30, height: 4 }, imageDistance: 15 }))
      .toContain("not the result")
    expect(reason({ element: "convex-lens", focal: 10, object: { distance: 30, height: 4 }, magnification: -0.5 }))
      .toContain("not the result")
  })
  it("refuses a focal length on a plane mirror, and an object on an interface", () => {
    expect(reason({ element: "plane-mirror", focal: 5, object: { distance: 8, height: 5 } })).toContain("no focal length")
    expect(reason({ element: "interface", media: [1, 1.5], incidence: 30, object: { distance: 1, height: 1 } }))
      .toContain("no focal length or object")
  })
  it("refuses an impossible incidence angle or refractive index", () => {
    expect(reason({ element: "interface", media: [1, 1.5], incidence: 90 })).toContain("0 to 89")
    expect(reason({ element: "interface", media: [0, 1.5], incidence: 30 })).toContain("positive")
  })
  it("refuses a negative object distance", () => {
    expect(reason({ element: "convex-lens", focal: 10, object: { distance: -30, height: 4 } })).toContain("positive")
  })
})

describe("opticsPromptSpec", () => {
  it("carries the sign convention, which is the rule most likely to be missed", () => {
    const spec = opticsPromptSpec("zh-CN")
    expect(spec).toContain("负数")
    expect(spec).toContain("只给条件")
  })
  it("is what the plugin hands buildSystemPrompt", () => {
    expect(buildSystemPrompt({ plugins: [optics()], locale: "zh-CN" })).toContain("光路图")
  })
})

/** The figures a model produced when given this plugin's own prompt spec. */
describe("the model's own figures", () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures")
  const fixtures = readdirSync(dir).filter((n) => n.endsWith(".json")).sort()

  it("has the probe run to check against", () => {
    expect(fixtures.length).toBe(18)
  })
  it.each(fixtures)("%s parses and renders", (name) => {
    const source = readFileSync(join(dir, name), "utf8")
    const result = parseOptics(source)
    if (!result.ok) throw new Error(`${name}: ${result.error.message}`)
    const output = draw(source, { locale: "zh-CN" })
    if (output.kind === "html") {
      expect(output.html).toContain("<svg")
      expect(output.html).not.toContain("data-aigui-optics-error")
      expect(output.html).toContain("data-aigui-optics-conclusion")
    }
  })
})
