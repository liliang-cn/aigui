import { describe, expect, it } from "vitest"
import { buildSystemPrompt } from "@ai-gui/core"
import { highlight, highlightPromptSpec } from "./index"

describe("highlightPromptSpec", () => {
  it("asks the model to tag every fence with its language", () => {
    expect(highlightPromptSpec()).toContain("```ts")
  })
  it("lists the grammars that were loaded", () => {
    expect(highlightPromptSpec(undefined, ["ts", "python"])).toContain("(ts, python)")
  })
  it("is written in the locale the product answers in", () => {
    expect(highlightPromptSpec("zh-CN")).toContain("围栏代码块")
  })
  it("is what the plugin hands buildSystemPrompt, naming its own grammars", () => {
    // A highlighter can only colour a block whose language it was told, and a model left to itself
    // opens a bare fence often enough that the plugin does nothing for the answer.
    const prompt = buildSystemPrompt({ plugins: [highlight({ langs: ["ts", "rust"] })] })
    expect(prompt).toContain("(ts, rust)")
  })
})
