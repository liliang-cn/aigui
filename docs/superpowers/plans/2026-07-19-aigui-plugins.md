# Real Plugins Implementation Plan (sub-project 5b)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Ship the four plugin packages on top of the now-live plugin infrastructure: `@ai-gui/plugin-katex` (sync), `@ai-gui/plugin-highlight` (Shiki, async), `@ai-gui/plugin-mermaid` (async), `@ai-gui/plugin-primitives` (framework-neutral `RenderOutput` elements).

**Architecture:** Each plugin is a package exporting a factory returning an `AIGuiPlugin`. Two integration styles: (1) **markdown-it renderer** plugins (katex) hook `extendParser` and render to HTML during parse (flows through core's sanitized `html` pipeline); (2) **node renderer** plugins (highlight, mermaid, primitives) claim a node type via `nodeRenderers[type]` and return `RenderOutput | Promise<RenderOutput>`, which the adapters (5a) translate. Highlight/mermaid are async; primitives is sync and emits framework-neutral `element` descriptors.

**Tech Stack:** existing + `katex`, `shiki`, `mermaid`. Vitest runs in Node/jsdom. Each plugin package: tsdown, externalizes its heavy dep.

Prereq: 5a done. Core exports `AIGuiPlugin`, `RenderOutput`, `NodeRenderer` (`(node)=>RenderOutput|Promise<RenderOutput>`), `ASTNode`, `parsePartialJSON`, `sanitizeHtml`, `collectNodeRenderers`. Adapters dispatch `nodeRenderers[node.type]` (async → placeholder→swap). Fence `X` matching a plugin node type becomes `{ type: X, content }`.

**Implementers: verify current library APIs via context7 / official docs before coding** (Shiki `createHighlighter`/`codeToHtml`, KaTeX `renderToString`, Mermaid `initialize`/`render`). APIs below are best-effort and may need adjustment.

---

## Task PL1: @ai-gui/plugin-primitives (sync, framework-neutral)

Simplest and fully testable in Node. Provides node renderers for fenced primitives: `list`, `table`, `key-value`, `layout`. Each parses the fence body as JSON (tolerantly, via `parsePartialJSON`) and returns a `RenderOutput` `element` tree. Also exports a `primitivesPromptSpec()` string for the LLM.

**Files:** `packages/plugin-primitives/{package.json,tsconfig.json,tsdown.config.ts}`, `src/index.ts`, `src/index.test.ts`; add project to `vitest.workspace.ts`.

- [ ] **Step 1: package.json** (name `@ai-gui/plugin-primitives`, deps `{ "@ai-gui/core": "workspace:*" }`, scripts build/typecheck, tsdown ESM+CJS+dts). tsconfig extends base with DOM lib. Add `{ resolve:{alias}, test:{ name:"plugin-primitives", root:"packages/plugin-primitives" } }` to `vitest.workspace.ts`.

- [ ] **Step 2: failing test `src/index.test.ts`**
```ts
import { describe, expect, it } from "vitest"
import { collectNodeRenderers, type RenderOutput } from "@ai-gui/core"
import { primitives } from "./index"

const rendererFor = (type: string) => collectNodeRenderers([primitives()])[type]

describe("plugin-primitives", () => {
  it("renders a list primitive to an element RenderOutput", () => {
    const out = rendererFor("list")({ key: "0:list", type: "list", content: '{"items":["a","b"]}' }) as RenderOutput
    expect(out.kind).toBe("element")
    if (out.kind === "element") { expect(out.tag).toBe("ul"); expect(out.children?.length).toBe(2) }
  })
  it("renders a key-value primitive", () => {
    const out = rendererFor("key-value")({ key: "0:kv", type: "key-value", content: '{"pairs":{"a":"1"}}' }) as RenderOutput
    expect(out.kind).toBe("element")
  })
  it("renders a table primitive", () => {
    const out = rendererFor("table")({ key: "0:t", type: "table", content: '{"headers":["h"],"rows":[["x"]]}' }) as RenderOutput
    expect(out.kind).toBe("element")
    if (out.kind === "element") expect(out.tag).toBe("table")
  })
  it("tolerates incomplete JSON (streaming) without throwing", () => {
    const out = rendererFor("list")({ key: "0:list", type: "list", content: '{"items":["a"' }) as RenderOutput
    expect(out.kind).toBe("element")
  })
  it("exposes a prompt spec mentioning the primitive fence types", () => {
    const spec = (primitives() as any).promptSpec ?? require("./index").primitivesPromptSpec()
    expect(String(spec)).toContain("list")
  })
})
```

- [ ] **Step 3: implement `src/index.ts`**
```ts
import { parsePartialJSON, type AIGuiPlugin, type ASTNode, type RenderOutput } from "@ai-gui/core"

const el = (tag: string, props: Record<string, unknown> | undefined, children: RenderOutput[]): RenderOutput => ({ kind: "element", tag, props, children })
const text = (s: string): RenderOutput => ({ kind: "html", html: escapeHtml(s) })
function escapeHtml(s: string): string { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }
function data(node: ASTNode): any { return parsePartialJSON(node.content ?? "").data ?? {} }

function renderList(node: ASTNode): RenderOutput {
  const items: unknown[] = data(node).items ?? []
  return el("ul", { "data-aigui-primitive": "list" }, items.map((i) => el("li", undefined, [text(String(i))])))
}
function renderKeyValue(node: ASTNode): RenderOutput {
  const pairs: Record<string, unknown> = data(node).pairs ?? {}
  return el("dl", { "data-aigui-primitive": "key-value" }, Object.entries(pairs).flatMap(([k, v]) => [el("dt", undefined, [text(k)]), el("dd", undefined, [text(String(v))])]))
}
function renderTable(node: ASTNode): RenderOutput {
  const d = data(node); const headers: unknown[] = d.headers ?? []; const rows: unknown[][] = d.rows ?? []
  const thead = el("thead", undefined, [el("tr", undefined, headers.map((h) => el("th", undefined, [text(String(h))])))])
  const tbody = el("tbody", undefined, rows.map((r) => el("tr", undefined, (r ?? []).map((c) => el("td", undefined, [text(String(c))])))))
  return el("table", { "data-aigui-primitive": "table" }, [thead, tbody])
}
function renderLayout(node: ASTNode): RenderOutput {
  const d = data(node); const dir = d.direction === "row" ? "row" : "column"; const items: string[] = d.items ?? []
  return el("div", { "data-aigui-primitive": "layout", style: `display:flex;flex-direction:${dir}` }, items.map((i) => el("div", undefined, [text(String(i))])))
}

export function primitivesPromptSpec(): string {
  return [
    "Primitive UI blocks (fenced): ```list {\"items\":[...]}```; ```table {\"headers\":[...],\"rows\":[[...]]}```;",
    "```key-value {\"pairs\":{\"k\":\"v\"}}```; ```layout {\"direction\":\"row|column\",\"items\":[...]}```.",
  ].join("\n")
}

export function primitives(): AIGuiPlugin {
  return {
    name: "primitives",
    nodeRenderers: { list: renderList, "key-value": renderKeyValue, table: renderTable, layout: renderLayout },
  }
}
```

- [ ] **Step 4: confirm PASS**, typecheck, build.
- [ ] **Step 5: Commit** `feat(plugin-primitives): framework-neutral primitive fence renderers`

---

## Task PL2: @ai-gui/plugin-katex (sync, markdown-it)

Renders `$...$` (inline) and `$$...$$` (block) via KaTeX during parse. Uses `extendParser`. KaTeX renders with `output: "html"` (no MathML) so DOMPurify keeps it.

**Files:** `packages/plugin-katex/*`, deps `{ "@ai-gui/core": "workspace:*", "katex": "^0.16.11" }`. Add to `vitest.workspace.ts`. Ships `css: katexCssString` (import KaTeX's CSS text or instruct consumer to import `katex/dist/katex.min.css`).

- [ ] **Step 1: failing test `src/index.test.ts`**
```ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { Renderer } from "@ai-gui/core"
import { katex } from "./index"

function collect(md: string) {
  const nodes: any[] = []
  const r = new Renderer({ plugins: [katex()], onPatch: (_p, n) => { nodes.length = 0; nodes.push(...n) } })
  r.push(md)
  return nodes
}

describe("plugin-katex", () => {
  it("renders inline math into a paragraph's html", () => {
    const nodes = collect("mass $E=mc^2$ done")
    const p = nodes.find((n) => n.type === "paragraph")
    expect(p?.html ?? "").toContain("katex")
  })
  it("renders block math", () => {
    const nodes = collect("$$\\int x\\,dx$$")
    const html = nodes.map((n) => n.html ?? n.content ?? "").join("")
    expect(html).toContain("katex")
  })
})
```

- [ ] **Step 2: FAIL**
- [ ] **Step 3: implement `src/index.ts`** — verify KaTeX + markdown-it integration via docs. Reference approach: register an inline rule for `$...$` and a block rule for `$$...$$` that call `katex.renderToString(expr, { throwOnError: false, output: "html", displayMode })`, and a renderer rule outputting that HTML. (You may vendor a minimal known-good markdown-it-katex rule; do NOT add a separate markdown-it-katex npm dep unless it is actively maintained — prefer a small in-package rule calling `katex` directly.) Export `katex(): AIGuiPlugin` with `extendParser` and a `css` string (the katex stylesheet, or a doc note).
- [ ] **Step 4: PASS** (note: sanitizer must keep katex spans — if DOMPurify strips them, the plugin should document that consumers pass `sanitize`-friendly config or the plugin returns already-safe html; verify the test passes end-to-end through `Renderer`'s sanitize). typecheck, build.
- [ ] **Step 5: Commit** `feat(plugin-katex): inline/block KaTeX via markdown-it`

---

## Task PL3: @ai-gui/plugin-highlight (async, Shiki)

Overrides `code` node rendering with Shiki-highlighted HTML. Async: lazy-create a singleton highlighter, then `codeToHtml`.

**Files:** `packages/plugin-highlight/*`, deps `{ "@ai-gui/core": "workspace:*", "shiki": "^1.22.0" }`. Add to `vitest.workspace.ts`.

- [ ] **Step 1: failing test `src/index.test.ts`** (Shiki works in Node)
```ts
import { describe, expect, it } from "vitest"
import { collectNodeRenderers, type ASTNode, type RenderOutput } from "@ai-gui/core"
import { highlight } from "./index"

describe("plugin-highlight", () => {
  it("renders a code node to highlighted html (async)", async () => {
    const r = collectNodeRenderers([highlight({ themes: ["github-light"], langs: ["ts"] })]).code
    const node: ASTNode = { key: "0:c", type: "code", content: "const a = 1", attrs: { lang: "ts" } }
    const out = (await r(node)) as RenderOutput
    expect(out.kind).toBe("html")
    if (out.kind === "html") { expect(out.html).toContain("<pre"); expect(out.html).toContain("a") }
  })
  it("falls back gracefully for an unknown language", async () => {
    const r = collectNodeRenderers([highlight({ themes: ["github-light"], langs: ["ts"] })]).code
    const out = (await r({ key: "0:c", type: "code", content: "x", attrs: { lang: "unknownlang" } } as ASTNode)) as RenderOutput
    expect(out.kind).toBe("html") // renders as plain/escaped, no throw
  })
})
```

- [ ] **Step 2: FAIL**
- [ ] **Step 3: implement `src/index.ts`** — verify Shiki v1 API via docs. Reference:
```ts
import { createHighlighter, type Highlighter } from "shiki"
import { sanitizeHtml, type AIGuiPlugin, type ASTNode, type RenderOutput } from "@ai-gui/core"

export interface HighlightOptions { themes?: string[]; langs?: string[]; theme?: string }

export function highlight(opts: HighlightOptions = {}): AIGuiPlugin {
  const themes = opts.themes ?? ["github-light"]
  const langs = opts.langs ?? ["ts", "js", "json", "bash", "python", "html", "css"]
  let hlP: Promise<Highlighter> | null = null
  const getHl = () => (hlP ??= createHighlighter({ themes, langs }))

  const render = async (node: ASTNode): Promise<RenderOutput> => {
    const code = node.content ?? ""
    const lang = node.attrs?.lang && langs.includes(node.attrs.lang) ? node.attrs.lang : "text"
    try {
      const hl = await getHl()
      const html = hl.codeToHtml(code, { lang, theme: opts.theme ?? themes[0] })
      return { kind: "html", html }
    } catch {
      return { kind: "html", html: `<pre><code>${escape(code)}</code></pre>` }
    }
  }
  return { name: "highlight", nodeRenderers: { code: render } }
}
function escape(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }
```
Note: adapters sanitize plugin `html` output; Shiki `<pre class=... style=...>` should survive DOMPurify. If styles are stripped and highlighting is lost, document it (highlighting still structurally present).
- [ ] **Step 4: PASS** (Shiki loads real grammars — the test may be slow; that's fine). typecheck, build.
- [ ] **Step 5: Commit** `feat(plugin-highlight): Shiki async code highlighting`

---

## Task PL4: @ai-gui/plugin-mermaid (async)

Claims the `mermaid` fence. Async render to SVG. NOTE: Mermaid needs a browser DOM and does not fully render in jsdom — so the unit test verifies the plugin CONTRACT (async node renderer for `mermaid`, graceful error handling), not a real diagram. Real rendering is validated in the demo app later.

**Files:** `packages/plugin-mermaid/*`, deps `{ "@ai-gui/core": "workspace:*", "mermaid": "^11.4.0" }`. Add to `vitest.workspace.ts`.

- [ ] **Step 1: failing test `src/index.test.ts`**
```ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { collectNodeRenderers, type ASTNode, type RenderOutput } from "@ai-gui/core"
import { mermaid } from "./index"

describe("plugin-mermaid", () => {
  it("exposes an async node renderer for the mermaid fence", () => {
    const r = collectNodeRenderers([mermaid()]).mermaid
    expect(typeof r).toBe("function")
    const out = r({ key: "0:m", type: "mermaid", content: "graph TD; A-->B" } as ASTNode)
    expect(typeof (out as Promise<RenderOutput>).then).toBe("function")
  })
  it("resolves to an html RenderOutput and never throws (error → fallback html)", async () => {
    const r = collectNodeRenderers([mermaid()]).mermaid
    const out = (await r({ key: "0:m", type: "mermaid", content: "not a valid diagram !!!" } as ASTNode)) as RenderOutput
    expect(out.kind).toBe("html")
  })
})
```

- [ ] **Step 2: FAIL**
- [ ] **Step 3: implement `src/index.ts`** — verify Mermaid v11 API via docs. Reference:
```ts
import type { AIGuiPlugin, ASTNode, RenderOutput } from "@ai-gui/core"

export interface MermaidOptions { theme?: string }

export function mermaid(opts: MermaidOptions = {}): AIGuiPlugin {
  let initialized = false
  let counter = 0
  const render = async (node: ASTNode): Promise<RenderOutput> => {
    try {
      const m = (await import("mermaid")).default
      if (!initialized) { m.initialize({ startOnLoad: false, theme: opts.theme ?? "default" }); initialized = true }
      const id = `aigui-mermaid-${counter++}`
      const { svg } = await m.render(id, node.content ?? "")
      return { kind: "html", html: svg }
    } catch (e) {
      return { kind: "html", html: `<pre data-aigui-mermaid-error>${String((e as Error)?.message ?? e)}</pre>` }
    }
  }
  return { name: "mermaid", nodeRenderers: { mermaid: render } }
}
```
- [ ] **Step 4: PASS** (contract tests). typecheck, build. If `mermaid.render` hangs in jsdom rather than throwing, wrap with a guard or mock the import in the test — but prefer the graceful-catch approach; if it hangs, add a jsdom-safe short-circuit (e.g. if `typeof document === "undefined"` return error html) and note it.
- [ ] **Step 5: Commit** `feat(plugin-mermaid): async mermaid diagram rendering (contract-tested)`

---

## Self-Review
- Spec §7 plugins realized: katex (sync markdown-it), highlight (async node, Shiki), mermaid (async node), primitives (framework-neutral element). Each externalizes its heavy dep; core stays light.
- Sanitization: all plugin `html` passes through adapter `sanitizeHtml`. Katex/Shiki output survival is verified/documented per task.
- Non-goals: code copy button (deferred — needs cross-framework event wiring); mermaid full-render unit test (browser-only, covered by demo); primitives as registry cards (kept framework-neutral via nodeRenderers per the async/RenderOutput decision).
