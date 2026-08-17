import { describe, expect, it } from "vitest"
import { hasTrigger } from "./blocks"

describe("hasTrigger", () => {
  it("finds every fence family that can become a picture", () => {
    expect(hasTrigger("before\n```chart\n{}\n```\nafter")).toBe(true)
    expect(hasTrigger("```mermaid\ngraph TD;\n```")).toBe(true)
    expect(hasTrigger("```dashboard\n{}\n```")).toBe(true)
    expect(hasTrigger("```card:weather\n{}\n```")).toBe(true)
  })

  it("finds display math and tables", () => {
    expect(hasTrigger("text\n\n$$\nx^2\n$$\n")).toBe(true)
    expect(hasTrigger("| a | b |\n| - | - |\n| 1 | 2 |")).toBe(true)
  })

  it("finds the table shape models actually write, without leading pipes", () => {
    expect(hasTrigger("City | Temp\n-----|-----\nTokyo | 24")).toBe(true)
    expect(hasTrigger("City | Temp\n:---:|----:\nTokyo | 24")).toBe(true)
  })

  it("finds a fence that escaped its backticks", () => {
    expect(hasTrigger('````chart\n{"series":[]}\n````')).toBe(true)
  })

  it("says no to ordinary prose and ordinary code", () => {
    expect(hasTrigger("Just a sentence about charts and tables.")).toBe(false)
    expect(hasTrigger("```ts\nconst chart = 1\n```")).toBe(false)
  })

  it("does not mistake a horizontal rule for a table", () => {
    expect(hasTrigger("above\n\n-----\n\nbelow")).toBe(false)
  })
})
