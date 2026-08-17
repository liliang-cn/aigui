import { describe, expect, it } from "vitest"
import { DEFAULT_KINDS, DEFAULT_WIDTH } from "./index"

describe("@ai-gui/image", () => {
  it("exports the defaults the OpenClaw plugin relies on", () => {
    expect(DEFAULT_KINDS).toContain("chart")
    expect(DEFAULT_WIDTH).toBe(720)
  })
})
