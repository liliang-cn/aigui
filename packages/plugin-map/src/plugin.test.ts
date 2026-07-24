// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { collectNodeRenderers, type ASTNode, type RenderOutput } from "@ai-gui/core"
import { map, mapPromptSpec } from "./index"

const content = JSON.stringify({ version: 1, ariaLabel: "Trip map", layers: [
  { id: "stops", type: "markers", items: [{ id: "a", position: [1, 2], label: "Start", description: "<script>alert(1)</script>" }] },
  { id: "path", type: "route", coordinates: [[1, 2], [3, 4]], label: "Route A", description: "Two stops" },
] })

describe("map plugin", () => {
  it("is complete-gated and caches output by AST node identity", () => {
    const render = collectNodeRenderers([map()]).map
    const incomplete = { key: "m", type: "map", content, complete: false } as ASTNode
    const loading = render(incomplete) as RenderOutput
    expect(loading.kind).toBe("html")
    if (loading.kind === "html") expect(loading.html).toContain("data-aigui-map-loading")
    expect(render(incomplete)).toBe(loading)
    const node = { key: "m2", type: "map", content, complete: true } as ASTNode
    const output = render(node) as RenderOutput
    expect(output.kind).toBe("element")
    expect(render(node)).toBe(output)
  })

  it("returns generic, non-reflective invalid output", () => {
    const render = collectNodeRenderers([map()]).map
    const out = render({ key: "bad", type: "map", content: '{"secret":"TOKEN-123"}', complete: true } as ASTNode) as RenderOutput
    expect(out.kind).toBe("html")
    if (out.kind === "html") { expect(out.html).toContain("Invalid map."); expect(out.html).not.toContain("TOKEN-123") }
  })

  it("allows only one complete map fence per commit", () => {
    const plugin = map()
    const nodes = [1, 2].map((n) => ({ key: String(n), type: "map", content, complete: true } as ASTNode))
    plugin.onASTCommit?.(nodes)
    const render = collectNodeRenderers([plugin]).map
    expect((render(nodes[0]) as RenderOutput).kind).toBe("element")
    const second = render(nodes[1]) as RenderOutput
    expect(second.kind).toBe("html")
    if (second.kind === "html") expect(second.html).toContain("Invalid map.")
  })

  it("provides an accessible inert summary and no raw property dump", () => {
    const render = collectNodeRenderers([map()]).map
    const out = render({ key: "m", type: "map", content, complete: true } as ASTNode) as RenderOutput
    expect(out.kind).toBe("element")
    expect(JSON.stringify(out)).toContain("Start")
    expect(JSON.stringify(out)).toContain("Route A")
    expect(JSON.stringify(out)).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
  })

  it("documents map-vs-chart and model network bans", () => {
    const prompt = mapPromptSpec()
    expect(prompt).toContain("ECharts")
    expect(prompt).toContain("tile URLs")
    expect(prompt).toContain("remote GeoJSON")
    expect(prompt).toContain("host")
  })
})
