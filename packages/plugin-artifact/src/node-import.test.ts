// @vitest-environment node
import { describe, expect, it } from "vitest"

describe("Node import safety", () => {
  it("imports without document or window globals", async () => {
    const module = await import("./index")
    expect(module.ArtifactStore).toBeTypeOf("function")
    expect(module.artifactCss).toContain("data-aigui-artifact-workspace")
  })
})
