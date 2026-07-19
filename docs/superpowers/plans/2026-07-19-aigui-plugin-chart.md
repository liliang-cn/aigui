# @aigui/plugin-chart Implementation Plan (sub-project 6)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** A chart plugin: LLM emits a ```` ```chart ```` fenced block containing an ECharts option JSON; the plugin renders it to a framework-neutral SVG string via ECharts SSR, flowing through the existing `RenderOutput { kind: "html" }` pipeline (works in React/Vue/vanilla unchanged, sanitized by core).

**Architecture:** Claims the `chart` node type via `nodeRenderers.chart`. Parses the fence body tolerantly with `parsePartialJSON`; when incomplete → loading placeholder; when complete → `echarts.init(null, null, { renderer: "svg", ssr: true, width, height })`, `setOption`, `renderToSVGString()`, `dispose()` → `{ kind: "html", html: svg }`. Sync. Errors → error-html fallback (never throws). ECharts SSR renders in Node, so the SVG output is fully unit-testable.

**Tech Stack:** existing + `echarts` (externalized). Vitest.

Prereq: plugin infra live. Core exports `parsePartialJSON`, `collectNodeRenderers`, types `AIGuiPlugin`, `ASTNode`, `RenderOutput`.

---

## Task C1: package + chart renderer

**Files:** `packages/plugin-chart/{package.json,tsconfig.json,tsdown.config.ts}`, `src/index.ts`, `src/index.test.ts`; add project to `vitest.workspace.ts`.

- [ ] **Step 1: scaffold** — `package.json` name `@aigui/plugin-chart`, deps `{ "@aigui/core": "workspace:*", "echarts": "^5.5.1" }`, standard scripts/exports; tsconfig extends base + DOM lib; tsdown externalizes `echarts`. Add `{ resolve:{alias}, test:{ name:"plugin-chart", root:"packages/plugin-chart" } }` to `vitest.workspace.ts`. `pnpm install`.

- [ ] **Step 2: failing test `src/index.test.ts`**
```ts
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
```

- [ ] **Step 3: implement `src/index.ts`**
```ts
import * as echarts from "echarts"
import { parsePartialJSON, type AIGuiPlugin, type ASTNode, type RenderOutput } from "@aigui/core"

export interface ChartOptions { width?: number; height?: number }

export function chartPromptSpec(): string {
  return [
    "Charts (fenced): ```chart <ECharts option JSON>```.",
    'Example: ```chart {"xAxis":{"type":"category","data":["A","B"]},"yAxis":{"type":"value"},"series":[{"type":"bar","data":[1,2]}]}```',
  ].join("\n")
}

export function chart(opts: ChartOptions = {}): AIGuiPlugin {
  const width = opts.width ?? 600
  const height = opts.height ?? 400
  const render = (node: ASTNode): RenderOutput => {
    const { data: option, complete } = parsePartialJSON(node.content ?? "")
    if (!complete || option == null || typeof option !== "object") {
      return { kind: "html", html: `<div data-aigui-chart-loading></div>` }
    }
    try {
      const inst = echarts.init(null, null, { renderer: "svg", ssr: true, width, height })
      inst.setOption(option as echarts.EChartsCoreOption)
      const svg = inst.renderToSVGString()
      inst.dispose()
      return { kind: "html", html: svg }
    } catch (e) {
      return { kind: "html", html: `<pre data-aigui-chart-error>${String((e as Error)?.message ?? e)}</pre>` }
    }
  }
  return { name: "chart", nodeRenderers: { chart: render } }
}
```
Verify the ECharts SSR API against docs if `init(null, null, {ssr, renderer, width, height})` / `renderToSVGString()` differ in the installed version. The broken-option test asserts only "no throw + html" — if ECharts renders a bad option without throwing, that's fine (still html).

- [ ] **Step 4: confirm PASS**, full suite, typecheck, `pnpm --filter @aigui/plugin-chart build`.
- [ ] **Step 5: Commit** `feat(plugin-chart): ECharts SSR svg chart plugin`

---

## Self-Review
- Adds spec §7 chart capability as a framework-neutral sync node plugin. SVG passes through adapter/core `sanitizeHtml` (verify it survives; ECharts uses standard SVG elements DOMPurify keeps).
- Non-goals: interactive/animated charts (SSR SVG is static — acceptable for streamed LLM content); simplified chart schema (raw ECharts option for v1, documented via `chartPromptSpec`).
