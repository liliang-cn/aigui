import { describe, expect, it } from "vitest"
import { buildSystemPrompt } from "./build-system-prompt"
import type { AIGuiPlugin } from "./types"

const localized: AIGuiPlugin = {
  name: "localized",
  promptSpec: (locale) => (locale === "zh-CN" ? "用中文写的规则" : "Rules in English"),
}
const englishOnly: AIGuiPlugin = { name: "english-only", promptSpec: () => "Only English" }
const literal: AIGuiPlugin = { name: "literal", promptSpec: "A plain string spec" }

describe("buildSystemPrompt locale", () => {
  it("passes the locale to a plugin that speaks it", () => {
    expect(buildSystemPrompt({ plugins: [localized], locale: "zh-CN" })).toBe("用中文写的规则")
  })

  it("is English by default", () => {
    expect(buildSystemPrompt({ plugins: [localized] })).toBe("Rules in English")
  })

  it("leaves plugins that ignore the argument untouched", () => {
    // A plugin written before locales existed takes a parameter it never reads.
    expect(buildSystemPrompt({ plugins: [englishOnly], locale: "zh-CN" })).toBe("Only English")
  })

  it("still supports a plain string promptSpec", () => {
    expect(buildSystemPrompt({ plugins: [literal], locale: "zh-CN" })).toBe("A plain string spec")
  })

  it("keeps the base and every plugin, in order", () => {
    const prompt = buildSystemPrompt({ base: "You are a helper.", plugins: [localized, literal], locale: "zh-CN" })
    expect(prompt).toBe("You are a helper.\n\n用中文写的规则\n\nA plain string spec")
  })
})
