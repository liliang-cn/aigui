import { describe, expect, it } from "vitest"
import { buildSystemPrompt, fencingRule } from "./build-system-prompt"
import type { AIGuiPlugin } from "./types"

/** What a host's own prompt gains, with the shared fencing rule taken back out. */
function specsOnly(prompt: string, locale?: string): string {
  return prompt.replace(`${fencingRule(locale)}\n\n`, "")
}

const localized: AIGuiPlugin = {
  name: "localized",
  promptSpec: (locale) => (locale === "zh-CN" ? "用中文写的规则" : "Rules in English"),
}
const englishOnly: AIGuiPlugin = { name: "english-only", promptSpec: () => "Only English" }
const literal: AIGuiPlugin = { name: "literal", promptSpec: "A plain string spec" }

describe("buildSystemPrompt locale", () => {
  it("passes the locale to a plugin that speaks it", () => {
    expect(specsOnly(buildSystemPrompt({ plugins: [localized], locale: "zh-CN" }), "zh-CN")).toBe("用中文写的规则")
  })

  it("is English by default", () => {
    expect(specsOnly(buildSystemPrompt({ plugins: [localized] }))).toBe("Rules in English")
  })

  it("leaves plugins that ignore the argument untouched", () => {
    // A plugin written before locales existed takes a parameter it never reads.
    expect(specsOnly(buildSystemPrompt({ plugins: [englishOnly], locale: "zh-CN" }), "zh-CN")).toBe("Only English")
  })

  it("still supports a plain string promptSpec", () => {
    expect(specsOnly(buildSystemPrompt({ plugins: [literal], locale: "zh-CN" }), "zh-CN")).toBe("A plain string spec")
  })

  it("keeps the base and every plugin, in order", () => {
    const prompt = buildSystemPrompt({ base: "You are a helper.", plugins: [localized, literal], locale: "zh-CN" })
    // The fencing rule sits between the host's persona and the specs it governs.
    expect(prompt).toBe(`You are a helper.\n\n${fencingRule("zh-CN")}\n\n用中文写的规则\n\nA plain string spec`)
  })
})
