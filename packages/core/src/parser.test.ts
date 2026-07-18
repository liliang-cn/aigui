import { describe, expect, it } from "vitest"
import { CardRegistry } from "./card-registry"
import { createParser } from "./parser"

describe("createParser", () => {
  it("parses a paragraph", () => {
    const parse = createParser()
    const nodes = parse("hello world")
    expect(nodes[0]).toMatchObject({ type: "paragraph" })
    expect(nodes[0].content).toContain("hello world")
  })
  it("parses a heading", () => {
    const parse = createParser()
    expect(parse("# Title")[0]).toMatchObject({ type: "heading", tag: "h1" })
  })
  it("recognizes a card fenced block as a card node", () => {
    const registry = new CardRegistry()
    registry.register({ type: "weather", description: "weather", schema: { type: "object" } })
    const parse = createParser({ registry })
    const nodes = parse('```card:weather\n{"city":"tokyo"}\n```')
    const card = nodes.find((n) => n.type === "card")
    expect(card?.card).toMatchObject({ type: "weather", data: { city: "tokyo" }, complete: true })
  })
  it("keeps a normal code fence as a code node", () => {
    const parse = createParser()
    expect(parse("```ts\nconst a=1\n```")[0]).toMatchObject({ type: "code" })
  })
  it("gives every node a stable unique key", () => {
    const parse = createParser()
    const nodes = parse("# A\n\nbody")
    expect(nodes[0].key).toBeTruthy()
    expect(nodes[0].key).not.toBe(nodes[1].key)
  })
  it("emits a node for a horizontal rule", () => {
    const parse = createParser()
    const nodes = parse("a\n\n---\n\nb")
    expect(nodes.some((n) => n.type === "hr" || (n.type === "html" && (n.content ?? "").includes("<hr")))).toBe(true)
  })
  it("emits a code node for an indented code block", () => {
    const parse = createParser()
    const nodes = parse("    const a = 1\n")
    expect(nodes.some((n) => n.type === "code")).toBe(true)
  })
  it("emits an html node for a raw html block", () => {
    const parse = createParser()
    const nodes = parse("<div>hi</div>")
    const html = nodes.find((n) => n.type === "html")
    expect(html?.content ?? "").toContain("<div>")
  })
  it("renders inline markdown to html on a paragraph node", () => {
    const parse = createParser()
    const node = parse("a **bold** b")[0]
    expect(node.type).toBe("paragraph")
    expect(node.html).toContain("<strong>bold</strong>")
  })
  it("renders inline markdown to html on a heading node", () => {
    const parse = createParser()
    const node = parse("# a `code`")[0]
    expect(node.html).toContain("<code>code</code>")
  })
})
