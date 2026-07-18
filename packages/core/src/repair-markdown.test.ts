import { describe, expect, it } from "vitest"
import { repairMarkdown } from "./repair-markdown"

describe("repairMarkdown", () => {
  it("returns complete text unchanged", () => {
    expect(repairMarkdown("**bold** done")).toBe("**bold** done")
  })
  it("closes unclosed bold", () => {
    expect(repairMarkdown("hello **wor")).toBe("hello **wor**")
  })
  it("closes unclosed inline code", () => {
    expect(repairMarkdown("use `npm")).toBe("use `npm`")
  })
  it("closes unclosed code fence", () => {
    expect(repairMarkdown("```ts\nconst a = 1")).toBe("```ts\nconst a = 1\n```")
  })
  it("does not re-close an already closed fence", () => {
    const md = "```ts\nconst a = 1\n```"
    expect(repairMarkdown(md)).toBe(md)
  })
  it("leaves a dangling link text as-is (does not turn into a link)", () => {
    expect(repairMarkdown("see [docs")).toBe("see [docs")
  })
})
