import { describe, expect, it } from "vitest"
import { buildSystemPrompt, collectNodeRenderers, type ASTNode, type RenderOutput } from "@ai-gui/core"
import { conclusionText, gravity, gravityPromptSpec, parseGravity, renderGravitySVG, simulate } from "./index"

const renderNode = (content: string, complete = true, options?: Parameters<typeof gravity>[0], context?: { theme?: string; locale?: string }): RenderOutput =>
  collectNodeRenderers([gravity(options)]).gravity({ key: "0:0", type: "gravity", content, complete } as ASTNode, context as never) as RenderOutput

const EARTH = JSON.stringify({
  units: "astronomical",
  bodies: [{ id: "Sun", mass: 1 }, { id: "Earth", mass: 3e-6, orbit: { around: "Sun", distance: 1 } }],
  duration: 1,
  caption: "one year",
})

describe("the gravity plugin", () => {
  it("claims the gravity fence", () => {
    expect(Object.keys(collectNodeRenderers([gravity()]))).toEqual(["gravity"])
  })
  it("mounts an animated figure by default and a still when asked", () => {
    expect(renderNode(EARTH).kind).toBe("mount")
    const still = renderNode(EARTH, true, { animate: false })
    expect(still.kind).toBe("html")
    if (still.kind === "html") {
      expect(still.html).toContain("<svg")
      expect(still.html).toContain("data-gravity-body")
      expect(still.html).toContain("one year")
      expect(still.trusted).toBe(true)
    }
  })
  it("shows a skeleton while the fence is still streaming", () => {
    const output = renderNode('{"units":', false)
    expect(output.kind).toBe("html")
    if (output.kind === "html") expect(output.html).toContain("data-aigui-gravity-loading")
  })
  it("says why a figure could not be drawn, escaped", () => {
    const output = renderNode(JSON.stringify({ units: "astronomical", bodies: [{ id: "<b>", mass: 1, orbit: { around: "x", distance: 1 } }], duration: 1 }))
    expect(output.kind).toBe("html")
    if (output.kind === "html") {
      expect(output.html).toContain("data-aigui-gravity-error")
      expect(output.html).not.toContain("<b>")
    }
  })
})

describe("what is written under the figure", () => {
  const load = (source: string) => {
    const parsed = parseGravity(source)
    if (!parsed.ok) throw new Error(parsed.error.message)
    return { definition: parsed.value.definition, simulation: simulate(parsed.value.definition, parsed.value.initial) }
  }
  it("states the computed speed and period, in the unit system's units", () => {
    const { definition, simulation } = load(EARTH)
    const zh = conclusionText(definition, simulation, "zh-CN")
    expect(zh).toContain("Earth：轨道速度 6.28 AU/yr")
    expect(zh).toContain("周期 1 yr")
    expect(zh).toContain("能量漂移")
    const en = conclusionText(definition, simulation, "en")
    expect(en).toContain("orbital speed 6.28 AU/yr")
  })
  it("lists collisions with their time and outcome", () => {
    const { definition, simulation } = load(JSON.stringify({
      units: "toy",
      G: 0,
      collisions: "merge",
      bodies: [{ id: "A", mass: 2, radius: 0.5, position: [-2, 0], velocity: [1, 0] }, { id: "B", mass: 1, radius: 0.5, position: [2, 0], velocity: [-1, 0] }],
      duration: 4,
    }))
    const text = conclusionText(definition, simulation, "zh-CN")
    expect(text).toContain("A 与 B 相撞，合并为 A")
    expect(text).toContain("t = 1.5")
    // An inelastic merge is not supposed to conserve energy, so no drift figure is claimed.
    expect(text).not.toContain("能量漂移")
  })
  it("draws a trail per body that ends where a body merges away", () => {
    const { definition, simulation } = load(JSON.stringify({
      units: "toy",
      G: 0,
      collisions: "merge",
      bodies: [{ id: "A", mass: 2, radius: 0.5, position: [-2, 0], velocity: [1, 0] }, { id: "B", mass: 1, radius: 0.5, position: [2, 0], velocity: [-1, 0] }],
      duration: 4,
    }))
    const { svg, frames } = renderGravitySVG(definition, simulation, {}, "dark")
    expect(svg.match(/<polyline/g)).toHaveLength(2)
    expect(svg.match(/data-gravity-body=/g)).toHaveLength(1)
    expect(frames[frames.length - 1][1]).toBeNull()
  })
  it("puts a scale bar in the figure's units", () => {
    const { definition, simulation } = load(EARTH)
    expect(renderGravitySVG(definition, simulation).svg).toMatch(/>(0\.5|1|2) AU</)
  })
})

describe("isBlockComplete", () => {
  const complete = gravity().isBlockComplete!
  it("waits for the whole JSON object", () => {
    expect(complete("gravity", '{"units":"toy"')).toBe(false)
    expect(complete("gravity", '{"units":"toy","bodies":[],"duration":1}')).toBe(true)
  })
})

describe("gravityPromptSpec", () => {
  it("carries the rules the arithmetic depends on", () => {
    const spec = gravityPromptSpec("zh-CN")
    expect(spec).toContain("不要自己算结果")
    expect(spec).toContain('"orbit"')
    expect(spec).toContain('"astronomical"')
    expect(spec).toContain("用 motion 块")
  })
  it("shows orbit, eccentricity and a collision in worked examples, because that is what a model copies", () => {
    const spec = gravityPromptSpec("zh-CN")
    expect(spec.match(/```gravity\n\{/g) ?? []).toHaveLength(3)
    expect(spec).toContain('"eccentricity": 0.9')
    expect(spec).toContain('"collisions": "bounce"')
  })
  it("falls back to English for a locale it does not ship", () => {
    expect(gravityPromptSpec("de")).toContain("State conditions only")
  })
  it("is what the plugin hands buildSystemPrompt", () => {
    const prompt = buildSystemPrompt({ base: "你是物理老师。", plugins: [gravity()], locale: "zh-CN" })
    expect(prompt).toContain("引力与碰撞图")
  })
})
