import { describe, expect, it } from "vitest"
import { PROTOCOL_VERSION } from "./index"

describe("@ai-gui/live", () => {
  it("speaks protocol version 1", () => {
    expect(PROTOCOL_VERSION).toBe(1)
  })
})
