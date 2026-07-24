// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

describe("node import safety", () => {
  it("imports without browser globals and without loading chemistry renderers", async () => {
    vi.resetModules()
    const mod = await import("./index")
    expect(typeof mod.molecule).toBe("function")
    expect(typeof mod.parseMoleculeDefinition).toBe("function")
  })
})
