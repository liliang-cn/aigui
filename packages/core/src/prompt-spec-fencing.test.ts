import { describe, expect, it } from "vitest"
import { buildSystemPrompt, fencingRule } from "./build-system-prompt"
import type { AIGuiPlugin } from "./types"

/**
 * A spec that shows a block on one line teaches the model to write one.
 *
 * This is not hypothetical: `` ```list {"items":[…]} ``` `` shipped in the
 * primitives spec, a model copied it exactly, and the answer rendered as raw
 * JSON in the middle of a sentence — because a fence's info string may not
 * contain backticks, so CommonMark parses that line as inline code.
 *
 * The examples are the specification as far as a model is concerned, so they
 * are tested like one.
 */
const ONE_LINE_FENCE = /^[ \t]*```[A-Za-z][\w-]*[ \t]+\S.*?```/m

describe("prompt specs teach a shape that parses", () => {
  it("recognises the shape it is looking for", () => {
    expect(ONE_LINE_FENCE.test('```list {"items":[1]}```')).toBe(true)
    expect(ONE_LINE_FENCE.test('```list\n{"items":[1]}\n```')).toBe(false)
    // A fence with only a language on the line is how every block starts.
    expect(ONE_LINE_FENCE.test("```chart\n{}\n```")).toBe(false)
  })

  it("states the rule before the blocks that need it", () => {
    const plugin: AIGuiPlugin = { name: "p", promptSpec: "```list\n{}\n```" }
    const prompt = buildSystemPrompt({ plugins: [plugin] })
    expect(prompt).toContain(fencingRule())
    expect(prompt.indexOf(fencingRule())).toBeLessThan(prompt.indexOf("```list"))
  })

  it("keeps the base prompt first — it is the host's own persona", () => {
    const plugin: AIGuiPlugin = { name: "p", promptSpec: "spec" }
    const prompt = buildSystemPrompt({ base: "You are Leo.", plugins: [plugin] })
    expect(prompt.startsWith("You are Leo.")).toBe(true)
  })

  it("says nothing about fencing when there is no block to fence", () => {
    expect(buildSystemPrompt({ base: "You are Leo." })).toBe("You are Leo.")
    expect(buildSystemPrompt()).toBe("")
  })

  it("answers in the host's language", () => {
    expect(fencingRule("zh-CN")).toContain("行内代码")
    expect(fencingRule()).toContain("inline code")
    // Only zh-CN is translated; "zh" is a different tag and falls back, which
    // is resolveMessages' documented direction (region -> language -> English).
    expect(fencingRule("zh")).toContain("inline code")
    // A locale nobody translated still gets the rule, in English.
    expect(fencingRule("pt-BR")).toContain("inline code")
  })
})
