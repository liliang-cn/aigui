// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { buildSystemPrompt, collectNodeRenderers, type ASTNode, type RenderOutput } from "@ai-gui/core"
import { bigscreen, bigscreenCss, bigscreenPromptSpec } from "./index"
import { mountScreen } from "./mount"

const renderNode = (content: string, complete = true, options?: Parameters<typeof bigscreen>[0]): RenderOutput =>
  collectNodeRenderers([bigscreen(options)]).bigscreen({ key: "0:0", type: "bigscreen", content, complete } as ASTNode) as RenderOutput

const WALL = JSON.stringify({
  title: "Wall",
  subtitle: "today",
  panels: [
    { kind: "kpi", title: "Revenue", value: 12843000, prefix: "¥", delta: 0.124, trend: [1, 2, 3, 2, 4], span: 4 },
    { kind: "kpi", title: "Orders", value: 48210, unit: "单", delta: -0.05, upIsGood: true, span: 4 },
    { kind: "rank", title: "Stores", items: [{ name: "B", value: 5 }, { name: "A", value: 9 }, { name: "C", value: 2 }], top: 2, unit: "万", span: 4 },
  ],
})

describe("the bigscreen plugin", () => {
  it("claims the bigscreen fence and ships its css", () => {
    expect(Object.keys(collectNodeRenderers([bigscreen()]))).toEqual(["bigscreen"])
    expect(bigscreenCss).toContain("[data-aigui-bigscreen='dark']")
  })
  it("shows a skeleton while the fence is still streaming", () => {
    const output = renderNode('{"panels":[', false)
    expect(output.kind).toBe("html")
    if (output.kind === "html") expect(output.html).toContain("data-aigui-bigscreen-loading")
  })
  it("says why a screen could not be shown, escaped", () => {
    const output = renderNode(JSON.stringify({ panels: [{ kind: "kpi", value: 1, "<img src=x>": 1 }] }))
    expect(output.kind).toBe("html")
    if (output.kind === "html") {
      expect(output.html).toContain("data-aigui-bigscreen-error")
      expect(output.html).not.toContain("<img")
    }
  })
  it("mounts the wall: title, grid, counted KPIs and grown ranks", async () => {
    const output = renderNode(WALL, true, { animate: false })
    expect(output.kind).toBe("mount")
    if (output.kind !== "mount") return
    const host = document.createElement("div")
    const cleanup = output.mount(host)
    // The wall's attributes go on the host element itself, so it is the host that is checked.
    await vi.waitFor(() => expect(host.getAttribute("data-aigui-bigscreen")).toBe("dark"))
    expect(host.querySelector(".aigui-bs-title")?.textContent).toBe("Wall")
    const panels = host.querySelectorAll("[data-aigui-bigscreen-panel]")
    expect(panels).toHaveLength(3)
    expect((panels[0] as HTMLElement).style.gridColumn).toBe("span 4")
    // Without animation the final number is there at once.
    expect(host.querySelector(".aigui-bs-kpi-value")?.textContent).toBe("¥12,843,000")
    expect(host.querySelectorAll(".aigui-bs-kpi-delta")[0].textContent).toBe("▲ 12.4%")
    expect(host.querySelectorAll(".aigui-bs-kpi-delta")[1].textContent).toBe("▼ 5.0%")
    expect(host.querySelector(".aigui-bs-kpi-spark svg")).toBeTruthy()
    // Ranks are sorted, cut to `top`, and the longest bar is full width.
    const names = [...host.querySelectorAll(".aigui-bs-rank-name")].map((n) => n.textContent)
    expect(names).toEqual(["A", "B"])
    const fills = [...host.querySelectorAll<HTMLElement>(".aigui-bs-rank-fill")].map((f) => f.style.width)
    expect(fills[0]).toBe("100%")
    expect(host.querySelector(".aigui-bs-rank-value")?.textContent).toBe("9万")
    if (typeof cleanup === "function") cleanup()
    expect(host.childNodes).toHaveLength(0)
  })
  it("uses the fence's theme on the wall element", async () => {
    const output = renderNode(JSON.stringify({ theme: "light", panels: [{ kind: "kpi", value: 1 }] }), true, { animate: false })
    if (output.kind !== "mount") throw new Error("expected mount")
    const host = document.createElement("div")
    output.mount(host)
    await vi.waitFor(() => expect(host.getAttribute("data-aigui-bigscreen")).toBe("light"))
  })
})

describe("isBlockComplete", () => {
  const complete = bigscreen().isBlockComplete!
  it("waits for the whole JSON object", () => {
    expect(complete("bigscreen", '{"panels":[{"kind":"kpi"')).toBe(false)
    expect(complete("bigscreen", '{"panels":[{"kind":"kpi","value":1}]}')).toBe(true)
  })
})

describe("a wall narrower than its window", () => {
  it("folds on its own width, not the window's", () => {
    // The failure this replaces: dropped into a 330px side panel of a 1900px
    // window, `@media (max-width:640px)` never fired and four KPI cards shared
    // three hundred pixels, one character per line. The query has to ask how
    // wide the wall is, which means the wall has to be a container.
    expect(bigscreenCss).toContain("container-type:inline-size")
    expect(bigscreenCss).toContain("@container (max-width:900px)")
    expect(bigscreenCss).toContain("@container (max-width:520px)")
    expect(bigscreenCss).not.toContain("@media (max-width:640px)")
  })
  it("keeps a wide panel wide when it folds to two columns", () => {
    // A chart given more than half the grid is wide because it needs to be.
    // Two KPIs rather than a KPI and a chart: a chart panel loads ECharts
    // through a dynamic import, and the callback lands after the test has
    // finished and the host is gone — an unhandled "cannot set dpr of null"
    // that fails the whole run while every assertion passes. The attribute
    // under test is set by mountPanel from the span alone, so the kind is
    // beside the point.
    const host = document.createElement("div")
    mountScreen(host, {
      theme: "dark", columns: 12,
      panels: [
        { kind: "kpi", value: 1, span: 3 },
        { kind: "kpi", value: 2, span: 8 },
      ],
    } as never, false)
    const panels = host.querySelectorAll(".aigui-bs-panel")
    expect(panels[0].hasAttribute("data-aigui-bigscreen-wide")).toBe(false)
    expect(panels[1].hasAttribute("data-aigui-bigscreen-wide")).toBe(true)
  })
})

describe("bigscreenPromptSpec", () => {
  it("carries the rule about not inventing numbers", () => {
    expect(bigscreenPromptSpec("zh-CN")).toContain("只用对话里已有的数字")
    expect(bigscreenPromptSpec("en")).toContain("Never invent a plausible figure")
  })
  it("shows every panel kind in the worked example, because that is what a model copies", () => {
    const spec = bigscreenPromptSpec("zh-CN")
    for (const kind of ["kpi", "gauge", "rank", "chart", "chart3d", "globe"]) expect(spec).toContain(`"kind": "${kind}"`)
    // A completion rate coloured amber at 82% taught the wrong lesson; thresholds are alarm lines.
    expect(spec).not.toMatch(/目标完成率[^}]*thresholds/)
    expect(spec.match(/```bigscreen\n\{/g) ?? []).toHaveLength(1)
  })
  it("names every length limit, in both locales", () => {
    // The limits are enforced and were never stated, which is the whole of this
    // bug: a model asked for a portfolio wall wrote a 54-character caption into
    // `label`, twice, and lost the entire screen to a rule it had not been
    // given. A limit the parser checks and the spec does not mention is a trap.
    for (const locale of ["zh-CN", "en"]) {
      const spec = bigscreenPromptSpec(locale)
      for (const max of ["40", "16", "8", "80", "120"]) expect(spec).toContain(max)
    }
    // And that overrunning one costs the whole block, not just that string —
    // without which "at most 40" reads like a field that will be trimmed.
    expect(bigscreenPromptSpec("zh-CN")).toContain("整个块就作废")
    expect(bigscreenPromptSpec("en")).toContain("throws the whole block away")
  })
  it("points real BI boards at the dashboard block", () => {
    expect(bigscreenPromptSpec("zh-CN")).toContain("用 dashboard 块")
  })
  it("is what the plugin hands buildSystemPrompt", () => {
    expect(buildSystemPrompt({ plugins: [bigscreen()], locale: "en" })).toContain("Data walls (fenced)")
  })
})
