# Plugin Infrastructure Implementation Plan (sub-project 5a)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Activate the plugin machinery end to end: core applies plugins to the parser + registry and exposes their `nodeRenderers`; all three adapters dispatch to plugin node renderers and translate the framework-neutral `RenderOutput` (`html` / `element` / `card`), including **async** renderers via a placeholder-then-swap pattern. Verified with a tiny in-repo fake plugin — no third-party libs yet (those are plan 5b).

**Architecture:** A plugin claims a node type by exposing `nodeRenderers[type]`. The core parser routes a fenced block whose info matches a plugin type to a `{ type }` node, and renders any other unknown top-level markdown-it token (from `extendParser`) to an `html` node. Each adapter, before its built-in switch, checks the plugin renderer map for `node.type`; the renderer returns `RenderOutput | Promise<RenderOutput>`, which the adapter translates into framework output. Async results render a placeholder first, then swap in.

**Tech Stack:** existing (TS, tsdown, Vitest). Touches `@ai-gui/core`, `@ai-gui/react`, `@ai-gui/vue`, `@ai-gui/vanilla`.

Prereq: 4 packages built & green (105 tests). Core exports `Renderer`, `createParser`, `sanitizeHtml`, `AIGuiPlugin`, `RenderOutput`, `NodeRenderer`, `ASTNode`. `AIGuiPlugin = { name, extendParser?, cards?, nodeRenderers?, isBlockComplete?, css? }`. `RenderOutput = {kind:'html',html} | {kind:'element',tag,props?,children?} | {kind:'card',type,data}`.

---

## Task P1 (core): apply plugins in parser + Renderer

**Files:** `packages/core/src/parser.ts`, `packages/core/src/renderer.ts`, `packages/core/src/types.ts`, tests.

Behavior:
- `createParser({ registry, plugins })`: run each `plugin.extendParser?.(md)`. Build a set of plugin node types = union of all `Object.keys(plugin.nodeRenderers ?? {})`.
- Fence routing: for a fence with info `X` — if `X.startsWith("card:")` → card node (unchanged); else if `X` is a plugin node type → `{ key, type: X, content: t.content, attrs: {info: X} }`; else → code node (unchanged).
- Unknown top-level tokens: replace the current "drop" behavior for any leftover top-level token (no `_open`, not already handled) with rendering it via `md.renderer.render([t], md.options, {})` into an `{ type: "html", content }` node. (This makes `extendParser` block tokens like `math_block` render through the plugin's markdown-it renderer.) Keep existing hr/code_block/html_block explicit handling.
- `Renderer`: accept `options.plugins`; register every `plugin.cards` into the registry (create a `CardRegistry` if none supplied and cards exist); pass `plugins` to `createParser`. Expose the merged plugin `nodeRenderers` via a public getter `getNodeRenderer(type): NodeRenderer | undefined` on `Renderer` AND export a standalone helper so adapters that build their own context can resolve renderers. Simplest: add `collectNodeRenderers(plugins): Record<string, NodeRenderer>` exported from core, used by both Renderer and adapters.

- [ ] **Step 1: failing tests** (`packages/core/src/parser.test.ts` + a new `packages/core/src/plugin.test.ts`)
```ts
// plugin.test.ts
import { describe, expect, it } from "vitest"
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
    const map = collectNodeRenderers([fakeFence])
    expect(typeof map.widget).toBe("function")
  })
  it("extendParser block tokens render to html nodes", () => {
    const plugin: AIGuiPlugin = {
      name: "hr2",
      extendParser: (md) => { md.block.ruler.before("fence", "hr2", (state, start, _end, silent) => {
        const line = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start])
        if (line !== "@@@") return false
        if (silent) return true
        const token = state.push("hr2_block", "", 0); token.content = "X"; token.map = [start, start + 1]; token.block = true
        state.line = start + 1; return true
      })
      ;(md.renderer.rules as any).hr2_block = () => "<div class='hr2'>X</div>" },
    }
    const parse = createParser({ plugins: [plugin] })
    const nodes = parse("@@@")
    expect(nodes.some((n) => n.type === "html" && (n.content ?? "").includes("hr2"))).toBe(true)
  })
})
```
Also add to `renderer.test.ts`:
```ts
it("registers plugin cards into the registry", () => {
  const cards = [{ type: "poll", description: "p" }]
  const registry = new (require("./card-registry").CardRegistry)()
  const r = new Renderer({ registry, plugins: [{ name: "pl", cards }] })
  r.push("hi")
  expect(registry.has("poll")).toBe(true)
})
```
(Use an ESM import for CardRegistry at the top instead of `require` if the file is ESM — adjust to the file's style.)

- [ ] **Step 2: confirm FAIL**
- [ ] **Step 3: implement**
  - New `packages/core/src/plugins.ts`:
    ```ts
    import type { AIGuiPlugin, NodeRenderer } from "./types"
    export function collectNodeRenderers(plugins: AIGuiPlugin[] = []): Record<string, NodeRenderer> {
      const map: Record<string, NodeRenderer> = {}
      for (const p of plugins) for (const [k, v] of Object.entries(p.nodeRenderers ?? {})) map[k] = v
      return map
    }
    export function pluginNodeTypes(plugins: AIGuiPlugin[] = []): Set<string> {
      return new Set(Object.keys(collectNodeRenderers(plugins)))
    }
    ```
  - `parser.ts`: accept `plugins` in `ParserOptions`; run `extendParser`; compute `pluginTypes`; fence routing + unknown-token→html as described.
  - `renderer.ts`: accept `plugins`; register plugin cards into `options.registry` (if present); pass plugins to `createParser`. Keep `onPatch(patches, nodes)`.
  - Export `collectNodeRenderers`, `pluginNodeTypes` from `index.ts`.
- [ ] **Step 4: confirm PASS**, full suite + typecheck.
- [ ] **Step 5: Commit** `feat(core): apply plugins in parser + Renderer (extendParser, plugin fences, cards, nodeRenderers)`

---

## Task P2 (react): plugin node dispatch + RenderOutput translation + async

**Files:** `packages/react/src/render-output.tsx` (new), `packages/react/src/render-node.tsx` (modify), `packages/react/src/use-ai-renderer.ts` + `ai-renderer.tsx` (thread plugins), tests.

- [ ] **Step 1: failing test** `packages/react/src/render-output.test.tsx`
```tsx
// @vitest-environment jsdom
import { render, act } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { ASTNode, AIGuiPlugin } from "@ai-gui/core"
import { renderNode } from "./render-node"

const syncPlugin: AIGuiPlugin = { name: "s", nodeRenderers: { widget: () => ({ kind: "element", tag: "span", props: { className: "w" }, children: [] }) } }
const htmlPlugin: AIGuiPlugin = { name: "h", nodeRenderers: { box: () => ({ kind: "html", html: "<i>boxed</i>" }) } }
const asyncPlugin: AIGuiPlugin = { name: "a", nodeRenderers: { chart: () => Promise.resolve({ kind: "html", html: "<b>chart</b>" }) } }

describe("react plugin rendering", () => {
  it("renders a sync element RenderOutput", () => {
    const node: ASTNode = { key: "0:widget", type: "widget", content: "x" }
    const { container } = render(<>{renderNode(node, { plugins: [syncPlugin] })}</>)
    expect(container.querySelector("span.w")).toBeTruthy()
  })
  it("renders a sync html RenderOutput", () => {
    const node: ASTNode = { key: "0:box", type: "box", content: "x" }
    const { container } = render(<>{renderNode(node, { plugins: [htmlPlugin] })}</>)
    expect(container.querySelector("i")?.textContent).toBe("boxed")
  })
  it("renders an async RenderOutput after resolution (placeholder first)", async () => {
    const node: ASTNode = { key: "0:chart", type: "chart", content: "x" }
    const { container } = render(<>{renderNode(node, { plugins: [asyncPlugin] })}</>)
    expect(container.querySelector("[data-aigui-async-pending]")).toBeTruthy()
    await act(async () => { await Promise.resolve() })
    expect(container.querySelector("b")?.textContent).toBe("chart")
  })
})
```
- [ ] **Step 2: confirm FAIL**
- [ ] **Step 3: implement**
  - `render-output.tsx`: `renderOutput(out: RenderOutput, key?): ReactNode` — html → `<div dangerouslySetInnerHTML>` (sanitized via core `sanitizeHtml`); element → `createElement(tag, props, children.map(renderOutput))`; card → reuse card path (pass through a callback or minimal: render JSON fallback if no registry). Plus an `<AsyncOutput promise={} />` component: `useState<RenderOutput|null>(null)` + `useEffect` to resolve; render `data-aigui-async-pending` placeholder until resolved, then `renderOutput(resolved)`.
  - `render-node.tsx`: add `plugins?: AIGuiPlugin[]` to `RenderContext`. At the top of `renderNode`, resolve `const r = collectNodeRenderers(ctx.plugins)[node.type]`; if present, call `r(node)`; if it's a Promise → `<AsyncOutput promise={...} />`; else → `renderOutput(result)`. Otherwise fall through to the existing switch.
  - `use-ai-renderer.ts`: pass `plugins` through to `Renderer` (already spread via options) and include `plugins` in the returned/threaded context. `ai-renderer.tsx`: add `plugins` prop, pass to hook options and to `RenderContext`.
- [ ] **Step 4: confirm PASS** + typecheck.
- [ ] **Step 5: Commit** `feat(react): plugin node dispatch + RenderOutput translation (sync + async)`

---

## Task P3 (vue): same as P2, Vue-flavored

**Files:** `packages/vue/src/render-output.ts` (new), `render-node.ts` (modify), `use-ai-renderer.ts` + `ai-renderer.ts` (thread plugins), tests.

- [ ] **Step 1: failing test** `packages/vue/src/render-output.test.ts` — mirror P2 with `mount` + `nextTick`; async test: placeholder `[data-aigui-async-pending]` present before `await nextTick()`/flush, resolved content after.
- [ ] **Step 2: FAIL**
- [ ] **Step 3: implement**
  - `render-output.ts`: `renderOutput(out): VNode` — html → `h("div", { innerHTML: sanitizeHtml(html) })`; element → `h(tag, props, children.map(renderOutput))`; card → JSON fallback. `AsyncOutput` component: `defineComponent` with `ref<RenderOutput|null>`, resolves the passed promise in `setup`/`watchEffect`; renders `data-aigui-async-pending` placeholder then resolved output.
  - `render-node.ts`: add `plugins` to `RenderContext`; dispatch to plugin renderer (sync → `renderOutput`, promise → `h(AsyncOutput, { promise })`) before the switch.
  - thread `plugins` through composable + component props.
- [ ] **Step 4: PASS** + typecheck.
- [ ] **Step 5: Commit** `feat(vue): plugin node dispatch + RenderOutput translation (sync + async)`

---

## Task P4 (vanilla): same, DOM-flavored

**Files:** `packages/vanilla/src/render-output.ts` (new), `render-node-dom.ts` (modify), `create-renderer.ts` (thread plugins), tests.

- [ ] **Step 1: failing test** `packages/vanilla/src/render-output.test.ts` — sync element/html into DOM; async: `renderNodeToElement` returns a placeholder element with `data-aigui-async-pending`, and after the microtask the container has swapped in the resolved output. (For async, `renderNodeToElement` returns the placeholder synchronously and kicks off the promise; on resolve it calls `placeholder.replaceWith(resolvedEl)`.)
- [ ] **Step 2: FAIL**
- [ ] **Step 3: implement**
  - `render-output.ts`: `renderOutputToElement(out): HTMLElement` — html → div innerHTML sanitized; element → createElement + recursive children; card → `<pre>` JSON fallback.
  - `render-node-dom.ts`: add `plugins` to `DomRenderContext`; before the switch, look up plugin renderer for `node.type`; sync → `renderOutputToElement`; promise → create a placeholder `<div data-aigui-async-pending>` and `promise.then((out) => placeholder.replaceWith(renderOutputToElement(out)))`, return placeholder.
  - thread `plugins` through `createRenderer` options + context.
- [ ] **Step 4: PASS** + full suite + typecheck + build.
- [ ] **Step 5: Commit** `feat(vanilla): plugin node dispatch + RenderOutput translation (sync + async)`

---

## Self-Review
- Covers spec §7.1–7.5 plugin contract activation: `extendParser`, `cards`, `nodeRenderers`, `RenderOutput` (html/element/card), sync + async, across all three adapters. `isBlockComplete` is exposed in the type but eager rendering is used for v1 (documented); `css` is consumer-imported (no code path needed).
- All plugin `html` outputs pass through core `sanitizeHtml` in every adapter.
- Precedence: plugin renderer for a node type wins over the built-in switch (so a plugin can override `code`, needed by plugin-highlight in 5b).

## Non-goals (this plan)
- Real third-party plugins (5b).
- Streaming-completeness gating of plugin blocks (eager render for v1).
