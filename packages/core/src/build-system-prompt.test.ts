import { describe, expect, it } from "vitest"
import { CardRegistry } from "./card-registry"
import { buildSystemPrompt } from "./build-system-prompt"
import type { AIGuiPlugin } from "./types"

describe("buildSystemPrompt", () => {
  it("includes a base and registered card specs", () => {
    const registry = new CardRegistry()
    registry.register({ type: "flight", description: "flight info" })
    const out = buildSystemPrompt({ base: "You are helpful.", registry })
    expect(out).toContain("You are helpful.")
    expect(out).toContain("card:flight")
  })
  it("includes plugin promptSpec chunks", () => {
    const plugin: AIGuiPlugin = { name: "x", promptSpec: "Fence ```x for widgets." }
    const out = buildSystemPrompt({ plugins: [plugin] })
    expect(out).toContain("Fence ```x for widgets.")
  })
  it("omits empty sections (no registry, no plugins)", () => {
    expect(buildSystemPrompt({ base: "Base only." })).toBe("Base only.")
  })
})
