// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { Renderer } from "@ai-gui/core"
import { katex } from "./index"

function collect(md: string) {
  const nodes: any[] = []
  const r = new Renderer({ plugins: [katex()], onPatch: (_p, n) => { nodes.length = 0; nodes.push(...n) } })
  r.push(md)
  return nodes
}

describe("plugin-katex", () => {
  it("renders inline math into a paragraph's html", () => {
    const nodes = collect("mass $E=mc^2$ done")
    const p = nodes.find((n) => n.type === "paragraph")
    expect(p?.html ?? "").toContain("katex")
  })
  it("renders block math", () => {
    const nodes = collect("$$\\int x\\,dx$$")
    const html = nodes.map((n) => n.html ?? n.content ?? "").join("")
    expect(html).toContain("katex")
  })
})
