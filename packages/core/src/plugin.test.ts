import { describe, expect, it, vi } from "vitest"
import { createParser } from "./parser"
import { collectNodeRenderers } from "./plugins"
import type { AIGuiPlugin } from "./types"

const fakeFence: AIGuiPlugin = {
  name: "fake",
  nodeRenderers: { widget: () => ({ kind: "html", html: "<b>w</b>" }) },
}

describe("plugin parsing", () => {
  it("routes a fenced block with a plugin-claimed info to a plugin node", () => {
    const parse = createParser({ plugins: [fakeFence] })
    const nodes = parse("```widget\nhello\n```")
    expect(nodes[0]).toMatchObject({ type: "widget", content: "hello\n" })
  })
  it("collectNodeRenderers merges plugin renderers", () => {
    expect(typeof collectNodeRenderers([fakeFence]).widget).toBe("function")
  })
  it.each(["\n", "\r\n", "\r"])("marks plugin fences complete with %j line endings", (newline) => {
    const plugin: AIGuiPlugin = {
      name: "json-widget",
      nodeRenderers: { widget: () => ({ kind: "html", html: "rendered" }) },
      isBlockComplete: (_type, raw) => raw.trim().endsWith("}"),
    }
    const parse = createParser({ plugins: [plugin] })
    expect(parse(`\`\`\`widget${newline}{"a":1`).at(0)?.complete).toBe(false)
    expect(parse(`\`\`\`widget${newline}{"a":1${newline}\`\`\``).at(0)?.complete).toBe(false)
    expect(parse(`\`\`\`widget${newline}{"a":1}${newline}\`\`\``).at(0)?.complete).toBe(true)
  })
  it("does not invoke a plugin renderer for an incomplete node", async () => {
    const render = vi.fn(() => ({ kind: "html" as const, html: "rendered" }))
    const renderer = collectNodeRenderers([{ name: "x", nodeRenderers: { widget: render } }]).widget
    const output = await renderer({ key: "0:widget", type: "widget", complete: false })
    expect(render).not.toHaveBeenCalled()
    expect(output).toMatchObject({ kind: "html" })
    if (output.kind === "html") expect(output.html).toContain("data-aigui-block-loading")
  })
  it("extendParser block tokens render to html nodes", () => {
    const plugin: AIGuiPlugin = {
      name: "hr2",
      extendParser: (md) => {
        md.block.ruler.before("fence", "hr2", (state: any, start: number, _end: number, silent: boolean) => {
          const line = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start])
          if (line !== "@@@") return false
          if (silent) return true
          const token = state.push("hr2_block", "", 0)
          token.content = "X"
          token.map = [start, start + 1]
          token.block = true
          state.line = start + 1
          return true
        })
        ;(md.renderer.rules as any).hr2_block = () => "<div class='hr2'>X</div>"
      },
    }
    const parse = createParser({ plugins: [plugin] })
    const nodes = parse("@@@")
    expect(nodes.some((n) => n.type === "html" && (n.content ?? "").includes("hr2"))).toBe(true)
  })
})
