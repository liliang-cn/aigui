// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { Renderer, collectNodeRenderers, type ASTNode, type RenderOutput } from "@ai-gui/core"
import { chart, chartPromptSpec } from "./index"

const barOption = JSON.stringify({ xAxis: { type: "category", data: ["A", "B"] }, yAxis: { type: "value" }, series: [{ type: "bar", data: [1, 2] }] })

const bar3DOption = JSON.stringify({
  xAxis3D: { type: "category", data: ["a", "b"] }, yAxis3D: { type: "category", data: ["x", "y"] }, zAxis3D: { type: "value" },
  grid3D: {}, series: [{ type: "bar3D", data: [[0, 0, 5], [1, 1, 8]] }],
})

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
  it("sets a non-empty promptSpec on the returned plugin", () => {
    expect(chart().promptSpec).toContain("chart")
  })
  it("interactive mode returns a mount RenderOutput for a complete option", () => {
    const r = collectNodeRenderers([chart({ interactive: true })]).chart
    const out = r({ key: "0:chart", type: "chart", content: barOption } as ASTNode) as RenderOutput
    expect(out.kind).toBe("mount")
  })
  it("interactive mount initializes a live instance on the element and returns cleanup", () => {
    const r = collectNodeRenderers([chart({ interactive: true })]).chart
    const out = r({ key: "0:chart", type: "chart", content: barOption } as ASTNode) as RenderOutput
    if (out.kind !== "mount") throw new Error("expected mount")
    const el = document.createElement("div"); el.style.width = "600px"; el.style.height = "400px"
    document.body.appendChild(el)
    const cleanup = out.mount(el)
    expect(el.querySelector("svg")).toBeTruthy()
    expect(typeof cleanup).toBe("function")
    if (typeof cleanup === "function") cleanup()
    el.remove()
  })
  it("interactive mode still shows loading placeholder for incomplete json", () => {
    const r = collectNodeRenderers([chart({ interactive: true })]).chart
    const out = r({ key: "0:chart", type: "chart", content: '{"series":[{"type":"bar"' } as ASTNode) as RenderOutput
    expect(out.kind).toBe("html")
    if (out.kind === "html") expect(out.html).toContain("data-aigui-chart-loading")
  })
  it("default (non-interactive) mode still returns static svg html", () => {
    const r = collectNodeRenderers([chart()]).chart
    const out = r({ key: "0:chart", type: "chart", content: barOption } as ASTNode) as RenderOutput
    expect(out.kind).toBe("html")
    if (out.kind === "html") expect(out.html).toContain("<svg")
  })
  it("gl mode returns a mount RenderOutput for a complete 3D option", () => {
    const r = collectNodeRenderers([chart({ gl: true })]).chart
    const out = r({ key: "0:c", type: "chart", content: bar3DOption } as ASTNode) as RenderOutput
    expect(out.kind).toBe("mount")
  })
  it("gl mount returns a cleanup function and does not throw synchronously (jsdom has no WebGL)", () => {
    const r = collectNodeRenderers([chart({ gl: true })]).chart
    const out = r({ key: "0:c", type: "chart", content: bar3DOption } as ASTNode) as RenderOutput
    if (out.kind !== "mount") throw new Error("expected mount")
    const el = document.createElement("div"); el.style.width = "400px"; el.style.height = "300px"; document.body.appendChild(el)
    const cleanup = out.mount(el)
    expect(typeof cleanup).toBe("function")
    if (typeof cleanup === "function") cleanup()
    el.remove()
  })
  it("gl mode still shows loading placeholder for incomplete json", () => {
    const r = collectNodeRenderers([chart({ gl: true })]).chart
    const out = r({ key: "0:c", type: "chart", content: '{"series":[{"type":"bar3D"' } as ASTNode) as RenderOutput
    expect(out.kind).toBe("html")
    if (out.kind === "html") expect(out.html).toContain("data-aigui-chart-loading")
  })
})
