# Interactive Mount Implementation Plan (sub-project 7)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Add a `mount` `RenderOutput` kind so plugins can render **live, interactive** widgets (a real ECharts instance with tooltips / dataZoom / click) across React, Vue, and vanilla, with proper mount/unmount lifecycle. Then give `@ai-gui/plugin-chart` an interactive mode.

**Architecture:** New `RenderOutput` variant `{ kind: "mount"; mount: (el: HTMLElement) => void | (() => void) }`. The plugin receives a real DOM element in the browser and imperatively mounts a live instance, returning an optional cleanup. Each adapter provides a host that: creates a container, calls `mount(el)` once the element is in the DOM, and calls cleanup on unmount/replace. Framework-neutral (mount only needs a DOM element).

**Tech Stack:** existing. Touches `@ai-gui/core` (type), `@ai-gui/react`, `@ai-gui/vue`, `@ai-gui/vanilla`, `@ai-gui/plugin-chart`.

Prereq: 9 packages on main, 134 tests. Adapters already translate `RenderOutput` (`html`/`element`/`card`) and dispatch plugin `nodeRenderers`.

---

## Task M1 (core): add the `mount` RenderOutput variant

**Files:** `packages/core/src/types.ts`, `packages/core/src/types` test coverage via a new `packages/core/src/render-output.test.ts` (type-level + trivial runtime), `index.ts` unchanged (RenderOutput already exported).

- [ ] **Step 1: failing test** `packages/core/src/render-output.test.ts`
```ts
import { describe, expect, it } from "vitest"
import type { RenderOutput } from "./types"

describe("RenderOutput mount kind", () => {
  it("accepts a mount variant returning a cleanup", () => {
    const cleanup = () => {}
    const out: RenderOutput = { kind: "mount", mount: (el) => { void el; return cleanup } }
    expect(out.kind).toBe("mount")
    if (out.kind === "mount") {
      const el = { } as unknown as HTMLElement
      expect(out.mount(el)).toBe(cleanup)
    }
  })
  it("accepts a mount variant returning void", () => {
    const out: RenderOutput = { kind: "mount", mount: () => {} }
    expect(out.kind).toBe("mount")
  })
})
```
(This will fail to typecheck/compile until the variant is added — that is the RED state.)

- [ ] **Step 2: confirm FAIL** (`pnpm exec vitest run render-output` in core — compile error on the `mount` kind).
- [ ] **Step 3: implement** — in `packages/core/src/types.ts`, extend `RenderOutput`:
```ts
export type RenderOutput =
  | { kind: "html"; html: string }
  | { kind: "element"; tag: string; props?: Record<string, unknown>; children?: RenderOutput[] }
  | { kind: "card"; type: string; data: unknown }
  | { kind: "mount"; mount: (el: HTMLElement) => void | (() => void) }
```
- [ ] **Step 4: confirm PASS** + full suite + typecheck (existing adapter `renderOutput` switches now have an unhandled case — TS may flag exhaustiveness; if any adapter used an exhaustive `never` check it will fail typecheck. Adapters are handled in M2–M4, but core typecheck must stay green. Since adapters live in other packages, core typecheck passes; the whole-repo `pnpm typecheck` will surface adapter gaps — that is expected and fixed in M2–M4. For THIS task, require `pnpm --filter @ai-gui/core exec tsc --noEmit` clean and the core test green.)
- [ ] **Step 5: Commit** `feat(core): add mount RenderOutput kind for live interactive widgets`

---

## Task M2 (react): mount host + lifecycle

**Files:** `packages/react/src/render-output.tsx` (modify), test `packages/react/src/mount.test.tsx`.

- [ ] **Step 1: failing test** `packages/react/src/mount.test.tsx`
```tsx
// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ASTNode, AIGuiPlugin } from "@ai-gui/core"
import { renderNode } from "./render-node"

describe("react mount RenderOutput", () => {
  it("calls mount with a DOM element and cleanup on unmount", () => {
    const cleanup = vi.fn()
    const mount = vi.fn((el: HTMLElement) => { el.setAttribute("data-mounted", ""); return cleanup })
    const plugin: AIGuiPlugin = { name: "live", nodeRenderers: { live: () => ({ kind: "mount", mount }) } }
    const node: ASTNode = { key: "0:live", type: "live", content: "" }
    const { container, unmount } = render(<>{renderNode(node, { plugins: [plugin] })}</>)
    expect(mount).toHaveBeenCalledTimes(1)
    expect(container.querySelector("[data-mounted]")).toBeTruthy()
    unmount()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})
```
- [ ] **Step 2: FAIL** (renderOutput has no `mount` case).
- [ ] **Step 3: implement** — in `render-output.tsx`:
  - Add a `MountHost` component:
    ```tsx
    function MountHost({ mount }: { mount: (el: HTMLElement) => void | (() => void) }) {
      const ref = useRef<HTMLDivElement>(null)
      useEffect(() => {
        if (!ref.current) return
        const cleanup = mount(ref.current)
        return () => { if (typeof cleanup === "function") cleanup() }
        // mount once per host instance (React key on the node ensures identity)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return <div ref={ref} data-aigui-mount />
    }
    ```
  - In `renderOutput`, add: `case "mount": return <MountHost key={key} mount={out.mount} />` (and ensure `renderNode`'s plugin dispatch routes a `mount` output here — it already calls `renderOutput(out, node.key)`).
- [ ] **Step 4: PASS** + full suite + typecheck (`pnpm --filter @ai-gui/react exec tsc --noEmit`).
- [ ] **Step 5: Commit** `feat(react): mount RenderOutput host with lifecycle`

---

## Task M3 (vue): mount host + lifecycle

**Files:** `packages/vue/src/render-output.ts` (modify), test `packages/vue/src/mount.test.ts`.

- [ ] **Step 1: failing test** `packages/vue/src/mount.test.ts`
```ts
// @vitest-environment jsdom
import { mount as vueMount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"
import type { ASTNode, AIGuiPlugin } from "@ai-gui/core"
import { renderNode } from "./render-node"

describe("vue mount RenderOutput", () => {
  it("calls mount with a DOM element and cleanup on unmount", async () => {
    const cleanup = vi.fn()
    const mountFn = vi.fn((el: HTMLElement) => { el.setAttribute("data-mounted", ""); return cleanup })
    const plugin: AIGuiPlugin = { name: "live", nodeRenderers: { live: () => ({ kind: "mount", mount: mountFn }) } }
    const node: ASTNode = { key: "0:live", type: "live", content: "" }
    const w = vueMount({ render: () => renderNode(node, { plugins: [plugin] }) })
    expect(mountFn).toHaveBeenCalledTimes(1)
    expect(w.find("[data-mounted]").exists()).toBe(true)
    w.unmount()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})
```
- [ ] **Step 2: FAIL**.
- [ ] **Step 3: implement** — in `render-output.ts` add a `MountHost` `defineComponent`:
  ```ts
  const MountHost = defineComponent({
    props: { mount: { type: Function as PropType<(el: HTMLElement) => void | (() => void)>, required: true } },
    setup(props) {
      const elRef = ref<HTMLElement | null>(null)
      let cleanup: void | (() => void)
      onMounted(() => { if (elRef.value) cleanup = props.mount(elRef.value) })
      onBeforeUnmount(() => { if (typeof cleanup === "function") cleanup() })
      return () => h("div", { ref: elRef, "data-aigui-mount": "" })
    },
  })
  ```
  In `renderOutput`, add `if (out.kind === "mount") return h(MountHost, { mount: out.mount })`.
- [ ] **Step 4: PASS** + full suite + typecheck.
- [ ] **Step 5: Commit** `feat(vue): mount RenderOutput host with lifecycle`

---

## Task M4 (vanilla): mount host + reconcile cleanup

**Files:** `packages/vanilla/src/render-output.ts` (modify), `packages/vanilla/src/render-node-dom.ts` (ensure mount routed), `packages/vanilla/src/reconcile.ts` (call cleanup on remove/replace), `packages/vanilla/src/create-renderer.ts` (cleanup on reset/destroy), test `packages/vanilla/src/mount.test.ts`.

Approach: `renderOutputToElement` for `mount` creates a `<div data-aigui-mount>` and, via `queueMicrotask`, calls `mount(el)` (so the element is appended by the reconciler first), storing any cleanup on the element as a non-enumerable `__aiguiCleanup`. The reconciler calls `el.__aiguiCleanup?.()` before removing or replacing an element; `reset`/`destroy` call cleanup on all tracked elements.

- [ ] **Step 1: failing test** `packages/vanilla/src/mount.test.ts`
```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { createRenderer } from "./create-renderer"
import type { AIGuiPlugin } from "@ai-gui/core"

describe("vanilla mount RenderOutput", () => {
  it("mounts a live widget and cleans up on reset", async () => {
    const cleanup = vi.fn()
    const mountFn = vi.fn((el: HTMLElement) => { el.setAttribute("data-mounted", ""); return cleanup })
    const plugin: AIGuiPlugin = { name: "live", nodeRenderers: { live: () => ({ kind: "mount", mount: mountFn }) } }
    const host = document.createElement("div")
    document.body.appendChild(host)
    const r = createRenderer(host, { plugins: [plugin] })
    r.push("```live\n \n```")
    await new Promise((res) => setTimeout(res))
    expect(mountFn).toHaveBeenCalledTimes(1)
    expect(host.querySelector("[data-mounted]")).toBeTruthy()
    r.reset()
    expect(cleanup).toHaveBeenCalledTimes(1)
    host.remove()
  })
})
```
- [ ] **Step 2: FAIL**.
- [ ] **Step 3: implement** the mount case + reconcile cleanup + reset/destroy cleanup (store cleanups; call on remove/replace/reset/destroy). Ensure `renderNodeToElement`'s plugin sync dispatch routes a `mount` output to `renderOutputToElement`.
- [ ] **Step 4: PASS** + full suite + typecheck + `pnpm --filter @ai-gui/vanilla build`.
- [ ] **Step 5: Commit** `feat(vanilla): mount RenderOutput host + reconcile cleanup lifecycle`

---

## Task M5 (plugin-chart): interactive mode

**Files:** `packages/plugin-chart/src/index.ts` (modify), test additions.

Add `chart({ interactive?: boolean })`. When `interactive` and the option JSON is complete → return `{ kind: "mount", mount: (el) => { const inst = echarts.init(el, undefined, { renderer: "svg" }); inst.setOption(option); return () => inst.dispose() } }`. When not interactive (default) → existing SSR SVG html. When incomplete (streaming) → loading placeholder (both modes).

- [ ] **Step 1: failing tests** (add to `packages/plugin-chart/src/index.test.ts`)
```ts
it("interactive mode returns a mount RenderOutput for a complete option", () => {
  const r = collectNodeRenderers([chart({ interactive: true })]).chart
  const out = r({ key: "0:chart", type: "chart", content: barOption } as ASTNode) as RenderOutput
  expect(out.kind).toBe("mount")
})
it("interactive mount initializes a live instance and returns cleanup (jsdom-safe)", () => {
  const r = collectNodeRenderers([chart({ interactive: true })]).chart
  const out = r({ key: "0:chart", type: "chart", content: barOption } as ASTNode) as RenderOutput
  if (out.kind !== "mount") throw new Error("expected mount")
  const el = document.createElement("div"); el.style.width = "600px"; el.style.height = "400px"
  document.body.appendChild(el)
  const cleanup = out.mount(el)
  expect(el.querySelector("svg")).toBeTruthy() // echarts svg renderer draws into el
  if (typeof cleanup === "function") cleanup()
  el.remove()
})
it("interactive mode still shows loading placeholder for incomplete json", () => {
  const r = collectNodeRenderers([chart({ interactive: true })]).chart
  const out = r({ key: "0:chart", type: "chart", content: '{"series":[{"type":"bar"' } as ASTNode) as RenderOutput
  expect(out.kind).toBe("html")
  if (out.kind === "html") expect(out.html).toContain("data-aigui-chart-loading")
})
```
- [ ] **Step 2: FAIL**.
- [ ] **Step 3: implement** interactive branch (echarts SVG renderer init on the real element; setOption; cleanup disposes). If echarts init on a jsdom element without an SVG child fails the assertion, adjust to `renderer: "svg"` and ensure the element has explicit size; if jsdom truly cannot produce the svg child, relax that one assertion to `expect(el.children.length).toBeGreaterThan(0)` but keep the mount/cleanup contract — report exactly what you changed.
- [ ] **Step 4: PASS** + full suite + typecheck + build.
- [ ] **Step 5: Commit** `feat(plugin-chart): interactive mode via mount (live ECharts: tooltip/dataZoom/click)`

---

## Self-Review
- Adds the `mount` capability to the plugin contract (spec §7.3) so any imperative/interactive widget is renderable cross-framework with proper lifecycle. Chart gains real interactivity.
- Streaming: incomplete → loading placeholder; complete → interactive mount (or static SVG in default mode). Mount runs once per node key; cleanup on unmount/replace/reset/destroy.
- Non-goals: SSR-SVG-first-then-hydrate hybrid (v1 uses loading placeholder → mount); live option updates into an existing instance (re-mount on change is acceptable since chart JSON stabilizes after streaming).

## Spec update
Add the `mount` variant to spec §7.3 `RenderOutput` and note the interactive-widget lifecycle.
