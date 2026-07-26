import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { parseFigure } from "./index"

/** A README example that does not parse is worse than no example. */
describe("readme", () => {
  it("the example block parses", () => {
    const text = readFileSync(new URL("../README.md", import.meta.url), "utf8")
    const start = text.indexOf("```figure")
    const end = text.indexOf("```", start + 9)
    const block = text
      .slice(start + 9, end)
      .split("\n")
      .map((line) => line.replace(/^ {4}/, ""))
      .join("\n")
      .trim()

    const parsed = parseFigure(block)
    expect(parsed.valid ? "" : parsed.issues.join(" ")).toBe("")
  })
})
