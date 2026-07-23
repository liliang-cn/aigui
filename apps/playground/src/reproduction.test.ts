import { describe, expect, it } from "vitest"
import { exportReproduction, loadReproduction } from "./reproduction"

describe("playground reproduction", () => {
  it("round trips a reproduction", () => {
    const input = { adapter: "vue" as const, markdown: "# Hello", chunkSize: 3, delayMs: 12 }
    expect(loadReproduction(exportReproduction(input))).toEqual({ version: 1, ...input })
  })

  it("rejects invalid input", () => {
    expect(() => loadReproduction('{"version":1,"adapter":"unknown"}')).toThrow(/invalid/i)
  })
})
