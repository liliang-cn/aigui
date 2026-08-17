import { CardRegistry } from "@ai-gui/core"
import { describe, expect, it } from "vitest"
import { hasTrigger, selectRenderableBlocks, stripBlocks } from "./blocks"

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

const CHART = '```chart\n{"series":[{"type":"bar","data":[1,2]}]}\n```'
const MERMAID = "```mermaid\ngraph TD;\nA-->B;\n```"
const MATH = "$$\nx^2 + y^2 = z^2\n$$"
const TABLE = "| a | b |\n| - | - |\n| 1 | 2 |"

describe("selectRenderableBlocks", () => {
  it("selects a complete chart fence and reports its source range", () => {
    const source = `Intro.\n\n${CHART}\n\nOutro.`
    const selections = selectRenderableBlocks(source)
    expect(selections).toHaveLength(1)
    expect(selections[0].kind).toBe("chart")
    expect(source.slice(selections[0].start, selections[0].end)).toContain("```chart")
  })

  it("selects mermaid, display math and tables", () => {
    const kinds = selectRenderableBlocks(`${MERMAID}\n\n${MATH}\n\n${TABLE}`).map((s) => s.kind)
    expect(kinds).toEqual(["mermaid", "math", "table"])
  })

  it("ignores a fence that has not finished streaming", () => {
    expect(selectRenderableBlocks('```chart\n{"series":[')).toEqual([])
  })

  it("ignores an ordinary code fence and ordinary prose", () => {
    expect(selectRenderableBlocks("```ts\nconst x = 1\n```\n\nA sentence.")).toEqual([])
  })

  it("selects a card only when the registry knows the type and the data is valid", () => {
    const registry = new CardRegistry()
    registry.register({ type: "weather", description: "Weather", render: () => null })
    const source = '```card:weather\n{"city":"Tokyo"}\n```'
    expect(selectRenderableBlocks(source, { registry }).map((s) => s.kind)).toEqual(["card"])
    expect(selectRenderableBlocks(source)).toEqual([])
  })

  it("honours the kinds filter", () => {
    const selections = selectRenderableBlocks(`${CHART}\n\n${TABLE}`, { kinds: ["chart"] })
    expect(selections.map((s) => s.kind)).toEqual(["chart"])
  })

  it("caps the count and keeps document order", () => {
    const source = `${CHART}\n\n${MERMAID}\n\n${TABLE}`
    expect(selectRenderableBlocks(source, { max: 2 }).map((s) => s.kind)).toEqual(["chart", "mermaid"])
  })
})

describe("stripBlocks", () => {
  it("removes the selected ranges and leaves the prose readable", () => {
    const source = `Intro.\n\n${CHART}\n\nOutro.`
    const selections = selectRenderableBlocks(source)
    expect(stripBlocks(source, selections)).toBe("Intro.\n\nOutro.")
  })

  it("removes later ranges without invalidating earlier ones", () => {
    const source = `A\n\n${CHART}\n\nB\n\n${MERMAID}\n\nC`
    expect(stripBlocks(source, selectRenderableBlocks(source))).toBe("A\n\nB\n\nC")
  })

  it("returns an empty string when the whole message was one picture", () => {
    expect(stripBlocks(CHART, selectRenderableBlocks(CHART))).toBe("")
  })

  it("leaves the source untouched when nothing was selected", () => {
    expect(stripBlocks("Just prose.", [])).toBe("Just prose.")
  })

  it("collapses blank lines in a CRLF message too", () => {
    const source = `Intro.\r\n\r\n${CHART.replace(/\n/g, "\r\n")}\r\n\r\nOutro.`
    expect(stripBlocks(source, selectRenderableBlocks(source))).toBe("Intro.\n\nOutro.")
  })
})

describe("classify edge cases", () => {
  it("does not turn prose about KaTeX's CSS into a picture of that prose", () => {
    const source = 'Some text.\n\n<div>The katex-display class centres display math.</div>'
    expect(selectRenderableBlocks(source)).toEqual([])
  })
})
