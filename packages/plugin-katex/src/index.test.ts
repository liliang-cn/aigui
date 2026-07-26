// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
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

describe("katex chemistry", () => {
  function render(md: string, options?: { chemistry?: boolean }) {
    const nodes: any[] = []
    const r = new Renderer({ plugins: [katex(options)], onPatch: (_p, n) => { nodes.length = 0; nodes.push(...n) } })
    r.push(md)
    return nodes.map((node) => node.html ?? node.content ?? "").join("")
  }

  it("renders a reaction, which needs a grammar KaTeX does not ship enabled", async () => {
    // "\\ce{2H2 + O2 -> 2H2O}" is how a reaction is written in every chemistry lesson, and KaTeX
    // rejects \\ce as an undefined control sequence until mhchem is loaded.
    const fresh = (await import("katex")).default
    expect(() => fresh.renderToString("\\ce{2H2 + O2 -> 2H2O}", { throwOnError: true })).toThrow(/Undefined control sequence/)

    katex({ chemistry: true })

    // mhchem installs itself into KaTeX asynchronously, and globally — which is why the disabled
    // case has to be asserted before this point rather than after.
    await vi.waitFor(() => {
      expect(() => fresh.renderToString("\\ce{2H2 + O2 -> 2H2O}", { throwOnError: true })).not.toThrow()
    })
    expect(render("$\\ce{2H2 + O2 -> 2H2O}$", { chemistry: true })).toContain("katex")
  })

  it("leaves ordinary maths exactly as it was", () => {
    const plain = render("$x^2 + 1$")
    expect(plain).toContain("katex")
    expect(plain).not.toContain("katex-error")
  })
})
