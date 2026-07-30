import { describe, expect, it } from "vitest"
import { createParser } from "./parser"
import { Renderer } from "./renderer"
import type { ASTNode } from "./types"

describe("rawHtml", () => {
  it("interprets raw HTML by default", () => {
    const nodes = createParser()("Done <code>x</code> here")
    expect(nodes[0].html).toContain("<code>x</code>")
  })
  it("escapes the tags a model wrote in prose when turned off", () => {
    // The line that prompted this: a tag inside a sentence about code used to swallow the rest of
    // the sentence into an element, leaving the trailing text outside it.
    const nodes = createParser({ rawHtml: false })('return "done\\n<code>" 🎭 ok')
    expect(nodes[0].html).toContain("&lt;code&gt;")
    expect(nodes[0].html).not.toContain("<code>")
    expect(nodes[0].html).toContain("🎭 ok")
  })
  it("escapes a block of raw HTML too", () => {
    const nodes = createParser({ rawHtml: false })("<div onclick=\"x\">hi</div>")
    expect(nodes[0].html ?? nodes[0].content).toContain("&lt;div")
  })
  it("still renders markdown, code fences and inline code", () => {
    const nodes = createParser({ rawHtml: false })("**bold** and `x < y`\n\n```js\nconst a = 1\n```")
    expect(nodes[0].html).toContain("<strong>bold</strong>")
    expect(nodes[0].html).toContain("<code>x &lt; y</code>")
    expect(nodes[1]).toMatchObject({ type: "code", content: "const a = 1\n" })
  })
  it("reaches the parser through the Renderer", () => {
    const snapshots: ASTNode[][] = []
    // Sanitizing is beside the point here and its bare-Node fallback escapes everything, which
    // would hide whether the parser was configured at all.
    const r = new Renderer({ rawHtml: false, sanitize: false, onPatch: (_patches, nodes) => snapshots.push(nodes) })
    r.push("text <code>swallow</code> tail")
    expect(snapshots.at(-1)?.[0]?.html).toContain("&lt;code&gt;")
  })
  it("survives a plugin swap", () => {
    const snapshots: ASTNode[][] = []
    // Sanitizing is beside the point here and its bare-Node fallback escapes everything, which
    // would hide whether the parser was configured at all.
    const r = new Renderer({ rawHtml: false, sanitize: false, onPatch: (_patches, nodes) => snapshots.push(nodes) })
    r.push("text <code>swallow</code> tail")
    r.setPlugins([{ name: "widget", nodeRenderers: { widget: () => ({ kind: "html", html: "w" }) } }])
    expect(snapshots.at(-1)?.[0]?.html).toContain("&lt;code&gt;")
  })
})
