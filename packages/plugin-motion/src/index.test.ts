import { readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { buildSystemPrompt, collectNodeRenderers, type ASTNode, type RenderOutput } from "@ai-gui/core"
import { conclusionText, motion, motionPromptSpec, parseMotion } from "./index"

const draw = (content: string, context?: { theme?: string; locale?: string }): RenderOutput =>
  collectNodeRenderers([motion()]).motion({ key: "0:0", type: "motion", content, complete: true } as ASTNode, context) as RenderOutput

const reason = (value: unknown): string => {
  const result = parseMotion(typeof value === "string" ? value : JSON.stringify(value))
  if (result.ok) throw new Error("expected the definition to be rejected")
  return result.error.message
}

const SHOT = JSON.stringify({ motion: "projectile", speed: 20, angle: 30, show: ["trajectory", "strobe", "vectors"] })

describe("the motion plugin", () => {
  it("claims the motion fence", () => {
    expect(Object.keys(collectNodeRenderers([motion()]))).toEqual(["motion"])
  })
  it("renders an SVG with no library to load", () => {
    const output = draw(SHOT)
    if (output.kind === "html") {
      expect(output.html).toContain("<svg")
      expect(output.html).toContain("polyline")
      expect(output.html).toContain("data-aigui-motion-result")
    }
  })
  it("is a pure function of the definition", () => {
    expect((draw(SHOT) as { html: string }).html).toBe((draw(SHOT) as { html: string }).html)
  })
  it("says why a figure could not be drawn", () => {
    const output = draw(JSON.stringify({ motion: "projectile", speed: 20, angle: 120 }))
    if (output.kind === "html") {
      expect(output.html).toContain("data-aigui-motion-error")
      expect(output.html).toContain("between 0 and 90")
    }
  })
  it("never puts the model's text into the page as markup", () => {
    const output = draw(JSON.stringify({ motion: "free-fall", height: 45, caption: "<img src=x onerror=alert(1)>" }))
    if (output.kind === "html") {
      expect(output.html).not.toContain("<img")
      expect(output.html).toContain("&lt;img")
    }
  })
})

describe("the result the plugin writes for itself", () => {
  it("states the numbers a question asks for", () => {
    const text = conclusionText({ motion: "projectile", speed: 20, angle: 30 }, "zh-CN")
    expect(text).toContain("射程 35.35")
    expect(text).toContain("最大高度")
    expect(text).toContain("飞行时间")
  })
  it("reports the velocities after a collision, and whether energy survived it", () => {
    const elastic = conclusionText({ motion: "collision", kind: "elastic", bodies: [{ mass: 1, speed: 2 }, { mass: 1, speed: -2 }] }, "zh-CN")
    expect(elastic).toContain("碰后 -2 m/s / 2 m/s")
    expect(elastic).not.toContain("动能不守恒")

    const stuck = conclusionText({ motion: "collision", kind: "inelastic", bodies: [{ mass: 3, speed: 4 }, { mass: 2, speed: 0 }] }, "zh-CN")
    expect(stuck).toContain("2.4 m/s / 2.4 m/s")
    expect(stuck).toContain("动能不守恒")
  })
  it("contradicts a caption that claims otherwise, in place", () => {
    const output = draw(JSON.stringify({
      motion: "projectile", speed: 20, angle: 30, caption: "射程约为 50 m",
    }), { locale: "zh-CN" })
    if (output.kind === "html") {
      expect(output.html).toContain("射程 35.35")
      expect(output.html).toContain("射程约为 50 m")
    }
  })
  it("falls back to English for a locale it does not ship", () => {
    expect(conclusionText({ motion: "free-fall", height: 45 }, "de")).toContain("time to fall")
  })
})

describe("what the protocol refuses", () => {
  it("refuses the result being stated", () => {
    expect(reason({ motion: "projectile", speed: 20, angle: 30, range: 35.4 })).toContain("not the result")
    expect(reason({ motion: "collision", kind: "elastic", bodies: [{ mass: 1, speed: 1 }, { mass: 1, speed: 0 }], velocityAfter: [0, 1] }))
      .toContain("not the result")
  })
  it("refuses a field belonging to another kind of motion", () => {
    expect(reason({ motion: "free-fall", height: 45, angle: 30 })).toContain("no field angle")
  })
  it("refuses a missing condition", () => {
    expect(reason({ motion: "projectile", speed: 20 })).toContain("needs angle")
    expect(reason({ motion: "collision", bodies: [{ mass: 1, speed: 1 }, { mass: 1, speed: 0 }] })).toContain("needs kind")
  })
  it("refuses impossible conditions", () => {
    expect(reason({ motion: "projectile", speed: -5, angle: 30 })).toContain("positive")
    expect(reason({ motion: "shm", amplitude: 0.1, period: 0 })).toContain("period must be positive")
    expect(reason({ motion: "collision", kind: "elastic", bodies: [{ mass: 0, speed: 1 }, { mass: 1, speed: 0 }] })).toContain("positive")
  })
  it("returns a rejection rather than throwing, whatever the bodies look like", () => {
    // A throw here would escape the parser and reach the renderer as a crash.
    for (const bodies of [[{ mass: "heavy", speed: 1 }, { mass: 1, speed: 0 }], [null, null], [{ mass: 1 }, { mass: 1, speed: 0 }]]) {
      const result = parseMotion(JSON.stringify({ motion: "collision", kind: "elastic", bodies }))
      expect(result.ok).toBe(false)
    }
  })
  it("allows a negative acceleration, which is braking", () => {
    expect(parseMotion(JSON.stringify({ motion: "uniform-acceleration", speed: 20, acceleration: -4, duration: 5 })).ok).toBe(true)
  })
})

describe("motionPromptSpec", () => {
  it("carries the conventions the probe measured", () => {
    const spec = motionPromptSpec("zh-CN")
    expect(spec).toContain("只给初始条件")
    expect(spec).toContain("9.8")
  })
  it("is what the plugin hands buildSystemPrompt", () => {
    expect(buildSystemPrompt({ plugins: [motion()], locale: "zh-CN" })).toContain("运动图")
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
    const result = parseMotion(source)
    if (!result.ok) throw new Error(`${name}: ${result.error.message}`)
    const output = draw(source, { locale: "zh-CN" })
    if (output.kind === "html") {
      expect(output.html).toContain("<svg")
      expect(output.html).not.toContain("data-aigui-motion-error")
    }
  })
})
