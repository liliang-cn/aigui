import { describe, expect, it } from "vitest"
import { packsFor } from "./packs"

describe("packsFor", () => {
  it("loads only what the answer's blocks draw", () => {
    expect(packsFor("# Hi\n\nJust prose, a table:\n\n| a | b |\n|---|---|\n| 1 | 2 |")).toEqual([])
    expect(packsFor('```chart\n{}\n```\n\n```bigscreen\n{}\n```').sort()).toEqual(["echarts"])
    expect(packsFor("```mermaid\ngraph TD; A-->B\n```\n\n```scene\n{}\n```\n\n```topology\n{}\n```").sort()).toEqual(["mermaid", "three", "topology"])
    expect(packsFor("```gravity\n{}\n```\n\n```list\n{}\n```")).toEqual([])
  })
  it("highlights code in a language, and loads maths only for maths", () => {
    expect(packsFor("```ts\nconst a = 1\n```")).toEqual(["highlight"])
    expect(packsFor("$$\\frac{a}{b}$$")).toEqual(["katex"])
    expect(packsFor("Energy is $E = mc^2$ here.")).toEqual(["katex"])
    expect(packsFor("It costs $5 and $10 tomorrow.")).toEqual([])
    expect(packsFor("\\ce{H2O}")).toEqual(["katex"])
  })
  it("leaves a custom block's fence to its own script, not to the code highlighter", () => {
    expect(packsFor("```ticket\n{}\n```")).toEqual(["highlight"])
    expect(packsFor("```ticket\n{}\n```", ["ticket"])).toEqual([])
  })
})
