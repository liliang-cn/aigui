// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { CardRegistry } from "./card-registry"
import { applyPatches } from "./diff"
import { createParser } from "./parser"
import { Renderer } from "./renderer"
import { repairMarkdown } from "./repair-markdown"
import type { AIGuiPlugin, ASTNode } from "./types"

const cases = [
  "first paragraph\n\nsecond paragraph",
  "Title\n---\n\nafter",
  "```demo\nstreamed\n```\n\nafter",
  "- one\n- two\n\nafter",
  "> quote\n> continued\n\nafter",
  "<div>html</div>\n\nafter",
]

function expectStreamingMatchesOracle(source: string, chunks: string[], plugins: AIGuiPlugin[] = []): void {
  const snapshots: ASTNode[][] = []
  const renderer = new Renderer({ sanitize: false, plugins, onPatch: (_patches, nodes) => snapshots.push(nodes) })
  const parse = createParser({ plugins })
  let buffer = ""
  for (const chunk of chunks) {
    buffer += chunk
    renderer.push(chunk)
    expect(snapshots.at(-1)).toEqual(parse(repairMarkdown(buffer), buffer))
  }
}

describe("Renderer stable-prefix incremental parsing", () => {
  it.each(cases)("matches the full parser oracle for every character: %s", (source) => {
    expectStreamingMatchesOracle(source, [...source])
  })

  it.each(cases)("matches the full parser oracle for uneven chunks: %s", (source) => {
    expectStreamingMatchesOracle(source, [source.slice(0, 3), source.slice(3, 11), source.slice(11)])
  })

  it("matches the oracle for plugin fences and cards", () => {
    const plugin: AIGuiPlugin = { name: "demo", nodeRenderers: { demo: () => ({ kind: "html", html: "" }) } }
    expectStreamingMatchesOracle("```demo\nabc\n```\n\nafter", [..."```demo\nabc\n```\n\nafter"], [plugin])

    const registry = new CardRegistry()
    registry.register({ type: "weather", description: "weather" })
    const source = '```card:weather\n{"city":"Oslo"}\n```\n\nafter'
    const snapshots: ASTNode[][] = []
    const renderer = new Renderer({ registry, sanitize: false, onPatch: (_patches, nodes) => snapshots.push(nodes) })
    const parse = createParser({ registry })
    let buffer = ""
    for (const char of source) {
      buffer += char
      renderer.push(char)
      expect(snapshots.at(-1)).toEqual(parse(repairMarkdown(buffer), buffer))
    }
  })

  it.each(["\n", "\r\n", "\r"])("matches card and plugin oracles with %j line endings", (newline) => {
    const plugin: AIGuiPlugin = { name: "demo", nodeRenderers: { demo: () => ({ kind: "html", html: "" }) } }
    const pluginSource = `\`\`\`demo${newline}abc${newline}\`\`\`${newline}${newline}after`
    expectStreamingMatchesOracle(pluginSource, [...pluginSource], [plugin])

    const registry = new CardRegistry()
    registry.register({ type: "weather", description: "weather" })
    const cardSource = `\`\`\`card:weather${newline}{"city":"Oslo"}${newline}\`\`\`${newline}${newline}after`
    const snapshots: ASTNode[][] = []
    const renderer = new Renderer({ registry, sanitize: false, onPatch: (_patches, nodes) => snapshots.push(nodes) })
    const parse = createParser({ registry })
    let buffer = ""
    for (const char of cardSource) {
      buffer += char
      renderer.push(char)
      expect(snapshots.at(-1)).toEqual(parse(repairMarkdown(buffer), buffer))
    }
  })

  it("reuses stable node objects and does not sanitize them again", () => {
    const sanitizer = vi.fn((html: string) => html)
    const snapshots: ASTNode[][] = []
    const renderer = new Renderer({ sanitize: { sanitizer }, onPatch: (_patches, nodes) => snapshots.push(nodes) })
    renderer.push("first\n\nsecond")
    const first = snapshots.at(-1)![0]
    renderer.push(" grows")
    const callsAfterTailGrowth = sanitizer.mock.calls.length
    expect(snapshots.at(-1)![0]).toBe(first)
    renderer.push(" again")
    expect(snapshots.at(-1)![0]).toBe(first)
    expect(sanitizer.mock.calls.length - callsAfterTailGrowth).toBe(1)
  })

  it("falls back to full parsing for references and extendParser plugins", () => {
    const referenceSanitizer = vi.fn((html: string) => html)
    const referenceSnapshots: ASTNode[][] = []
    const reference = new Renderer({
      sanitize: { sanitizer: referenceSanitizer },
      onPatch: (_patches, nodes) => referenceSnapshots.push(nodes),
    })
    reference.push("first\n\n[label][id]")
    const referenceFirst = referenceSnapshots.at(-1)![0]
    reference.push("\n\n[id]: /url")
    expect(referenceSnapshots.at(-1)![0]).not.toBe(referenceFirst)
    expect(referenceSnapshots.at(-1)![1].html).toContain('href="/url"')

    const extendedSnapshots: ASTNode[][] = []
    const extended = new Renderer({
      sanitize: false,
      plugins: [{ name: "extended", extendParser: () => {} }],
      onPatch: (_patches, nodes) => extendedSnapshots.push(nodes),
    })
    extended.push("first\n\nsecond")
    const extendedFirst = extendedSnapshots.at(-1)![0]
    extended.push(" grows")
    expect(extendedSnapshots.at(-1)![0]).not.toBe(extendedFirst)
  })

  it("round-trips every emitted patch sequence", () => {
    let applied: ASTNode[] = []
    const renderer = new Renderer({
      sanitize: false,
      onPatch: (patches, nodes) => {
        applied = applyPatches(applied, patches)
        expect(applied).toEqual(nodes)
      },
    })
    for (const char of "Title\n---\n\n- one\n- two\n\nend") renderer.push(char)
  })

  it("round-trips patches containing non-adjacent map-null extension tokens", () => {
    const plugin: AIGuiPlugin = {
      name: "mapless",
      extendParser: (md) => {
        md.block.ruler.before("fence", "mapless", (state: any, start: number, _end: number, silent: boolean) => {
          const line = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start])
          if (line !== "@@@") return false
          if (silent) return true
          const token = state.push("mapless_block", "", 0)
          token.map = null
          token.block = true
          state.line = start + 1
          return true
        })
        ;(md.renderer.rules as any).mapless_block = () => "<div>mapless</div>"
      },
    }
    let applied: ASTNode[] = []
    const renderer = new Renderer({
      plugins: [plugin],
      sanitize: false,
      onPatch: (patches, nodes) => {
        applied = applyPatches(applied, patches)
        expect(applied).toEqual(nodes)
      },
    })
    renderer.push("@@@\n\nmiddle")
    renderer.push("\n\n@@@")
  })
})
