import { describe, expect, it } from "vitest"
import {
  dashboard,
  dashboardPromptSpec,
  parseDashboardDefinition,
  serializeDashboardFence,
  type DashboardDefinition,
} from "./index"
import type { ASTNode, RenderOutput } from "@ai-gui/core"

const DEF: DashboardDefinition = {
  title: "门店经营看板",
  panels: [
    {
      title: "各门店流水",
      columns: ["store", { name: "revenue", align: "right" }],
      rows: [
        ["城东店", "9,308,286.52"],
        ["城西店", "6,195,909.55"],
      ],
      sql: "SELECT store, SUM(amount) FROM sales GROUP BY store",
      chart: { xAxis: { type: "category", data: ["城东店", "城西店"] }, yAxis: { type: "value" }, series: [{ type: "bar", data: [9308286.52, 6195909.55] }] },
    },
    {
      title: "毛利率",
      error: "viewer 不可见 gross_margin_rate",
    },
  ],
}

function node(content: string, complete = true): ASTNode {
  return { type: "dashboard", content, complete } as ASTNode
}

function render(content: string, complete = true): RenderOutput {
  const plugin = dashboard({ locale: "zh-CN" })
  return plugin.nodeRenderers!.dashboard(node(content, complete), undefined as never)
}

function flatten(out: RenderOutput): string {
  if (out.kind === "html") return out.html
  if (out.kind === "element") {
    const props = Object.entries(out.props ?? {})
      .map(([k, v]) => `${k}="${String(v)}"`)
      .join(" ")
    const inner = (out.children ?? []).map(flatten).join("")
    return `<${out.tag}${props ? " " + props : ""}>${inner}</${out.tag}>`
  }
  return `[${out.kind}]`
}

describe("parse", () => {
  it("round-trips through the serializer", () => {
    const fence = serializeDashboardFence(DEF)
    const body = fence.split("\n").slice(1, -1).join("\n")
    const parsed = parseDashboardDefinition(body)
    expect(parsed.valid).toBe(true)
    if (parsed.valid) expect(parsed.data.panels).toHaveLength(2)
  })

  it("refuses a row that does not match the header — a misaligned table shows a number under the wrong column", () => {
    const parsed = parseDashboardDefinition(
      JSON.stringify({ panels: [{ title: "x", columns: ["a", "b"], rows: [["only-one"]] }] }),
    )
    expect(parsed.valid).toBe(false)
    if (!parsed.valid) expect(parsed.issues.join()).toContain("expected 2")
  })

  it("caps panels at 12", () => {
    const panels = Array.from({ length: 13 }, (_, i) => ({ title: `p${i}` }))
    const parsed = parseDashboardDefinition(JSON.stringify({ panels }))
    expect(parsed.valid).toBe(false)
  })

  it("refuses unknown keys instead of ignoring them — a typo'd field must not become a silent no-op", () => {
    const parsed = parseDashboardDefinition(JSON.stringify({ panels: [{ title: "x", colums: ["a"] }] }))
    expect(parsed.valid).toBe(false)
  })
})

describe("render", () => {
  it("renders a grid with the title spanning it and one section per panel", () => {
    const html = flatten(render(JSON.stringify(DEF)))
    expect(html).toContain('data-aigui-dashboard=""')
    expect(html).toContain("门店经营看板")
    expect((html.match(/data-aigui-panel=""/g) ?? []).length).toBe(2)
  })

  it("a declared right column aligns even though the cells are host-formatted strings", () => {
    const html = flatten(render(JSON.stringify(DEF)))
    // The formatted string "9,308,286.52" is not a number, so detection can't
    // fire — the declaration must carry the alignment.
    expect(html).toContain('<td data-num="">9,308,286.52</td>')
  })

  it("a refused panel shows the refusal where its numbers would be, and the rest renders", () => {
    const html = flatten(render(JSON.stringify(DEF)))
    expect(html).toContain("viewer 不可见 gross_margin_rate")
    expect(html).toContain("城东店")
  })

  it("provenance sits behind a disclosure per panel", () => {
    const html = flatten(render(JSON.stringify(DEF)))
    expect(html).toContain("这些数是怎么来的")
    expect(html).toContain("SELECT store, SUM(amount)")
  })

  it("charts are live mounts, not inline SVG — panels resize with their grid track", () => {
    const html = flatten(render(JSON.stringify(DEF)))
    expect(html).toContain("[mount]")
  })

  it("an incomplete fence renders the loading shell — a half-streamed board reads as a finished smaller one", () => {
    const html = flatten(render("{\"panels\":[", false))
    expect(html).toContain("data-aigui-dashboard-loading")
  })

  it("invalid JSON says the dashboard is unavailable in the configured locale", () => {
    const html = flatten(render("not json"))
    expect(html).toContain("看板不可用")
  })
})

describe("prompt spec", () => {
  it("tells the model never to write the fence — a model that can invent rows can invent the board that proves its point", () => {
    expect(dashboardPromptSpec("en")).toContain("Never emit")
    expect(dashboardPromptSpec("zh-CN")).toContain("不要自己产出")
    // 规范的另一半：模型**决定版面** —— 只有禁令的规范是半份规范。
    expect(dashboardPromptSpec("en")).toContain("you decide the layout")
    expect(dashboardPromptSpec("zh-CN")).toContain("由你决定版面")
  })
})
