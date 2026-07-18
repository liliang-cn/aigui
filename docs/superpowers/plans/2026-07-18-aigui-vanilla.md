# @aigui/vanilla Implementation Plan (sub-project 3: no-framework adapter)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** A zero-framework adapter: `createRenderer(el, options)` streams LLM output straight into the DOM, rendering cards via user-supplied element factories and firing `onCardAction`. Proves the framework-agnostic claim.

**Architecture:** Wraps core `Renderer`. On each `onPatch(patches, nodes)` it runs a small keyed DOM reconciler: maintain `key → {el, node}`, create/update/remove elements by key, and order them to match the AST snapshot. Text/inline via `innerHTML` (already sanitized by core), code as `<pre><code>` text, cards via `registry.getRender(type)` returning an `HTMLElement`.

**Tech Stack:** TypeScript, tsdown, Vitest + jsdom. No framework deps. Depends on `@aigui/core` (workspace).

Prereq: core is built; exports `Renderer`, `CardRegistry`, `ASTNode`, `Patch`, `RendererOptions`. Vitest aliases `@aigui/core` to source. Tests: `pnpm exec vitest run <name>`.

---

## File Structure
```
packages/vanilla/
  package.json  tsconfig.json  tsdown.config.ts
  src/
    render-node-dom.ts   # renderNodeToElement(node, ctx) -> HTMLElement
    reconcile.ts         # reconcile(container, nodes, ctx, state)
    create-renderer.ts   # createRenderer(el, options)
    index.ts
  src/*.test.ts
```

---

## Task V1: package scaffold

**Files:** `packages/vanilla/{package.json,tsconfig.json,tsdown.config.ts}`, `src/index.ts` (stub), `src/smoke.test.ts`

- [ ] **Step 1** `package.json`:
```json
{
  "name": "@aigui/vanilla",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "require": "./dist/index.cjs" } },
  "files": ["dist"],
  "scripts": { "build": "tsdown", "typecheck": "tsc --noEmit" },
  "dependencies": { "@aigui/core": "workspace:*" }
}
```
- [ ] **Step 2** `tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "rootDir": "src", "lib": ["ES2022", "DOM", "DOM.Iterable"] }, "include": ["src"] }
```
- [ ] **Step 3** `tsdown.config.ts`:
```ts
import { defineConfig } from "tsdown"
export default defineConfig({ entry: ["src/index.ts"], format: ["esm", "cjs"], dts: true, clean: true })
```
- [ ] **Step 4** `src/index.ts`: `export {}`
- [ ] **Step 5** `src/smoke.test.ts`:
```ts
// @vitest-environment jsdom
import { expect, it } from "vitest"
it("has a dom", () => { const d = document.createElement("div"); d.textContent = "hi"; expect(d.textContent).toBe("hi") })
```
- [ ] **Step 6** Add `"vanilla"` project to `vitest.workspace.ts` (a `{ resolve: { alias }, test: { name: "vanilla", root: "packages/vanilla" } }` entry using the same `alias`).
- [ ] **Step 7** `pnpm install && pnpm exec vitest run smoke` (vanilla smoke passes) and `pnpm --filter @aigui/vanilla build` (emits dist).
- [ ] **Step 8** Commit: `chore: @aigui/vanilla package scaffold`

---

## Task V2: renderNodeToElement

**Files:** `src/render-node-dom.ts`, `src/render-node-dom.test.ts`

Card render contract for vanilla: `registry.getRender(type)` returns `(data, api) => HTMLElement`, where `api = { onAction(a) }`.

- [ ] **Step 1: failing test**
```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import type { ASTNode } from "@aigui/core"
import { CardRegistry } from "@aigui/core"
import { renderNodeToElement } from "./render-node-dom"

describe("renderNodeToElement", () => {
  it("renders a paragraph's html", () => {
    const el = renderNodeToElement({ key: "0:p", type: "paragraph", tag: "p", html: "a <strong>b</strong>" }, {})
    expect(el.tagName).toBe("P"); expect(el.querySelector("strong")?.textContent).toBe("b")
  })
  it("renders a heading tag", () => {
    const el = renderNodeToElement({ key: "0:h", type: "heading", tag: "h3", html: "T" }, {})
    expect(el.tagName).toBe("H3")
  })
  it("renders code text", () => {
    const el = renderNodeToElement({ key: "0:c", type: "code", content: "x=1", attrs: { lang: "ts" } }, {})
    expect(el.querySelector("code")?.textContent).toBe("x=1")
  })
  it("renders an incomplete card as a loading skeleton", () => {
    const el = renderNodeToElement({ key: "0:card", type: "card", card: { type: "f", data: {}, complete: false, valid: false } }, {})
    expect(el.hasAttribute("data-aigui-card-loading")).toBe(true)
  })
  it("renders a complete-but-invalid card as raw fallback (not skeleton)", () => {
    const el = renderNodeToElement({ key: "0:card", type: "card", card: { type: "f", data: { a: 1 }, complete: true, valid: false } }, {})
    expect(el.hasAttribute("data-aigui-card-loading")).toBe(false)
    expect(el.hasAttribute("data-aigui-card-invalid")).toBe(true)
    expect(el.textContent).toContain("a")
  })
  it("renders a registered card element and routes onAction", () => {
    const registry = new CardRegistry()
    registry.register({ type: "poll", description: "p", render: (data: any, api: any) => { const b = document.createElement("button"); b.textContent = "vote"; b.onclick = () => api.onAction({ type: "vote", params: data }); return b } })
    const onCardAction = vi.fn()
    const el = renderNodeToElement({ key: "0:card", type: "card", card: { type: "poll", data: { q: "x" }, complete: true, valid: true } }, { registry, onCardAction })
    el.querySelector("button")!.click()
    expect(onCardAction).toHaveBeenCalledWith({ type: "vote", params: { q: "x" }, cardType: "poll" })
  })
})
```
- [ ] **Step 2: confirm FAIL**
- [ ] **Step 3: implement `render-node-dom.ts`**
```ts
import { sanitizeHtml, type ASTNode, type CardRegistry } from "@aigui/core"

export interface DomRenderContext {
  registry?: CardRegistry
  onCardAction?: (action: { type: string; params?: unknown; cardType: string }) => void
}

export function renderNodeToElement(node: ASTNode, ctx: DomRenderContext): HTMLElement {
  switch (node.type) {
    case "heading": { const el = document.createElement(node.tag ?? "h1"); el.innerHTML = node.html ?? ""; return el }
    case "paragraph": { const el = document.createElement("p"); el.innerHTML = node.html ?? ""; return el }
    case "code": {
      const pre = document.createElement("pre"); if (node.attrs?.lang) pre.setAttribute("data-lang", node.attrs.lang)
      const code = document.createElement("code"); code.textContent = node.content ?? ""; pre.appendChild(code); return pre
    }
    case "hr": return document.createElement("hr")
    case "html": { const el = document.createElement("div"); el.innerHTML = node.content ?? ""; return el }
    case "card": return renderCardElement(node, ctx)
    default: { const el = document.createElement("div"); el.innerHTML = node.html ?? sanitizeHtml(node.content ?? ""); return el }
  }
}

function renderCardElement(node: ASTNode, ctx: DomRenderContext): HTMLElement {
  const card = node.card
  if (!card) return document.createElement("div")
  if (!card.complete) { const el = document.createElement("div"); el.setAttribute("data-aigui-card-loading", ""); el.setAttribute("data-card-type", card.type); return el }
  if (!card.valid) { const pre = document.createElement("pre"); pre.setAttribute("data-aigui-card-invalid", ""); const c = document.createElement("code"); c.textContent = JSON.stringify(card.data, null, 2); pre.appendChild(c); return pre }
  const factory = ctx.registry?.getRender(card.type) as
    | ((data: unknown, api: { onAction: (a: { type: string; params?: unknown }) => void }) => HTMLElement)
    | undefined
  if (!factory) { const pre = document.createElement("pre"); pre.setAttribute("data-aigui-card-fallback", ""); const c = document.createElement("code"); c.textContent = JSON.stringify(card.data, null, 2); pre.appendChild(c); return pre }
  return factory(card.data, { onAction: (a) => ctx.onCardAction?.({ ...a, cardType: card.type }) })
}
```
- [ ] **Step 4: confirm PASS**; typecheck.
- [ ] **Step 5: Commit** `feat(vanilla): renderNodeToElement (dom node factory)`

---

## Task V3: reconcile + createRenderer + exports

**Files:** `src/reconcile.ts`, `src/create-renderer.ts`, `src/index.ts`, `src/create-renderer.test.ts`

- [ ] **Step 1: failing test `create-renderer.test.ts`**
```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { CardRegistry } from "@aigui/core"
import { createRenderer } from "./create-renderer"

describe("createRenderer", () => {
  it("push renders into the element", () => {
    const el = document.createElement("div")
    const r = createRenderer(el)
    r.push("# Hi")
    expect(el.querySelector("h1")?.textContent).toBe("Hi")
  })
  it("streaming updates in place (heading node reused, content grows)", () => {
    const el = document.createElement("div")
    const r = createRenderer(el)
    r.push("# Ti"); const first = el.querySelector("h1")
    r.push("tle"); const second = el.querySelector("h1")
    expect(second?.textContent).toBe("Title")
    expect(first).toBe(second) // same element instance reused via keyed reconcile
  })
  it("reset clears the element", () => {
    const el = document.createElement("div")
    const r = createRenderer(el)
    r.push("hello"); r.reset()
    expect(el.children.length).toBe(0)
  })
  it("renders a card and routes onCardAction", () => {
    const registry = new CardRegistry()
    registry.register({ type: "poll", description: "p", render: (data: any, api: any) => { const b = document.createElement("button"); b.onclick = () => api.onAction({ type: "vote", params: data }); return b } })
    const onCardAction = vi.fn()
    const el = document.createElement("div")
    const r = createRenderer(el, { registry, onCardAction })
    r.push('```card:poll\n{"q":"x"}\n```')
    el.querySelector("button")!.click()
    expect(onCardAction).toHaveBeenCalledWith({ type: "vote", params: { q: "x" }, cardType: "poll" })
  })
})
```
- [ ] **Step 2: confirm FAIL**
- [ ] **Step 3: implement `reconcile.ts`** — keyed DOM reconcile from an AST snapshot:
```ts
import type { ASTNode } from "@aigui/core"
import { renderNodeToElement, type DomRenderContext } from "./render-node-dom"

export interface ReconcileState { els: Map<string, { el: HTMLElement; hash: string }> }

export function createReconcileState(): ReconcileState { return { els: new Map() } }

export function reconcile(container: HTMLElement, nodes: ASTNode[], ctx: DomRenderContext, state: ReconcileState): void {
  const nextKeys = new Set(nodes.map((n) => n.key))
  // remove stale
  for (const [key, entry] of state.els) {
    if (!nextKeys.has(key)) { entry.el.remove(); state.els.delete(key) }
  }
  // create/update and order
  let prev: HTMLElement | null = null
  for (const node of nodes) {
    const hash = JSON.stringify(node)
    let entry = state.els.get(node.key)
    if (!entry) {
      const el = renderNodeToElement(node, ctx); entry = { el, hash }; state.els.set(node.key, entry)
    } else if (entry.hash !== hash) {
      const el = renderNodeToElement(node, ctx); entry.el.replaceWith(el); entry.el = el; entry.hash = hash
    }
    // ensure position: insert after prev
    const ref = prev ? prev.nextSibling : container.firstChild
    if (entry.el !== ref) container.insertBefore(entry.el, ref)
    prev = entry.el
  }
}
```
- [ ] **Step 4: implement `create-renderer.ts`**
```ts
import { Renderer, type ASTNode, type Patch, type RendererOptions } from "@aigui/core"
import { type DomRenderContext } from "./render-node-dom"
import { createReconcileState, reconcile } from "./reconcile"

export interface CreateRendererOptions extends Omit<RendererOptions, "onPatch"> {
  onCardAction?: DomRenderContext["onCardAction"]
}
export interface VanillaRenderer {
  push: (chunk: string) => void
  feed: (source: AsyncIterable<string> | ReadableStream) => Promise<void>
  reset: () => void
  destroy: () => void
}

export function createRenderer(el: HTMLElement, options: CreateRendererOptions = {}): VanillaRenderer {
  const { onCardAction, ...rendererOpts } = options
  const ctx: DomRenderContext = { registry: options.registry, onCardAction }
  const state = createReconcileState()
  const renderer = new Renderer({
    ...rendererOpts,
    onPatch: (_patches: Patch[], nodes: ASTNode[]) => reconcile(el, nodes, ctx, state),
  })
  return {
    push: (c) => renderer.push(c),
    feed: (s) => renderer.feed(s as never),
    reset: () => { renderer.reset(); state.els.clear(); el.replaceChildren() },
    destroy: () => { state.els.clear(); el.replaceChildren() },
  }
}
```
- [ ] **Step 5: `index.ts`**
```ts
export { createRenderer } from "./create-renderer"
export type { CreateRendererOptions, VanillaRenderer } from "./create-renderer"
export { renderNodeToElement } from "./render-node-dom"
export type { DomRenderContext } from "./render-node-dom"
```
- [ ] **Step 6: confirm PASS**, full suite + typecheck + build.
- [ ] **Step 7: Commit** `feat(vanilla): keyed DOM reconcile + createRenderer + exports`

---

## Self-Review
- Spec §8 vanilla API (`createRenderer(el, { registry, onCardAction })`, `push`/`feed`/`reset`) → V3. Card states (skeleton/invalid/fallback, §6.1/6.3) → V2. Sanitization → inherited from core (html/content pre-sanitized); default branch sanitizes. §6.5 onCardAction → V2/V3.
- Non-goals: plugin `nodeRenderers`/`RenderOutput` (plugins sub-project); styling (headless).
