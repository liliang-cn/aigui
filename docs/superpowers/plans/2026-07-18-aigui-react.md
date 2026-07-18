# @aigui/react Implementation Plan (sub-project 2: React adapter)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A thin React adapter over `@aigui/core`: a `useAIRenderer()` hook and an `<AIRenderer>` component that stream LLM output into live React elements, render cards as registered React components, and fire `onCardAction`.

**Architecture:** `@aigui/core`'s `Renderer` emits framework-agnostic `Patch[]`. The hook maintains a keyed `ASTNode[]` in React state by applying patches. A `renderNode` mapper turns each node into a React element — text/inline via sanitized HTML injection, cards via the registry's React component, code as `<pre><code>`. Buttons in cards dispatch `onCardAction`.

**Tech Stack:** React 18+, TypeScript, tsdown (Rolldown/Oxc), Vitest + @testing-library/react + jsdom.

Prereq: `@aigui/core` is built (branch `feat/core`), exports `Renderer`, `CardRegistry`, `ASTNode`, `Patch`, `RendererOptions`, `AIGuiPlugin`, etc. Tests run from repo root: `pnpm exec vitest run <name>`.

---

## File Structure
```
packages/react/
  package.json            # @aigui/react, react as peer dep
  tsconfig.json
  tsdown.config.ts
  src/
    apply-patches.ts      # applyPatches(nodes, patches) -> nodes (pure)
    render-node.tsx       # renderNode(node, ctx) -> ReactNode
    use-ai-renderer.ts    # useAIRenderer hook
    ai-renderer.tsx       # <AIRenderer> component
    index.ts
  src/*.test.ts(x)
```

---

## Task R1: Core enhancement — rendered inline HTML on text nodes

Adapters must not re-parse markdown. Core parser currently stores raw inline source in `paragraph`/`heading` `content` (e.g. `a **bold**`). Add a rendered, inline-HTML field so adapters just inject it.

**Files:**
- Modify: `packages/core/src/types.ts` (add `html?: string` to `ASTNode`)
- Modify: `packages/core/src/parser.ts` (fill `html` for paragraph/heading via `md.renderInline`)
- Modify: `packages/core/src/renderer.ts` (sanitize `html` field on ALL nodes, not just `type:"html"` content)
- Test: `packages/core/src/parser.test.ts`, `packages/core/src/renderer-sanitize.test.ts`

- [ ] **Step 1: Failing tests**

Add to `parser.test.ts`:
```ts
it("renders inline markdown to html on a paragraph node", () => {
  const parse = createParser()
  const node = parse("a **bold** b")[0]
  expect(node.type).toBe("paragraph")
  expect(node.html).toContain("<strong>bold</strong>")
})
it("renders inline markdown to html on a heading node", () => {
  const parse = createParser()
  const node = parse("# a `code`")[0]
  expect(node.html).toContain("<code>code</code>")
})
```
Add to `renderer-sanitize.test.ts`:
```ts
it("sanitizes the html field of a paragraph node", () => {
  const onPatch = vi.fn()
  const r = new Renderer({ onPatch })
  r.push("a <img src=x onerror=alert(1)> b")
  const all = onPatch.mock.calls.flatMap((c) => c[0])
  const p = all.map((x: any) => x.node).find((n: any) => n?.type === "paragraph")
  expect(p?.html ?? "").not.toContain("onerror")
})
```

- [ ] **Step 2: Confirm FAIL** — `pnpm exec vitest run parser renderer-sanitize`

- [ ] **Step 3: Implement**

`types.ts`: add `html?: string` to `ASTNode` interface (after `content?`).

`parser.ts`: in the `heading_open` and `paragraph_open` branches, add `html: md.renderInline(inline?.content ?? "")` to the pushed node. Example for paragraph:
```ts
const raw = inline?.content ?? ""
nodes.push({ key: `${index++}:paragraph`, type: "paragraph", tag: "p", content: raw, html: md.renderInline(raw) })
```
Do the same for heading (keep `tag: t.tag`).

`renderer.ts`: in the sanitize step, for every node when sanitize is enabled, if `node.html` is set replace it with `sanitizeHtml(node.html)` (in addition to the existing `type:"html"` `content` handling). Apply recursively to children as already done.

- [ ] **Step 4: Confirm PASS** — run the two test files, then full suite + typecheck to ensure no regression (`pnpm exec vitest run && pnpm --filter @aigui/core exec tsc --noEmit`).

- [ ] **Step 5: Commit**
```bash
git add packages/core/src/types.ts packages/core/src/parser.ts packages/core/src/renderer.ts packages/core/src/parser.test.ts packages/core/src/renderer-sanitize.test.ts
git commit -m "feat(core): rendered inline html on text nodes (adapter-ready)"
```

---

## Task R2: @aigui/react package scaffold

**Files:**
- Create: `packages/react/package.json`, `tsconfig.json`, `tsdown.config.ts`, `src/index.ts` (stub), `src/smoke.test.tsx`
- Modify root dev deps: add `@testing-library/react`, `@testing-library/dom`, `react`, `react-dom`, `@types/react`, `@types/react-dom` where needed.

- [ ] **Step 1: package.json**
```json
{
  "name": "@aigui/react",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "require": "./dist/index.cjs" } },
  "files": ["dist"],
  "scripts": { "build": "tsdown", "typecheck": "tsc --noEmit" },
  "dependencies": { "@aigui/core": "workspace:*" },
  "peerDependencies": { "react": ">=18" },
  "devDependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@testing-library/react": "^16.0.1",
    "@testing-library/dom": "^10.4.0"
  }
}
```

- [ ] **Step 2: tsconfig.json**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "jsx": "react-jsx", "lib": ["ES2022", "DOM", "DOM.Iterable"] },
  "include": ["src"]
}
```

- [ ] **Step 3: tsdown.config.ts**
```ts
import { defineConfig } from "tsdown"
export default defineConfig({ entry: ["src/index.ts"], format: ["esm", "cjs"], dts: true, clean: true, external: ["react", "react/jsx-runtime"] })
```

- [ ] **Step 4: `src/index.ts`**
```ts
export {}
```

- [ ] **Step 5: `src/smoke.test.tsx`**
```tsx
// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { expect, it } from "vitest"

it("renders react in jsdom", () => {
  const { container } = render(<div>hi</div>)
  expect(container.textContent).toBe("hi")
})
```

- [ ] **Step 6: install + verify**

Run: `pnpm install && pnpm exec vitest run smoke` (react smoke passes). Then `pnpm --filter @aigui/react build` — emits dist with index.js/.cjs/.d.ts.

- [ ] **Step 7: Commit**
```bash
git add -A
git commit -m "chore: @aigui/react package scaffold (react peer, testing-library, tsdown jsx)"
```

---

## Task R3: applyPatches (keyed patch application)

**Files:**
- Create: `packages/react/src/apply-patches.ts`
- Test: `packages/react/src/apply-patches.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, expect, it } from "vitest"
import { applyPatches } from "./apply-patches"
import type { ASTNode, Patch } from "@aigui/core"

const n = (key: string, content: string): ASTNode => ({ key, type: "paragraph", content })

describe("applyPatches", () => {
  it("insert appends by index", () => {
    const out = applyPatches([], [{ op: "insert", index: 0, node: n("0:p", "a") }] as Patch[])
    expect(out).toEqual([n("0:p", "a")])
  })
  it("update replaces by key", () => {
    const out = applyPatches([n("0:p", "a")], [{ op: "update", key: "0:p", node: n("0:p", "b") }] as Patch[])
    expect(out).toEqual([n("0:p", "b")])
  })
  it("remove drops by key", () => {
    const out = applyPatches([n("0:p", "a"), n("1:p", "b")], [{ op: "remove", key: "1:p" }] as Patch[])
    expect(out).toEqual([n("0:p", "a")])
  })
  it("applies a batch in order", () => {
    const out = applyPatches([n("0:p", "a")], [
      { op: "update", key: "0:p", node: n("0:p", "A") },
      { op: "insert", index: 1, node: n("1:p", "b") },
    ] as Patch[])
    expect(out).toEqual([n("0:p", "A"), n("1:p", "b")])
  })
})
```

- [ ] **Step 2: Confirm FAIL**

- [ ] **Step 3: Implement `apply-patches.ts`**
```ts
import type { ASTNode, Patch } from "@aigui/core"

export function applyPatches(nodes: ASTNode[], patches: Patch[]): ASTNode[] {
  let out = nodes.slice()
  for (const p of patches) {
    if (p.op === "insert") {
      out.splice(p.index, 0, p.node)
    } else if (p.op === "update") {
      const i = out.findIndex((n) => n.key === p.key)
      if (i >= 0) out[i] = p.node
    } else if (p.op === "remove") {
      out = out.filter((n) => n.key !== p.key)
    }
  }
  return out
}
```

- [ ] **Step 4: Confirm PASS**

- [ ] **Step 5: Commit**
```bash
git add packages/react/src/apply-patches.ts packages/react/src/apply-patches.test.ts
git commit -m "feat(react): applyPatches keyed patch application"
```

---

## Task R4: renderNode (ASTNode -> ReactNode)

**Files:**
- Create: `packages/react/src/render-node.tsx`
- Test: `packages/react/src/render-node.test.tsx`

- [ ] **Step 1: Failing test**
```tsx
// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ASTNode } from "@aigui/core"
import { CardRegistry } from "@aigui/core"
import { renderNode } from "./render-node"

describe("renderNode", () => {
  it("renders a paragraph's html", () => {
    const node: ASTNode = { key: "0:p", type: "paragraph", tag: "p", html: "a <strong>b</strong>" }
    const { container } = render(<>{renderNode(node, {})}</>)
    expect(container.querySelector("strong")?.textContent).toBe("b")
  })
  it("renders a heading with the right tag", () => {
    const node: ASTNode = { key: "0:h", type: "heading", tag: "h2", html: "Title" }
    const { container } = render(<>{renderNode(node, {})}</>)
    expect(container.querySelector("h2")?.textContent).toBe("Title")
  })
  it("renders a code node", () => {
    const node: ASTNode = { key: "0:c", type: "code", content: "const a=1", attrs: { lang: "ts" } }
    const { container } = render(<>{renderNode(node, {})}</>)
    expect(container.querySelector("code")?.textContent).toContain("const a=1")
  })
  it("renders a registered card component and fires onCardAction", () => {
    const registry = new CardRegistry()
    function Flight({ data, onAction }: any) {
      return <button onClick={() => onAction({ type: "book", params: data })}>book</button>
    }
    registry.register({ type: "flight", description: "f", render: Flight })
    const onCardAction = vi.fn()
    const node: ASTNode = { key: "0:card", type: "card", card: { type: "flight", data: { id: 1 }, complete: true, valid: true } }
    const { container } = render(<>{renderNode(node, { registry, onCardAction })}</>)
    container.querySelector("button")!.click()
    expect(onCardAction).toHaveBeenCalledWith({ type: "book", params: { id: 1 }, cardType: "flight" })
  })
  it("renders a skeleton for an incomplete card", () => {
    const node: ASTNode = { key: "0:card", type: "card", card: { type: "flight", data: {}, complete: false, valid: false } }
    const { container } = render(<>{renderNode(node, {})}</>)
    expect(container.querySelector("[data-aigui-card-loading]")).toBeTruthy()
  })
})
```

- [ ] **Step 2: Confirm FAIL**

- [ ] **Step 3: Implement `render-node.tsx`**
```tsx
import { createElement, type ReactNode } from "react"
import type { ASTNode, CardRegistry } from "@aigui/core"

export interface RenderContext {
  registry?: CardRegistry
  onCardAction?: (action: { type: string; params?: unknown; cardType: string }) => void
}

export function renderNode(node: ASTNode, ctx: RenderContext): ReactNode {
  switch (node.type) {
    case "heading":
      return createElement(node.tag ?? "h1", { key: node.key, dangerouslySetInnerHTML: { __html: node.html ?? "" } })
    case "paragraph":
      return <p key={node.key} dangerouslySetInnerHTML={{ __html: node.html ?? "" }} />
    case "code":
      return (
        <pre key={node.key} data-lang={node.attrs?.lang}>
          <code>{node.content}</code>
        </pre>
      )
    case "hr":
      return <hr key={node.key} />
    case "html":
      return <div key={node.key} dangerouslySetInnerHTML={{ __html: node.content ?? "" }} />
    case "card":
      return renderCard(node, ctx)
    default:
      return <div key={node.key} dangerouslySetInnerHTML={{ __html: node.html ?? node.content ?? "" }} />
  }
}

function renderCard(node: ASTNode, ctx: RenderContext): ReactNode {
  const card = node.card
  if (!card) return null
  if (!card.complete || !card.valid) {
    return <div key={node.key} data-aigui-card-loading data-card-type={card.type} />
  }
  const Comp = getCardComponent(ctx.registry, card.type)
  if (!Comp) {
    // fallback: render the raw JSON as a code block, never crash
    return (
      <pre key={node.key} data-aigui-card-fallback>
        <code>{JSON.stringify(card.data, null, 2)}</code>
      </pre>
    )
  }
  return (
    <Comp
      key={node.key}
      data={card.data}
      onAction={(a: { type: string; params?: unknown }) =>
        ctx.onCardAction?.({ ...a, cardType: card.type })
      }
    />
  )
}

function getCardComponent(registry: CardRegistry | undefined, type: string): any {
  if (!registry) return undefined
  // CardRegistry stores defs privately; expose a getter in core (see note below).
  return (registry as unknown as { getRender?: (t: string) => unknown }).getRender?.(type)
}
```

Note: `CardRegistry` currently keeps `cards` private with no accessor for `render`. Add a public method to core first (small change, see Step 3b).

- [ ] **Step 3b: Add accessor to core `CardRegistry`**

In `packages/core/src/card-registry.ts` add:
```ts
getRender(type: string): unknown {
  return this.cards.get(type)?.render
}
```
Rebuild core is not needed for tests (vitest resolves TS source via workspace), but run `pnpm exec vitest run card-registry` to confirm no regression. Simplify `renderCard` to drop the placeholder line — use only `getCardComponent`.

- [ ] **Step 4: Confirm PASS** (5/5). Run typecheck for the react package.

- [ ] **Step 5: Commit**
```bash
git add packages/react/src/render-node.tsx packages/react/src/render-node.test.tsx packages/core/src/card-registry.ts
git commit -m "feat(react): renderNode (text/code/card mapping) + CardRegistry.getRender"
```

---

## Task R5: useAIRenderer hook

**Files:**
- Create: `packages/react/src/use-ai-renderer.ts`
- Test: `packages/react/src/use-ai-renderer.test.tsx`

- [ ] **Step 1: Failing test**
```tsx
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useAIRenderer } from "./use-ai-renderer"

describe("useAIRenderer", () => {
  it("push updates nodes state", () => {
    const { result } = renderHook(() => useAIRenderer())
    act(() => result.current.push("# Hello"))
    expect(result.current.nodes.some((n) => n.type === "heading")).toBe(true)
  })
  it("streaming multiple pushes accumulates", () => {
    const { result } = renderHook(() => useAIRenderer())
    act(() => result.current.push("# Ti"))
    act(() => result.current.push("tle"))
    const h = result.current.nodes.find((n) => n.type === "heading")
    expect(h?.html).toContain("Title")
  })
  it("reset clears nodes", () => {
    const { result } = renderHook(() => useAIRenderer())
    act(() => result.current.push("hello"))
    act(() => result.current.reset())
    expect(result.current.nodes).toEqual([])
  })
})
```

- [ ] **Step 2: Confirm FAIL**

- [ ] **Step 3: Implement `use-ai-renderer.ts`**
```ts
import { useCallback, useMemo, useRef, useState } from "react"
import { Renderer, type ASTNode, type Patch, type RendererOptions } from "@aigui/core"
import { applyPatches } from "./apply-patches"

export interface UseAIRendererResult {
  nodes: ASTNode[]
  push: (chunk: string) => void
  feed: (source: AsyncIterable<string> | ReadableStream) => Promise<void>
  reset: () => void
}

export function useAIRenderer(options: Omit<RendererOptions, "onPatch"> = {}): UseAIRendererResult {
  const [nodes, setNodes] = useState<ASTNode[]>([])
  const rendererRef = useRef<Renderer | null>(null)

  const renderer = useMemo(() => {
    const r = new Renderer({
      ...options,
      onPatch: (patches: Patch[]) => setNodes((prev) => applyPatches(prev, patches)),
    })
    rendererRef.current = r
    return r
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.registry, options.sanitize])

  const push = useCallback((chunk: string) => renderer.push(chunk), [renderer])
  const feed = useCallback((source: AsyncIterable<string> | ReadableStream) => renderer.feed(source as never), [renderer])
  const reset = useCallback(() => {
    renderer.reset()
    setNodes([])
  }, [renderer])

  return { nodes, push, feed, reset }
}
```

- [ ] **Step 4: Confirm PASS**

- [ ] **Step 5: Commit**
```bash
git add packages/react/src/use-ai-renderer.ts packages/react/src/use-ai-renderer.test.tsx
git commit -m "feat(react): useAIRenderer hook (Renderer + patch-applied nodes state)"
```

---

## Task R6: <AIRenderer> component + public exports

**Files:**
- Create: `packages/react/src/ai-renderer.tsx`
- Test: `packages/react/src/ai-renderer.test.tsx`
- Modify: `packages/react/src/index.ts`

- [ ] **Step 1: Failing test**
```tsx
// @vitest-environment jsdom
import { render, act } from "@testing-library/react"
import { createRef } from "react"
import { describe, expect, it, vi } from "vitest"
import { CardRegistry } from "@aigui/core"
import { AIRenderer, type AIRendererHandle } from "./ai-renderer"

describe("AIRenderer", () => {
  it("exposes an imperative push and renders", () => {
    const ref = createRef<AIRendererHandle>()
    const { container } = render(<AIRenderer ref={ref} />)
    act(() => ref.current!.push("# Hi"))
    expect(container.querySelector("h1")?.textContent).toBe("Hi")
  })
  it("renders a card component and routes onCardAction", () => {
    const registry = new CardRegistry()
    registry.register({ type: "poll", description: "p", render: ({ data, onAction }: any) => <button onClick={() => onAction({ type: "vote", params: data })}>vote</button> })
    const onCardAction = vi.fn()
    const ref = createRef<AIRendererHandle>()
    const { container } = render(<AIRenderer ref={ref} registry={registry} onCardAction={onCardAction} />)
    act(() => ref.current!.push('```card:poll\n{"q":"x"}\n```'))
    container.querySelector("button")!.click()
    expect(onCardAction).toHaveBeenCalledWith({ type: "vote", params: { q: "x" }, cardType: "poll" })
  })
})
```

- [ ] **Step 2: Confirm FAIL**

- [ ] **Step 3: Implement `ai-renderer.tsx`**
```tsx
import { forwardRef, useImperativeHandle } from "react"
import type { CardRegistry, RendererOptions } from "@aigui/core"
import { useAIRenderer } from "./use-ai-renderer"
import { renderNode, type RenderContext } from "./render-node"

export interface AIRendererHandle {
  push: (chunk: string) => void
  feed: (source: AsyncIterable<string> | ReadableStream) => Promise<void>
  reset: () => void
}

export interface AIRendererProps {
  registry?: CardRegistry
  sanitize?: boolean
  onCardAction?: RenderContext["onCardAction"]
  className?: string
}

export const AIRenderer = forwardRef<AIRendererHandle, AIRendererProps>(function AIRenderer(props, ref) {
  const { registry, sanitize, onCardAction, className } = props
  const opts: Omit<RendererOptions, "onPatch"> = { registry, sanitize }
  const { nodes, push, feed, reset } = useAIRenderer(opts)
  useImperativeHandle(ref, () => ({ push, feed, reset }), [push, feed, reset])
  const ctx: RenderContext = { registry, onCardAction }
  return <div className={className} data-aigui-renderer>{nodes.map((n) => renderNode(n, ctx))}</div>
})
```

- [ ] **Step 4: Confirm PASS**

- [ ] **Step 5: `index.ts`**
```ts
export { useAIRenderer } from "./use-ai-renderer"
export type { UseAIRendererResult } from "./use-ai-renderer"
export { AIRenderer } from "./ai-renderer"
export type { AIRendererHandle, AIRendererProps } from "./ai-renderer"
export { renderNode } from "./render-node"
export type { RenderContext } from "./render-node"
export { applyPatches } from "./apply-patches"
```

- [ ] **Step 6: Full verification** — `pnpm exec vitest run` (all pass), `pnpm --filter @aigui/react exec tsc --noEmit`, `pnpm --filter @aigui/react build` (emits dist).

- [ ] **Step 7: Commit**
```bash
git add -A
git commit -m "feat(react): AIRenderer component + public exports"
```

---

## Self-Review
- **Spec coverage:** §8 React API (`useAIRenderer`, `<AIRenderer>`) → R5/R6; card rendering + `onCardAction` (§6.5) → R4/R6; skeleton for incomplete card, fallback for missing/invalid (§6.1) → R4; sanitized inline (§7.6) → R1. Plugin `nodeRenderers`/`RenderOutput` translation deferred to the plugins sub-project (documented non-goal here).
- **Placeholders:** the `render-node.tsx` Step 3 has an intentional placeholder line removed in Step 3b — the final code uses `getCardComponent` only.
- **Type consistency:** `onCardAction` payload `{ type, params?, cardType }` is consistent across R4 and R6; `getRender` added to core in R4.

## Non-goals (this plan)
- Plugin `nodeRenderers` / `RenderOutput` translation (plugins sub-project).
- SSR / streaming Suspense.
- Styling/theme (headless — consumer styles via classes / card components).
