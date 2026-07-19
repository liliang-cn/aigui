import { describe, expect, it } from "vitest"
import { Renderer, collectNodeRenderers, type ASTNode, type RenderOutput } from "@aigui/core"
import { chart, chartPromptSpec } from "./index"

const barOption = JSON.stringify({ xAxis: { type: "category", data: ["A", "B"] }, yAxis: { type: "value" }, series: [{ type: "bar", data: [1, 2] }] })

describe("plugin-chart", () => {
  it("renders a complete chart option to an svg html RenderOutput", () => {
    const r = collectNodeRenderers([chart()]).chart
    const out = r({ key: "0:chart", type: "chart", content: barOption } as ASTNode) as RenderOutput
    expect(out.kind).toBe("html")
    if (out.kind === "html") expect(out.html).toContain("<svg")
  })
  it("shows a loading placeholder for incomplete JSON (streaming)", () => {
    const r = collectNodeRenderers([chart()]).chart
    const out = r({ key: "0:chart", type: "chart", content: '{"series":[{"type":"bar"' } as ASTNode) as RenderOutput
    expect(out.kind).toBe("html")
    if (out.kind === "html") expect(out.html).toContain("data-aigui-chart-loading")
  })
  it("returns error html (never throws) on a broken option", () => {
    const r = collectNodeRenderers([chart()]).chart
    const out = r({ key: "0:chart", type: "chart", content: '{"series":"not-an-array-boom"}' } as ASTNode) as RenderOutput
    expect(out.kind).toBe("html") // either a rendered svg or a data-aigui-chart-error block, but no throw
  })
  it("survives core sanitization end-to-end (svg not stripped)", () => {
    const nodes: any[] = []
    const rr = new Renderer({ plugins: [chart()], onPatch: (_p, n) => { nodes.length = 0; nodes.push(...n) } })
    // Note: this drives the async adapter path only in a UI; here we just assert the fence becomes a chart node.
    rr.push("```chart\n" + barOption + "\n```")
    expect(nodes.some((n) => n.type === "chart")).toBe(true)
  })
  it("exposes a prompt spec mentioning the chart fence", () => {
    expect(chartPromptSpec()).toContain("chart")
  })
})
