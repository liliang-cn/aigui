import { describe, expect, it } from "vitest"
import { CardRegistry } from "./card-registry"
import { createParser, createParserWithMetadata } from "./parser"
import type { AIGuiPlugin } from "./types"

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
  it("does not mark a card complete until its real source fence closes", () => {
    const registry = new CardRegistry()
    registry.register({ type: "weather", description: "weather", schema: { type: "object" } })
    const parse = createParser({ registry })
    expect(parse('```card:weather\n{"city":"tokyo"}', '```card:weather\n{"city":"tokyo"}')[0].card)
      .toMatchObject({ complete: false, valid: false })
    expect(parse('```card:weather\n{"city":"tokyo"}\n```')[0].card)
      .toMatchObject({ complete: true, valid: true })
  })
  it.each(["\n", "\r\n", "\r"])("marks card fences complete with %j line endings", (newline) => {
    const registry = new CardRegistry()
    registry.register({ type: "weather", description: "weather", schema: { type: "object" } })
    const parse = createParser({ registry })
    const source = `\`\`\`card:weather${newline}{"city":"tokyo"}${newline}\`\`\``
    expect(parse(source)[0].card).toMatchObject({ complete: true, valid: true })
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
  it("exposes top-level source metadata and keys nodes by absolute start plus slot", () => {
    const parse = createParserWithMetadata()
    const result = parse("alpha\n\nbeta", undefined, 10)
    expect(result.blocks).toEqual([
      { start: 10, end: 16, nodeStart: 0, nodeEnd: 1 },
      { start: 17, end: 21, nodeStart: 1, nodeEnd: 2 },
    ])
    expect(result.nodes.map((node) => node.key)).toEqual(["10:0", "17:0"])
    expect(result.incrementalSafe).toBe(true)
  })
  it.each(["\n", "\r\n", "\r"])("tracks source metadata with %j line endings", (newline) => {
    const source = `alpha${newline}${newline}beta`
    const result = createParserWithMetadata()(source)
    expect(result.blocks).toEqual([
      { start: 0, end: 5 + newline.length, nodeStart: 0, nodeEnd: 1 },
      { start: 5 + newline.length * 2, end: source.length, nodeStart: 1, nodeEnd: 2 },
    ])
    expect(result.nodes.map((node) => node.key)).toEqual(["0:0", `${5 + newline.length * 2}:0`])
  })
  it("gives non-adjacent map-null extension tokens globally unique keys", () => {
    const plugin = maplessBlockPlugin()
    const nodes = createParser({ plugins: [plugin] })("@@@\n\nmiddle\n\n@@@")
    expect(nodes.map((node) => node.key)).toHaveLength(new Set(nodes.map((node) => node.key)).size)
  })
  it("keeps a key when a paragraph becomes a setext heading", () => {
    const parse = createParser()
    expect(parse("Title")[0].key).toBe(parse("Title\n---")[0].key)
  })
  it("marks reference syntax and parser extensions as unsafe for incremental parsing", () => {
    expect(createParserWithMetadata()("[label][id]\n\n[id]: /url").incrementalSafe).toBe(false)
    expect(createParserWithMetadata({
      plugins: [{ name: "extended", extendParser: () => {} }],
    })("plain").incrementalSafe).toBe(false)
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

function maplessBlockPlugin(): AIGuiPlugin {
  return {
    name: "mapless",
    extendParser: (md) => {
      md.block.ruler.before("fence", "mapless", (state: any, start: number, _end: number, silent: boolean) => {
        const line = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start])
        if (line !== "@@@") return false
        if (silent) return true
        const token = state.push("mapless_block", "", 0)
        token.content = "mapless"
        token.map = null
        token.block = true
        state.line = start + 1
        return true
      })
      ;(md.renderer.rules as any).mapless_block = () => "<div>mapless</div>"
    },
  }
}
