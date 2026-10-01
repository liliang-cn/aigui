import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { parseTopology } from "./parse"

/** A README example that does not parse is worse than no example. */
describe("readme", () => {
  it("the example block parses", () => {
    const text = readFileSync(new URL("../README.md", import.meta.url), "utf8")
    const start = text.indexOf("```topology\n") + "```topology\n".length
    const result = parseTopology(text.slice(start, text.indexOf("```", start)))
    expect(result.ok ? "" : result.error).toBe("")
  })
})
