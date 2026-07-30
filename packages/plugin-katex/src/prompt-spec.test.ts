import { describe, expect, it } from "vitest"
import { buildSystemPrompt } from "@ai-gui/core"
import { katex, katexPromptSpec } from "./index"

describe("katexPromptSpec", () => {
  it("tells the model how to write maths", () => {
    const spec = katexPromptSpec()
    expect(spec).toContain("$...$")
    expect(spec).toContain("$$...$$")
    expect(spec).toContain("\\$")
  })
  it("mentions mhchem only when the extension is loaded", () => {
    expect(katexPromptSpec()).not.toContain("\\ce{")
    expect(katexPromptSpec(undefined, { chemistry: true })).toContain("\\ce{2H2 + O2 -> 2H2O}")
  })
  it("is written in the locale the product answers in", () => {
    expect(katexPromptSpec("zh-CN")).toContain("数学公式")
    expect(katexPromptSpec("zh-CN", { chemistry: true })).toContain("化学")
    // A locale nobody translated still gets a usable spec.
    expect(katexPromptSpec("de")).toContain("$$...$$")
  })
  it("is what the plugin hands buildSystemPrompt", () => {
    // Without this the model has no reason to write TeX, and a product that installed the plugin
    // renders nothing it could not have rendered without it.
    const prompt = buildSystemPrompt({ base: "You are a tutor.", plugins: [katex()] })
    expect(prompt).toContain("You are a tutor.")
    expect(prompt).toContain("$$...$$")
  })
  it("carries the chemistry rules through the plugin", () => {
    expect(buildSystemPrompt({ plugins: [katex({ chemistry: true })], locale: "zh-CN" })).toContain("mhchem")
  })
})
