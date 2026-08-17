# AIGUI blocks as images in OpenClaw WeChat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reply containing a chart, Mermaid diagram, KaTeX formula, table, card, or dashboard arrives in WeChat as images, with the surrounding prose intact.

**Architecture:** Two new workspace packages. `@ai-gui/image` renders markdown blocks to PNG by running the real `@ai-gui/vanilla` renderer inside a long-lived headless Chromium and screenshotting each block — it imports nothing from OpenClaw. `@ai-gui/openclaw` is a thin OpenClaw plugin that intercepts `reply_payload_sending`, calls the renderer, and rewrites the payload's `text` and `mediaUrls`.

**Tech Stack:** TypeScript, pnpm workspaces, tsdown, vitest (jsdom via `// @vitest-environment jsdom` docblocks), Playwright (peer dependency), OpenClaw plugin SDK (`definePluginEntry`, `api.on`, `api.registerTool`).

**Spec:** `docs/superpowers/specs/2026-08-17-aigui-image-openclaw-design.md`

**One deviation from the spec's delivery order.** The spec proposed shipping charts alone first and adding the other block families afterwards. The plan does all six in one pass, because block selection is a single `classify` function and splitting it would mean writing it twice. The staging that actually matters — a working, tested `@ai-gui/image` before any OpenClaw code exists — is preserved: Tasks 1-9 produce a package that stands on its own.

---

## Background the implementer needs

Read these before starting. They are the non-obvious facts this plan depends on, all verified against the current source.

**How the parser labels blocks.** `createParserWithMetadata` (`packages/core/src/parser.ts`) returns `{ nodes, blocks }` where `blocks[i]` carries `{ start, end, nodeStart, nodeEnd }` — character offsets into the source. Node types work out as:

| Source | `node.type` | How to recognise it |
| --- | --- | --- |
| ` ```chart ` | `"chart"` | `node.type === "chart"`, gated on `node.complete` |
| ` ```mermaid ` | `"mermaid"` | same shape |
| ` ```dashboard ` | `"dashboard"` | same shape |
| ` ```card:weather ` | `"card"` | `node.card.complete && node.card.valid` |
| `$$ … $$` | `"html"` | `node.content` contains `katex-display` |
| Markdown table | `"html"` | `node.content` matches `/<table[\s>]/` |

Math and tables are **not** plugin node types. KaTeX extends markdown-it (`extendParser`) rather than registering a `nodeRenderer`, and tables are core markdown-it. Both fall through to the parser's generic branch and land as `type: "html"` with pre-rendered HTML in `content`. That is why they are detected by inspecting `content`, not by type name.

**Charts are synchronous, Mermaid is not.** `packages/plugin-chart/src/index.ts:253` initialises ECharts with `{ renderer: "svg", ssr: true }` and returns `{ kind: "html", html: svg }` in the same tick when `interactive` is off. `packages/plugin-mermaid/src/index.ts:93` wraps rendering in `enqueue(async …)`. So there is **no settled signal** to await — hence the MutationObserver quiescence in Task 5.

**Do not reuse `exportRenderedImages`.** `packages/core/src/export-image.ts` is a canvas route; to escape `foreignObject` canvas tainting it rewrites Mermaid's HTML labels into flat SVG `<text>`, losing wrapping and styling. A Playwright element screenshot has neither problem.

**Test environment.** This repo has no global jsdom setting. Tests that need a DOM start with the docblock `// @vitest-environment jsdom` (see `packages/vanilla/src/create-renderer.test.ts:1`). Coverage thresholds are 75% across the board (`vitest.config.ts`).

---

## File structure

```
packages/image/                         @ai-gui/image
  package.json                          two exports (esm+cjs), playwright as peerDependency
  tsconfig.json
  tsdown.config.ts                      array: library build + browser IIFE page build
  README.md
  src/
    index.ts                            barrel
    types.ts                            RenderableKind, BlockSelection, RenderedImage, RenderOptions
    blocks.ts                           hasTrigger, selectRenderableBlocks, stripBlocks
    blocks.test.ts
    plugins.ts                          the plugin set used by both parser and page
    browser.ts                          lazy launch, page lease, idle shutdown
    browser.test.ts                     injected fake launcher, no real Chromium
    render.ts                           renderMarkdownToImages
    render.test.ts                      injected fake page
    render.e2e.test.ts                  real Chromium, gated on AIGUI_IMAGE_E2E
    page/
      entry.ts                          in-page: window.__aiguiRenderBlock
      html.ts                           page HTML template (baseCss + plugin css)

packages/openclaw/                      @ai-gui/openclaw
  package.json                          openclaw.extensions -> ./dist/index.js
  openclaw.plugin.json                  manifest: id, configSchema, contracts.tools
  tsconfig.json
  tsdown.config.ts
  README.md
  src/
    index.ts                            definePluginEntry: api.on + api.registerTool
    config.ts                           defaults + resolveConfig
    config.test.ts
    rewrite.ts                          pure payload rewriting
    rewrite.test.ts
    hook.ts                             createReplyPayloadHook(deps)
    hook.test.ts
    tool.ts                             createRenderTool(deps)
    tool.test.ts

Modified:
  vitest.workspace.ts                   alias entries + two test projects
  README.md                             plugin/package list
  .changeset/<name>.md                  release note
```

Each file has one job. `blocks.ts` is pure string/AST work and never touches a browser; `browser.ts` owns the Chromium lifecycle and nothing else; `render.ts` orchestrates the two. In the OpenClaw package `rewrite.ts` is pure, so every degradation path is testable without a gateway.

---

## Task 1: Scaffold `@ai-gui/image`

**Files:**
- Create: `packages/image/package.json`
- Create: `packages/image/tsconfig.json`
- Create: `packages/image/tsdown.config.ts`
- Create: `packages/image/src/types.ts`
- Create: `packages/image/src/index.ts`
- Create: `packages/image/src/smoke.test.ts`
- Copy: `packages/image/LICENSE`
- Modify: `vitest.workspace.ts`

- [ ] **Step 1: Create the package manifest**

`packages/image/package.json`. The `exports` shape is mandatory — `scripts/validate-packages.mjs:29-33` reads `exports["."].import.default` and `exports["."].require.default` and fails the release if either is missing from the tarball.

```json
{
  "name": "@ai-gui/image",
  "version": "0.30.0",
  "description": "Render AIGUI markdown blocks (charts, diagrams, math, tables, cards) to PNG in a headless browser.",
  "keywords": ["llm", "ai", "markdown", "chart", "screenshot", "png", "headless", "aigui"],
  "license": "MIT",
  "author": "Liang Li <ll_faw@hotmail.com>",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/liliang-cn/aigui.git",
    "directory": "packages/image"
  },
  "homepage": "https://github.com/liliang-cn/aigui#readme",
  "bugs": "https://github.com/liliang-cn/aigui/issues",
  "type": "module",
  "sideEffects": false,
  "engines": { "node": ">=18" },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    }
  },
  "files": ["dist", "README.md", "LICENSE"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "tsdown",
    "test": "pnpm --dir ../.. exec vitest run --project image",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@ai-gui/core": "workspace:*",
    "@ai-gui/vanilla": "workspace:*",
    "@ai-gui/plugin-chart": "workspace:*",
    "@ai-gui/plugin-mermaid": "workspace:*",
    "@ai-gui/plugin-katex": "workspace:*",
    "@ai-gui/plugin-dashboard": "workspace:*"
  },
  "peerDependencies": { "playwright": "^1.48.0" },
  "peerDependenciesMeta": { "playwright": { "optional": true } },
  "devDependencies": { "playwright": "^1.48.0" }
}
```

- [ ] **Step 2: Create tsconfig and build config**

`packages/image/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "lib": ["ES2022", "DOM", "DOM.Iterable"] },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts", "src/**/*.spec.ts"]
}
```

`packages/image/tsdown.config.ts` — the library build only. Playwright stays external so importing the package never pulls Chromium bindings.

```ts
import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  external: ["playwright"],
})
```

The browser bundle needs a second build, but its entry file does not exist until Task 5. `turbo.json`'s `build` task is unscoped and both `.github/workflows/ci.yml:28` and `release.yml:35` run a bare `pnpm build`, so declaring an entry before the file exists makes `tsdown` fail with `Cannot find entry` and turns CI red for four tasks. The second build is added in Task 5, alongside the file it points at, which keeps every commit on this branch buildable.

- [ ] **Step 3: Create the shared types**

`packages/image/src/types.ts`:

```ts
/** A block family that can be turned into a picture. */
export type RenderableKind = "chart" | "mermaid" | "dashboard" | "card" | "math" | "table"

/** One block chosen for rendering, with the source range it occupies. */
export interface BlockSelection {
  kind: RenderableKind
  /** Character offset of the block's first character in the source. */
  start: number
  /** Character offset one past the block's last character. */
  end: number
}

export interface RenderedImage {
  kind: RenderableKind
  /** Absolute path of the written PNG. */
  path: string
  width: number
  height: number
}

export interface RenderOptions {
  /** Directory the PNGs are written into. Created if missing. */
  outDir: string
  kinds?: RenderableKind[]
  theme?: "light" | "dark"
  /** Viewport width in CSS pixels. */
  width?: number
  /** Device pixels per CSS pixel. */
  scale?: number
  /** Cap on how many blocks are rendered. Extra blocks stay as text. */
  max?: number
  timeoutMs?: number
  idleShutdownMs?: number
}

export interface RenderResult {
  /** The source with every successfully rendered block removed. */
  text: string
  images: RenderedImage[]
}

export const DEFAULT_KINDS: RenderableKind[] = ["chart", "mermaid", "dashboard", "card", "math", "table"]
export const DEFAULT_WIDTH = 720
export const DEFAULT_SCALE = 2
export const DEFAULT_MAX = 6
export const DEFAULT_TIMEOUT_MS = 10_000
export const DEFAULT_IDLE_SHUTDOWN_MS = 300_000
```

- [ ] **Step 4: Create a placeholder barrel and a smoke test**

`packages/image/src/index.ts`:

```ts
export type {
  BlockSelection,
  RenderableKind,
  RenderedImage,
  RenderOptions,
  RenderResult,
} from "./types"
export {
  DEFAULT_IDLE_SHUTDOWN_MS,
  DEFAULT_KINDS,
  DEFAULT_MAX,
  DEFAULT_SCALE,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_WIDTH,
} from "./types"
```

`packages/image/src/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { DEFAULT_KINDS, DEFAULT_WIDTH } from "./index"

describe("@ai-gui/image", () => {
  it("exports the defaults the OpenClaw plugin relies on", () => {
    expect(DEFAULT_KINDS).toContain("chart")
    expect(DEFAULT_WIDTH).toBe(720)
  })
})
```

- [ ] **Step 5: Register the package with the test workspace**

In `vitest.workspace.ts`, add these lines to the `alias` object (the package imports plugins that have no alias yet, so tests would otherwise resolve stale `dist` builds):

```ts
  "@ai-gui/image": fileURLToPath(new URL("./packages/image/src/index.ts", import.meta.url)),
  "@ai-gui/plugin-chart": fileURLToPath(new URL("./packages/plugin-chart/src/index.ts", import.meta.url)),
  "@ai-gui/plugin-mermaid": fileURLToPath(new URL("./packages/plugin-mermaid/src/index.ts", import.meta.url)),
  "@ai-gui/plugin-katex": fileURLToPath(new URL("./packages/plugin-katex/src/index.ts", import.meta.url)),
```

And add this project to the array returned by `defineWorkspace`, next to the other package entries:

```ts
  {
    resolve: { alias },
    test: { name: "image", root: "packages/image", coverage },
  },
```

- [ ] **Step 6: Copy the licence and install**

```bash
cp packages/plugin-chart/LICENSE packages/image/LICENSE
pnpm install
```

Expected: pnpm links the new workspace package without error.

- [ ] **Step 7: Run the smoke test**

Run: `pnpm exec vitest run --project image`
Expected: PASS, 1 test.

- [ ] **Step 8: Commit**

```bash
git add packages/image vitest.workspace.ts pnpm-lock.yaml
git commit -m "feat(image): scaffold @ai-gui/image package"
```

---

## Task 2: Cheap trigger detection

The hook must decide "is there anything here worth parsing?" without parsing. This regex is deliberately over-inclusive: a false positive costs one markdown parse, never a browser launch, because the browser is only touched after `selectRenderableBlocks` returns a non-empty list.

**Files:**
- Create: `packages/image/src/blocks.ts`
- Create: `packages/image/src/blocks.test.ts`
- Modify: `packages/image/src/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/image/src/blocks.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { hasTrigger } from "./blocks"

describe("hasTrigger", () => {
  it("finds every fence family that can become a picture", () => {
    expect(hasTrigger("before\n```chart\n{}\n```\nafter")).toBe(true)
    expect(hasTrigger("```mermaid\ngraph TD;\n```")).toBe(true)
    expect(hasTrigger("```dashboard\n{}\n```")).toBe(true)
    expect(hasTrigger("```card:weather\n{}\n```")).toBe(true)
  })

  it("finds display math and tables", () => {
    expect(hasTrigger("text\n\n$$\nx^2\n$$\n")).toBe(true)
    expect(hasTrigger("| a | b |\n| - | - |\n| 1 | 2 |")).toBe(true)
  })

  it("finds the table shape models actually write, without leading pipes", () => {
    expect(hasTrigger("City | Temp\n-----|-----\nTokyo | 24")).toBe(true)
    expect(hasTrigger("City | Temp\n:---:|----:\nTokyo | 24")).toBe(true)
  })

  it("finds a fence that escaped its backticks", () => {
    expect(hasTrigger('````chart\n{"series":[]}\n````')).toBe(true)
  })

  it("says no to ordinary prose and ordinary code", () => {
    expect(hasTrigger("Just a sentence about charts and tables.")).toBe(false)
    expect(hasTrigger("```ts\nconst chart = 1\n```")).toBe(false)
  })

  it("does not mistake a horizontal rule for a table", () => {
    expect(hasTrigger("above\n\n-----\n\nbelow")).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm exec vitest run --project image blocks`
Expected: FAIL — `Failed to resolve import "./blocks"`.

- [ ] **Step 3: Write the implementation**

`packages/image/src/blocks.ts`:

```ts
/**
 * A cheap "might there be a picture in here?" test.
 *
 * The point is to spend nothing on the overwhelming majority of replies, which are prose. It is
 * intentionally loose — a sentence that happens to start with a pipe costs one markdown parse,
 * and the parse is what actually decides. Nothing launches a browser on the strength of this.
 *
 * Loose in the right direction, though. A false positive costs a parse; a false negative silently
 * drops a picture the reader asked for. Two shapes earned their own branch for that reason:
 * models write tables without leading pipes at least as often as with them, and they escalate a
 * fence to four backticks whenever the payload contains three.
 */
const TRIGGER =
  /^ {0,3}(?:(?:`{3,}|~{3,})[ \t]*(?:chart|mermaid|dashboard|card:)|\$\$|\||:?-+:?[ \t]*\|)/m

export function hasTrigger(markdown: string): boolean {
  return TRIGGER.test(markdown)
}
```

The last branch matches a GFM delimiter row (`-----|-----`, `:---:|----:`). It is what distinguishes a pipe-less table from a horizontal rule: a rule has no pipe, so `-----` alone still returns false.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm exec vitest run --project image blocks`
Expected: PASS, 6 tests.

- [ ] **Step 5: Export it**

Add to `packages/image/src/index.ts`:

```ts
export { hasTrigger } from "./blocks"
```

- [ ] **Step 6: Commit**

```bash
git add packages/image/src
git commit -m "feat(image): cheap trigger detection for renderable blocks"
```

---

## Task 3: The plugin set

Both the parser (to classify blocks) and the in-page renderer (to draw them) must use the same plugins, or a block will be selected and then fail to render. One module owns the list.

**Files:**
- Create: `packages/image/src/plugins.ts`

- [ ] **Step 1: Write the implementation**

`packages/image/src/plugins.ts`. `interactive: false` is the important flag: it makes `plugin-chart` return SSR SVG synchronously instead of mounting a live ECharts instance with animations to wait out.

```ts
import type { AIGuiPlugin } from "@ai-gui/core"
import { chart } from "@ai-gui/plugin-chart"
import { dashboard } from "@ai-gui/plugin-dashboard"
import { katex } from "@ai-gui/plugin-katex"
import { mermaid } from "@ai-gui/plugin-mermaid"
import { DEFAULT_WIDTH } from "./types"

/**
 * The plugins an image render understands.
 *
 * `interactive: false` is not a preference. It makes plugin-chart return an SSR SVG in the same
 * tick rather than mounting a live ECharts instance, so a chart is finished drawing before the
 * screenshot logic ever has to guess.
 *
 * The chart is sized to the page rather than left at the plugin's 600x400 default, which would
 * otherwise sit in a 720px column with a band of dead space beside it.
 */
export function imagePlugins(width: number = DEFAULT_WIDTH): AIGuiPlugin[] {
  const inner = Math.max(200, width - 32) // the page gives #root 16px of padding on each side
  return [
    chart({ interactive: false, width: inner, height: Math.round(inner * 0.625) }),
    mermaid(),
    // KaTeX's default `css` is `@import "katex/dist/katex.min.css"`, and a bare npm specifier
    // resolves to nothing inside `page.setContent`. The import fails silently and every formula
    // renders as flat unstyled text — `\frac{a}{b}` comes out as "ba". The real stylesheet is
    // inlined by `page/html.ts`, which can read files; this module cannot, because the browser
    // bundle imports it too.
    katex({ css: "" }),
    dashboard(),
  ]
}
```

`imagePlugins()` is called with no argument from `blocks.ts` — parsing does not care about width, only about which fence types exist — and with the configured width from the page.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @ai-gui/image exec tsc --noEmit`
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add packages/image/src/plugins.ts
git commit -m "feat(image): one plugin set shared by parser and page"
```

---

## Task 4: Selecting and stripping blocks

**Files:**
- Modify: `packages/image/src/blocks.ts`
- Modify: `packages/image/src/blocks.test.ts`
- Modify: `packages/image/src/index.ts`

- [ ] **Step 1: Write the failing tests for selection**

Append to `packages/image/src/blocks.test.ts`:

```ts
import { CardRegistry } from "@ai-gui/core"
import { selectRenderableBlocks, stripBlocks } from "./blocks"

const CHART = '```chart\n{"series":[{"type":"bar","data":[1,2]}]}\n```'
const MERMAID = "```mermaid\ngraph TD;\nA-->B;\n```"
const MATH = "$$\nx^2 + y^2 = z^2\n$$"
const TABLE = "| a | b |\n| - | - |\n| 1 | 2 |"

describe("selectRenderableBlocks", () => {
  it("selects a complete chart fence and reports its source range", () => {
    const source = `Intro.\n\n${CHART}\n\nOutro.`
    const selections = selectRenderableBlocks(source)
    expect(selections).toHaveLength(1)
    expect(selections[0].kind).toBe("chart")
    expect(source.slice(selections[0].start, selections[0].end)).toContain("```chart")
  })

  it("selects mermaid, display math and tables", () => {
    const kinds = selectRenderableBlocks(`${MERMAID}\n\n${MATH}\n\n${TABLE}`).map((s) => s.kind)
    expect(kinds).toEqual(["mermaid", "math", "table"])
  })

  it("ignores a fence that has not finished streaming", () => {
    expect(selectRenderableBlocks('```chart\n{"series":[')).toEqual([])
  })

  it("ignores an ordinary code fence and ordinary prose", () => {
    expect(selectRenderableBlocks("```ts\nconst x = 1\n```\n\nA sentence.")).toEqual([])
  })

  it("selects a card only when the registry knows the type and the data is valid", () => {
    const registry = new CardRegistry()
    registry.register({ type: "weather", description: "Weather", render: () => null })
    const source = '```card:weather\n{"city":"Tokyo"}\n```'
    expect(selectRenderableBlocks(source, { registry }).map((s) => s.kind)).toEqual(["card"])
    expect(selectRenderableBlocks(source)).toEqual([])
  })

  it("honours the kinds filter", () => {
    const selections = selectRenderableBlocks(`${CHART}\n\n${TABLE}`, { kinds: ["chart"] })
    expect(selections.map((s) => s.kind)).toEqual(["chart"])
  })

  it("caps the count and keeps document order", () => {
    const source = `${CHART}\n\n${MERMAID}\n\n${TABLE}`
    expect(selectRenderableBlocks(source, { max: 2 }).map((s) => s.kind)).toEqual(["chart", "mermaid"])
  })
})

describe("stripBlocks", () => {
  it("removes the selected ranges and leaves the prose readable", () => {
    const source = `Intro.\n\n${CHART}\n\nOutro.`
    const selections = selectRenderableBlocks(source)
    expect(stripBlocks(source, selections)).toBe("Intro.\n\nOutro.")
  })

  it("removes later ranges without invalidating earlier ones", () => {
    const source = `A\n\n${CHART}\n\nB\n\n${MERMAID}\n\nC`
    expect(stripBlocks(source, selectRenderableBlocks(source))).toBe("A\n\nB\n\nC")
  })

  it("returns an empty string when the whole message was one picture", () => {
    expect(stripBlocks(CHART, selectRenderableBlocks(CHART))).toBe("")
  })

  it("leaves the source untouched when nothing was selected", () => {
    expect(stripBlocks("Just prose.", [])).toBe("Just prose.")
  })

  it("collapses blank lines in a CRLF message too", () => {
    const source = `Intro.\r\n\r\n${CHART.replace(/\n/g, "\r\n")}\r\n\r\nOutro.`
    expect(stripBlocks(source, selectRenderableBlocks(source))).toBe("Intro.\n\nOutro.")
  })
})

describe("classify edge cases", () => {
  it("does not turn prose about KaTeX's CSS into a picture of that prose", () => {
    const source = 'Some text.\n\n<div>The katex-display class centres display math.</div>'
    expect(selectRenderableBlocks(source)).toEqual([])
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm exec vitest run --project image blocks`
Expected: FAIL — `selectRenderableBlocks is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `packages/image/src/blocks.ts`:

```ts
import { type CardRegistry, createParserWithMetadata } from "@ai-gui/core"
import type { ASTNode } from "@ai-gui/core"
import { imagePlugins } from "./plugins"
import { type BlockSelection, DEFAULT_KINDS, DEFAULT_MAX, type RenderableKind } from "./types"

export interface SelectOptions {
  kinds?: RenderableKind[]
  registry?: CardRegistry
  max?: number
}

/**
 * Which picture, if any, a parsed node represents.
 *
 * Charts, diagrams and dashboards announce themselves through the node type, because their
 * plugins register node renderers. Math and tables do not: KaTeX extends markdown-it rather than
 * registering a renderer, and tables are plain markdown-it, so both arrive as generic `html`
 * nodes carrying already-rendered markup. They have to be recognised by what is in that markup.
 */
function classify(node: ASTNode): RenderableKind | undefined {
  if (node.type === "chart" || node.type === "mermaid" || node.type === "dashboard") {
    return node.complete ? (node.type as RenderableKind) : undefined
  }
  if (node.type === "card") return node.card?.complete && node.card.valid ? "card" : undefined
  if (node.type !== "html") return undefined
  const html = node.content ?? ""
  // Match the class attribute, not the bare string. Raw HTML is enabled by default, so a model
  // explaining KaTeX's own CSS would otherwise have its prose stripped out of the message and
  // replaced by a picture of that prose.
  if (/class="[^"]*\bkatex-display\b/.test(html)) return "math"
  if (/<table[\s>]/.test(html)) return "table"
  return undefined
}

export function selectRenderableBlocks(markdown: string, options: SelectOptions = {}): BlockSelection[] {
  const kinds = new Set(options.kinds ?? DEFAULT_KINDS)
  const max = options.max ?? DEFAULT_MAX
  const parse = createParserWithMetadata({ plugins: imagePlugins(), registry: options.registry })
  const { nodes, blocks } = parse(markdown)
  const selections: BlockSelection[] = []
  for (const block of blocks) {
    if (selections.length >= max) break
    // A block can span several nodes; the first one that names a picture wins.
    for (let i = block.nodeStart; i < block.nodeEnd; i++) {
      const kind = classify(nodes[i])
      if (!kind || !kinds.has(kind)) continue
      selections.push({ kind, start: block.start, end: block.end })
      break
    }
  }
  return selections
}

/**
 * Cut the rendered blocks out of the text.
 *
 * Back to front, because slicing from the front shifts every offset behind it and silently
 * corrupts the second cut onwards. Runs of blank lines left by the cuts collapse to one, so a
 * message that was mostly pictures does not arrive as a column of empty lines. The collapse has
 * to know about `\r\n` — matching bare `\n` leaves a stray blank line in every CRLF message.
 */
export function stripBlocks(markdown: string, selections: BlockSelection[]): string {
  let out = markdown
  for (const selection of [...selections].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, selection.start) + out.slice(selection.end)
  }
  return out.replace(/(?:\r?\n){3,}/g, "\n\n").trim()
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --project image blocks`
Expected: PASS, all tests.

If the card test fails because `CardRegistry.register` requires more fields than `{ type, description, render }`, read `packages/core/src/card-registry.ts` and add whatever it requires — do not weaken the assertion.

If the math test fails, print the parsed node with `console.log(JSON.stringify(nodes, null, 2))` and check what marker KaTeX's display output actually carries; update the `classify` check to match the real string rather than changing the test's intent.

- [ ] **Step 5: Export**

Add to `packages/image/src/index.ts`:

```ts
export { selectRenderableBlocks, stripBlocks } from "./blocks"
export type { SelectOptions } from "./blocks"
```

- [ ] **Step 6: Commit**

```bash
git add packages/image/src
git commit -m "feat(image): select renderable blocks and strip them from the text"
```

---

## Task 5: The in-page renderer

This is the code that runs inside Chromium. It renders **one block at a time** into a fresh root and resolves when drawing has settled. Rendering per block rather than per message means nothing depends on DOM children lining up with node indices, and each picture gets its own tidy bounds.

**Files:**
- Create: `packages/image/src/page/entry.ts`
- Create: `packages/image/src/page/html.ts`

- [ ] **Step 1: Inline KaTeX's stylesheet and its fonts**

`packages/image/src/page/fonts.ts`. Node-side only — `plugins.ts` must stay importable by the browser bundle, so this cannot live there.

```ts
import { readdirSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { katexInlineCss } from "@ai-gui/plugin-katex/inline-css"

const PLACEHOLDER = "AIGUI_KATEX_FONTS/"

/**
 * KaTeX's stylesheet with its fonts inlined as data URIs.
 *
 * Two problems get solved together. The plugin's default `css` is an `@import` of a bare npm
 * specifier, which resolves to nothing inside `page.setContent` — without the real stylesheet a
 * formula renders as flat text, so `\frac{a}{b}` arrives as "ba". And `katexInlineCss({ fontBase })`
 * alone is not enough either: Chromium refuses `file://` subresources from an `about:blank`
 * document, so all twenty faces fail and the maths falls back to a serif. That fallback is
 * legible, but it has no blackboard bold or script faces — `\mathbb{R}` degrades to a bold R.
 *
 * Data URIs need no origin and no network, so the fonts simply work. 296 kB of woff2 becomes
 * roughly 368 kB of CSS, read once and kept for the life of the process.
 */
let cached: string | undefined

export function katexCss(): string {
  if (cached !== undefined) return cached
  const require_ = createRequire(import.meta.url)
  const fontDir = join(dirname(require_.resolve("katex/package.json")), "dist", "fonts")
  const inlined = new Map<string, string>()
  for (const file of readdirSync(fontDir)) {
    if (!file.endsWith(".woff2")) continue
    inlined.set(file, `data:font/woff2;base64,${readFileSync(join(fontDir, file)).toString("base64")}`)
  }
  let css = katexInlineCss({ fontBase: PLACEHOLDER })
  css = css.replace(new RegExp(`url\\(${PLACEHOLDER}([^)]+?)\\.woff2\\)`, "g"), (whole, name: string) => {
    const uri = inlined.get(`${name}.woff2`)
    return uri ? `url(${uri})` : whole
  })
  // Drop the woff/ttf fallbacks; they would 404 behind a woff2 that already loaded.
  css = css.replace(
    new RegExp(`,\\s*url\\(${PLACEHOLDER}[^)]+?\\.(?:woff|ttf)\\)\\s*format\\("(?:woff|truetype)"\\)`, "g"),
    "",
  )
  cached = css
  return cached
}
```

`katex` has to be a direct dependency for `require_.resolve` to find its fonts. Add it to `packages/image/package.json`:

```json
    "katex": "^0.16.9",
```

- [ ] **Step 2: Write the page HTML template**

`packages/image/src/page/html.ts`:

```ts
import { baseCss, collectPluginStyles } from "@ai-gui/core"
import { imagePlugins } from "../plugins"
import { katexCss } from "./fonts"

const THEMES = {
  light: { bg: "#ffffff", fg: "#1a1a1a" },
  dark: { bg: "#161616", fg: "#e8e8e8" },
} as const

export interface PageHtmlOptions {
  theme?: keyof typeof THEMES
  width?: number
}

/**
 * The document a block is drawn into.
 *
 * Animation is disabled globally. ECharts is already static here, but Mermaid and the dashboard
 * plugin animate on entry, and an animating element is a coin flip between a finished picture and
 * a half-faded one. The font stack names CJK families explicitly: a screenshot has no fallback
 * chain to fall back to at read time, so a missing face is permanent tofu in the delivered image.
 */
export function pageHtml(options: PageHtmlOptions = {}): string {
  const theme = THEMES[options.theme ?? "light"]
  const pluginCss = collectPluginStyles(imagePlugins(options.width))
    .map((style) => style.css)
    .join("\n")
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
*,*::before,*::after{animation:none!important;transition:none!important}
html,body{margin:0;padding:0;background:${theme.bg};color:${theme.fg}}
body{font-family:-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Noto Sans SC",system-ui,sans-serif;font-size:16px;line-height:1.6}
#root{display:inline-block;padding:16px;box-sizing:border-box;max-width:${options.width ?? 720}px}
${baseCss}
${katexCss()}
${pluginCss}
</style></head><body><div id="root"></div></body></html>`
}
```

- [ ] **Step 2: Write the in-page entry**

`packages/image/src/page/entry.ts`:

```ts
import { createRenderer } from "@ai-gui/vanilla"
import { imagePlugins } from "../plugins"

declare global {
  interface Window {
    __aiguiRenderBlock: (
      source: string,
      options?: { width?: number; quietMs?: number },
    ) => Promise<{ width: number; height: number; failed: boolean }>
  }
}

/** A plugin whose promise has not resolved yet. `render-node-dom.ts:52` sets this marker. */
const PENDING = "[data-aigui-async-pending]"
/** A plugin whose promise rejected. `render-node-dom.ts:62` sets this one. */
const FAILED = "[data-aigui-async-error]"

/**
 * Wait until the block has actually finished drawing.
 *
 * AIGUI's node renderers are invoked synchronously but what they start is not: Mermaid renders
 * through an async queue and swaps its SVG in later. There is no settled signal to await, so the
 * subtree is watched and declared finished once it has been still for a beat.
 *
 * Quiet alone is not enough, and that distinction is the whole point. The observer is attached
 * after `push()`, so it never sees the synchronous placeholder the renderer leaves behind — only
 * the later swap. A Mermaid diagram that takes longer than one quiet window would therefore be
 * declared finished while its host was still an empty `data-aigui-async-pending` div, and the
 * screenshot would capture nothing. So a still subtree that still contains a pending marker
 * restarts the clock instead of resolving. The Node side's hard timeout bounds the wait.
 */
function quiescent(root: HTMLElement, quietMs: number): Promise<void> {
  return new Promise((resolve) => {
    let timer = 0
    const observer = new MutationObserver(schedule)
    function schedule(): void {
      window.clearTimeout(timer)
      timer = window.setTimeout(check, quietMs)
    }
    function check(): void {
      if (root.querySelector(PENDING)) {
        schedule()
        return
      }
      observer.disconnect()
      resolve()
    }
    observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true })
    schedule()
  })
}

function frame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
}

window.__aiguiRenderBlock = async (source, options = {}) => {
  const root = document.getElementById("root") as HTMLElement
  root.replaceChildren()
  const renderer = createRenderer(root, { plugins: imagePlugins(options.width) })
  renderer.push(source)
  await quiescent(root, options.quietMs ?? 150)
  await document.fonts.ready
  await frame()
  await frame()
  const box = root.getBoundingClientRect()
  // A plugin that threw leaves an empty host behind. Saying so lets the caller keep the block as
  // text rather than sending a blank picture, which is the worse of the two failures.
  return {
    width: Math.ceil(box.width),
    height: Math.ceil(box.height),
    failed: root.querySelector(FAILED) !== null,
  }
}
```

- [ ] **Step 3: Add the page build — with Vite, not tsdown**

The page bundle is injected into a browser that cannot resolve modules, so everything has to be inlined. tsdown with `noExternal: [/.*/]` produces a bundle that **throws on load** — verified in a real Chromium: `TypeError: Cannot read properties of undefined (reading 'type')` from ECharts component registration, and behind it a second failure in Mermaid's `@braintree/sanitize-url` (`require_constants is not a function`). Both are CJS-interop and module-ordering defects that rolldown does not handle here.

Vite does, because it pre-bundles CJS dependencies through esbuild and dedupes them. That is not a guess: `apps/playground` already ships `@ai-gui/plugin-mermaid` to a browser with a stock Vite config.

Add `vite` to `devDependencies` in `packages/image/package.json`:

```json
  "devDependencies": { "@types/node": "^22.0.0", "playwright": "^1.48.0", "vite": "^5.4.0" }
```

Create `packages/image/vite.page.config.ts`:

```ts
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

/**
 * The browser bundle, built separately from the library.
 *
 * A Vite *library* build does not shim `process.env` the way an app build does, and something in
 * the dependency tree reads it — without these defines the bundle dies on load with
 * `ReferenceError: process is not defined` before it can install `__aiguiRenderBlock`.
 */
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": "{}",
    global: "globalThis",
  },
  build: {
    lib: { entry: "src/page/entry.ts", formats: ["iife"], name: "AiguiPage", fileName: () => "entry.js" },
    outDir: "dist/page",
    emptyOutDir: true,
    target: "chrome110",
  },
})
```

Leave `tsdown.config.ts` as the single library config it already is, and chain the two builds in `packages/image/package.json`:

```json
    "build": "tsdown && vite build --config vite.page.config.ts",
```

- [ ] **Step 4: Build the page bundle**

Run: `pnpm --filter @ai-gui/image build`
Expected: `packages/image/dist/page/entry.js` exists.

```bash
ls -la packages/image/dist/page/
```

If `createRenderer(root, { plugins })` rejects the options object, open `packages/vanilla/src/create-renderer.ts` and pass whatever `CreateRendererOptions` actually requires — a `CardRegistry` and `CardStore` may be mandatory. Construct them here rather than making them the caller's problem.

- [ ] **Step 5: Commit**

```bash
git add packages/image/src/page packages/image/tsdown.config.ts
git commit -m "feat(image): in-page block renderer with quiescence detection"
```

---

## Task 6: Browser lifecycle

**Files:**
- Create: `packages/image/src/browser.ts`
- Create: `packages/image/src/browser.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/image/src/browser.test.ts`. A fake launcher keeps this test free of a real Chromium, so it runs in ordinary CI.

```ts
import { afterEach, describe, expect, it, vi } from "vitest"
import { BrowserUnavailableError, __resetBrowserForTests, acquirePage, closeBrowser } from "./browser"

function fakeLauncher() {
  const closed = { browser: 0, page: 0 }
  const newPage = vi.fn(async (_options?: { deviceScaleFactor?: number }) => ({
    close: async () => {
      closed.page++
    },
  }))
  const launch = vi.fn(async () => ({
    close: async () => {
      closed.browser++
    },
    newPage,
  }))
  return { launch, newPage, closed }
}

afterEach(async () => {
  await __resetBrowserForTests()
})

describe("acquirePage", () => {
  it("launches once and reuses the browser across leases", async () => {
    const { launch } = fakeLauncher()
    const first = await acquirePage({ launcher: launch })
    await first.release()
    const second = await acquirePage({ launcher: launch })
    await second.release()
    expect(launch).toHaveBeenCalledTimes(1)
  })

  it("closes the page after every lease", async () => {
    const { launch, closed } = fakeLauncher()
    const lease = await acquirePage({ launcher: launch })
    await lease.release()
    expect(closed.page).toBe(1)
  })

  it("shuts the browser down once it has been idle", async () => {
    vi.useFakeTimers()
    const { launch, closed } = fakeLauncher()
    const lease = await acquirePage({ launcher: launch, idleShutdownMs: 1000 })
    await lease.release()
    await vi.advanceTimersByTimeAsync(1001)
    expect(closed.browser).toBe(1)
    vi.useRealTimers()
  })

  it("does not shut down while a lease is open", async () => {
    vi.useFakeTimers()
    const { launch, closed } = fakeLauncher()
    await acquirePage({ launcher: launch, idleShutdownMs: 1000 })
    await vi.advanceTimersByTimeAsync(5000)
    expect(closed.browser).toBe(0)
    vi.useRealTimers()
  })

  it("creates the page at the requested pixel density", async () => {
    const { launch, newPage } = fakeLauncher()
    const lease = await acquirePage({ launcher: launch, deviceScaleFactor: 3 })
    await lease.release()
    expect(newPage).toHaveBeenCalledWith({ deviceScaleFactor: 3 })
  })

  it("defaults to 2x, which is what a phone screen wants", async () => {
    const { launch, newPage } = fakeLauncher()
    const lease = await acquirePage({ launcher: launch })
    await lease.release()
    expect(newPage).toHaveBeenCalledWith({ deviceScaleFactor: 2 })
  })

  it("reports a missing Playwright as its own error type", async () => {
    const launcher = async () => {
      throw new Error("Cannot find module 'playwright'")
    }
    await expect(acquirePage({ launcher })).rejects.toBeInstanceOf(BrowserUnavailableError)
  })

  it("relaunches after the browser was closed", async () => {
    const { launch } = fakeLauncher()
    const lease = await acquirePage({ launcher: launch })
    await lease.release()
    await closeBrowser()
    const next = await acquirePage({ launcher: launch })
    await next.release()
    expect(launch).toHaveBeenCalledTimes(2)
  })

  it("does not keep handing out pages from a browser that died", async () => {
    let alive = false
    const launch = vi.fn(async () => ({
      close: async () => {},
      newPage: async () => {
        if (!alive) throw new Error("Target page, context or browser has been closed")
        return { close: async () => {} }
      },
    }))
    await expect(acquirePage({ launcher: launch })).rejects.toThrow("has been closed")
    alive = true
    const lease = await acquirePage({ launcher: launch })
    await lease.release()
    // A dead handle must not be cached, or every render after one crash fails forever.
    expect(launch).toHaveBeenCalledTimes(2)
  })

  it("does not leak a lease when the page cannot be created", async () => {
    const launch = vi.fn(async () => ({
      close: async () => {},
      newPage: async () => {
        throw new Error("nope")
      },
    }))
    await expect(acquirePage({ launcher: launch })).rejects.toThrow("nope")
    // A leaked lease count would keep the idle shutdown from ever firing.
    const { launch: healthy, closed } = fakeLauncher()
    vi.useFakeTimers()
    const lease = await acquirePage({ launcher: healthy, idleShutdownMs: 1000 })
    await lease.release()
    await vi.advanceTimersByTimeAsync(1001)
    expect(closed.browser).toBe(1)
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm exec vitest run --project image browser`
Expected: FAIL — `Failed to resolve import "./browser"`.

- [ ] **Step 3: Write the implementation**

`packages/image/src/browser.ts`:

```ts
import { DEFAULT_IDLE_SHUTDOWN_MS, DEFAULT_SCALE } from "./types"

/** The slice of Playwright this package uses. Kept minimal so tests can supply a stand-in. */
export interface PageLike {
  close(): Promise<void>
}
export interface BrowserLike {
  /**
   * `deviceScaleFactor` can only be set when the page is created — `setViewportSize` does not
   * accept it. Getting this wrong is invisible in code review and obvious on a phone: the picture
   * arrives at half the resolution it should.
   */
  newPage(options?: { deviceScaleFactor?: number }): Promise<PageLike>
  close(): Promise<void>
}
export type Launcher = () => Promise<BrowserLike>

/** Playwright is an optional peer. Its absence is a configuration fact, not a bug. */
export class BrowserUnavailableError extends Error {
  constructor(cause: unknown) {
    super("Playwright is not installed. Run `pnpm add playwright` and `pnpm exec playwright install chromium`.")
    this.name = "BrowserUnavailableError"
    this.cause = cause
  }
}

export interface AcquireOptions {
  launcher?: Launcher
  idleShutdownMs?: number
  deviceScaleFactor?: number
}

export interface PageLease {
  page: PageLike
  release(): Promise<void>
}

const defaultLauncher: Launcher = async () => {
  const playwright = await import("playwright")
  return (await playwright.chromium.launch({ args: ["--font-render-hinting=none"] })) as unknown as BrowserLike
}

let browser: BrowserLike | undefined
let leases = 0
let idleTimer: ReturnType<typeof setTimeout> | undefined

function cancelIdle(): void {
  if (idleTimer === undefined) return
  clearTimeout(idleTimer)
  idleTimer = undefined
}

/**
 * Close the browser once nobody has wanted one for a while.
 *
 * A gateway can go hours between charts, and a resident Chromium is a few hundred megabytes of
 * nothing. Launching costs about a second, which is affordable on the first chart of a burst and
 * free on the rest.
 */
function scheduleIdleShutdown(idleShutdownMs: number): void {
  cancelIdle()
  idleTimer = setTimeout(() => {
    if (leases > 0) return
    void closeBrowser()
  }, idleShutdownMs)
  if (typeof idleTimer === "object" && "unref" in idleTimer) idleTimer.unref()
}

export async function acquirePage(options: AcquireOptions = {}): Promise<PageLease> {
  const launcher = options.launcher ?? defaultLauncher
  const idleShutdownMs = options.idleShutdownMs ?? DEFAULT_IDLE_SHUTDOWN_MS
  cancelIdle()
  if (!browser) {
    try {
      browser = await launcher()
    } catch (error) {
      throw new BrowserUnavailableError(error)
    }
  }
  let page: PageLike
  try {
    page = await browser.newPage({ deviceScaleFactor: options.deviceScaleFactor ?? DEFAULT_SCALE })
  } catch (error) {
    // The cached browser is dead — a crash, or an OOM kill. Keeping the handle would fail every
    // render from here on, so drop it and let the next call launch a fresh one.
    browser = undefined
    throw error
  }
  leases++
  let released = false
  return {
    page,
    async release() {
      if (released) return
      released = true
      leases--
      await page.close().catch(() => {})
      if (leases === 0) scheduleIdleShutdown(idleShutdownMs)
    },
  }
}

export async function closeBrowser(): Promise<void> {
  cancelIdle()
  const current = browser
  browser = undefined
  await current?.close().catch(() => {})
}

/** Drops all module state. Tests only. */
export async function __resetBrowserForTests(): Promise<void> {
  leases = 0
  await closeBrowser()
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --project image browser`
Expected: PASS, 10 tests.

- [ ] **Step 5: Export**

Add to `packages/image/src/index.ts`:

```ts
export { BrowserUnavailableError, closeBrowser } from "./browser"
```

- [ ] **Step 6: Commit**

```bash
git add packages/image/src
git commit -m "feat(image): lazy Chromium with page leases and idle shutdown"
```

---

## Task 7: `renderMarkdownToImages`

**Files:**
- Modify: `packages/image/package.json`
- Create: `packages/image/src/render.ts`
- Create: `packages/image/src/render.test.ts`
- Modify: `packages/image/src/index.ts`

- [ ] **Step 1: Make Node's own types available**

This is the first module in the package — and in the whole monorepo — to touch Node built-ins. Every other AIGUI package is browser or isomorphic, so `@types/node` has never been a dependency anywhere. Without it, `import { join } from "node:path"` fails with `TS2307: Cannot find module 'node:path'` and `process.pid` fails with `TS2580`. Verified by probe, not assumed.

Add to `devDependencies` in `packages/image/package.json`, keeping the existing entries:

```json
  "devDependencies": { "@types/node": "^22.0.0", "playwright": "^1.48.0" }
```

Then `pnpm install`.

Note the knock-on effect: with `@types/node` present, `setTimeout` resolves to the Node overload rather than the DOM one. `browser.ts` casts through `unknown` to reach `.unref()`, which works under either overload, so nothing there needs changing — but re-run its tests after installing to confirm.

- [ ] **Step 2: Write the failing tests**

`packages/image/src/render.test.ts`. The Playwright page is injected, so every orchestration and degradation path is covered without a browser.

```ts
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderMarkdownToImages } from "./render"

const CHART = '```chart\n{"series":[{"type":"bar","data":[1,2]}]}\n```'
const MERMAID = "```mermaid\ngraph TD;\nA-->B;\n```"

function fakePage(overrides: Record<string, unknown> = {}) {
  return {
    setViewportSize: vi.fn(async () => {}),
    setContent: vi.fn(async () => {}),
    addScriptTag: vi.fn(async () => {}),
    evaluate: vi.fn(async () => ({ width: 400, height: 300, failed: false })),
    locator: vi.fn(() => ({ screenshot: vi.fn(async () => {}) })),
    close: vi.fn(async () => {}),
    ...overrides,
  }
}

let outDir: string
beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), "aigui-image-"))
})

describe("renderMarkdownToImages", () => {
  it("returns the source untouched when there is nothing to draw", async () => {
    const acquire = vi.fn()
    const result = await renderMarkdownToImages("Just prose.", { outDir, acquire })
    expect(result).toEqual({ text: "Just prose.", images: [] })
    expect(acquire).not.toHaveBeenCalled()
  })

  it("renders a chart, writes a PNG and strips the fence", async () => {
    const page = fakePage()
    const acquire = vi.fn(async () => ({ page, release: vi.fn(async () => {}) }))
    const result = await renderMarkdownToImages(`Intro.\n\n${CHART}\n\nOutro.`, { outDir, acquire })
    expect(result.text).toBe("Intro.\n\nOutro.")
    expect(result.images).toHaveLength(1)
    expect(result.images[0].kind).toBe("chart")
    expect(result.images[0].path.endsWith(".png")).toBe(true)
    expect(page.locator).toHaveBeenCalledWith("#root")
  })

  it("releases the page even when a block throws", async () => {
    const release = vi.fn(async () => {})
    const page = fakePage({
      evaluate: vi.fn(async () => {
        throw new Error("boom")
      }),
    })
    const acquire = vi.fn(async () => ({ page, release }))
    const result = await renderMarkdownToImages(CHART, { outDir, acquire })
    expect(result.text).toBe(CHART)
    expect(result.images).toEqual([])
    expect(release).toHaveBeenCalled()
  })

  it("leaves a block as text when its plugin threw inside the page", async () => {
    const page = fakePage({ evaluate: vi.fn(async () => ({ width: 400, height: 300, failed: true })) })
    const acquire = vi.fn(async () => ({ page, release: vi.fn(async () => {}) }))
    const result = await renderMarkdownToImages(CHART, { outDir, acquire })
    expect(result.images).toEqual([])
    expect(result.text).toBe(CHART)
    expect(page.locator).not.toHaveBeenCalled()
  })

  it("keeps the blocks that worked when one of them fails", async () => {
    let call = 0
    const page = fakePage({
      evaluate: vi.fn(async () => {
        call++
        if (call === 2) throw new Error("mermaid exploded")
        return { width: 400, height: 300, failed: false }
      }),
    })
    const acquire = vi.fn(async () => ({ page, release: vi.fn(async () => {}) }))
    const source = `${CHART}\n\n${MERMAID}`
    const result = await renderMarkdownToImages(source, { outDir, acquire })
    expect(result.images.map((i) => i.kind)).toEqual(["chart"])
    expect(result.text).toBe(MERMAID)
  })

  it("propagates a browser that cannot start, having drawn nothing", async () => {
    const acquire = vi.fn(async () => {
      throw new Error("no chromium")
    })
    await expect(renderMarkdownToImages(CHART, { outDir, acquire })).rejects.toThrow("no chromium")
  })

  it("writes one file per rendered block", async () => {
    const page = fakePage({ locator: vi.fn(() => ({ screenshot: vi.fn(async () => {}) })) })
    const acquire = vi.fn(async () => ({ page, release: vi.fn(async () => {}) }))
    const result = await renderMarkdownToImages(`${CHART}\n\n${MERMAID}`, { outDir, acquire })
    expect(new Set(result.images.map((i) => i.path)).size).toBe(2)
  })

  it("respects the max cap and leaves the rest as text", async () => {
    const page = fakePage()
    const acquire = vi.fn(async () => ({ page, release: vi.fn(async () => {}) }))
    const result = await renderMarkdownToImages(`${CHART}\n\n${MERMAID}`, { outDir, acquire, max: 1 })
    expect(result.images).toHaveLength(1)
    expect(result.text).toBe(MERMAID)
  })

  /**
   * Playwright evaluates a *string* as an expression, so passing the page function as a string
   * produces the function object and never calls it — every render silently returns undefined.
   * That bug shipped once and the fake page could not see it, because a fake `evaluate` returns
   * its canned answer whatever it is handed. Asserting the argument's type is what closes the gap.
   */
  it("hands page.evaluate a function, not a string", async () => {
    const page = fakePage()
    const acquire = vi.fn(async () => ({ page, release: vi.fn(async () => {}) }))
    await renderMarkdownToImages(CHART, { outDir, acquire })
    expect(page.evaluate).toHaveBeenCalledTimes(1)
    expect(typeof page.evaluate.mock.calls[0][0]).toBe("function")
    expect(page.evaluate.mock.calls[0][1]).toMatchObject({ source: expect.stringContaining("```chart") })
  })
})
```

Note: the screenshot is faked, so no PNG bytes land on disk here. Real pixels are Task 8's job.

- [ ] **Step 3: Run to confirm it fails**

Run: `pnpm exec vitest run --project image render`
Expected: FAIL — `Failed to resolve import "./render"`.

- [ ] **Step 4: Write the implementation**

`packages/image/src/render.ts`:

```ts
import { mkdir } from "node:fs/promises"
import { createRequire } from "node:module"
import { join } from "node:path"
import type { CardRegistry } from "@ai-gui/core"
import { selectRenderableBlocks, stripBlocks } from "./blocks"
import { acquirePage, type PageLease } from "./browser"
import { pageHtml } from "./page/html"
import {
  type BlockSelection,
  DEFAULT_SCALE,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_WIDTH,
  type RenderedImage,
  type RenderOptions,
  type RenderResult,
} from "./types"

/** The Playwright page surface this module drives. */
interface RenderPage {
  setViewportSize(size: { width: number; height: number }): Promise<void>
  setContent(html: string): Promise<void>
  addScriptTag(options: { path: string }): Promise<void>
  evaluate(fn: (arg: { source: string; width: number }) => unknown, arg: { source: string; width: number }): Promise<unknown>
  locator(selector: string): { screenshot(options: { path: string }): Promise<unknown> }
}

export interface InternalRenderOptions extends RenderOptions {
  registry?: CardRegistry
  /** Injected in tests. Defaults to the module's own lazy Chromium. */
  acquire?: (options: {
    idleShutdownMs?: number
    deviceScaleFactor?: number
  }) => Promise<{ page: unknown; release: () => Promise<void> }>
}

const require_ = createRequire(import.meta.url)

/** The built browser bundle that ships alongside this module. */
function pageBundlePath(): string {
  return join(require_.resolve("@ai-gui/image/package.json"), "..", "dist", "page", "entry.js")
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * Draw every renderable block in `markdown` and return the leftover text plus the pictures.
 *
 * A block that fails is left alone: its source stays in the text, so a reader gets the raw fence
 * rather than a silently missing answer. Only blocks that actually produced a file are stripped.
 */
export async function renderMarkdownToImages(
  markdown: string,
  options: InternalRenderOptions,
): Promise<RenderResult> {
  const selections = selectRenderableBlocks(markdown, {
    kinds: options.kinds,
    registry: options.registry,
    max: options.max,
  })
  if (selections.length === 0) return { text: markdown, images: [] }

  await mkdir(options.outDir, { recursive: true })
  const acquire = options.acquire ?? ((opts) => acquirePage(opts) as unknown as Promise<PageLease>)
  const width = options.width ?? DEFAULT_WIDTH
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const lease = await acquire({
    idleShutdownMs: options.idleShutdownMs,
    deviceScaleFactor: options.scale ?? DEFAULT_SCALE,
  })
  const page = lease.page as RenderPage

  const images: RenderedImage[] = []
  const rendered: BlockSelection[] = []
  try {
    await page.setViewportSize({ width, height: 800 })
    await page.setContent(pageHtml({ theme: options.theme, width }))
    await page.addScriptTag({ path: pageBundlePath() })

    for (const [index, selection] of selections.entries()) {
      const source = markdown.slice(selection.start, selection.end)
      const path = join(options.outDir, `aigui-${selection.kind}-${index}-${process.pid}-${images.length}.png`)
      try {
        const size = (await withTimeout(
          // A real function, not a string. Playwright evaluates a string as an *expression*: it
          // would produce the function object and never call it, so every render silently
          // returned undefined. Verified in a live browser — the fake page in the unit tests
          // cannot distinguish the two, which is exactly why it went unnoticed.
          page.evaluate(
            (arg) =>
              (window as unknown as {
                __aiguiRenderBlock: (
                  source: string,
                  options: { width: number },
                ) => Promise<{ width: number; height: number; failed: boolean }>
              }).__aiguiRenderBlock(arg.source, { width: arg.width }),
            { source, width },
          ) as Promise<{ width: number; height: number; failed: boolean }>,
          timeoutMs,
          `rendering ${selection.kind}`,
        )) as { width: number; height: number; failed: boolean }
        // The plugin threw inside the page. Screenshotting now would attach a blank picture and
        // drop the source that explained it; leaving the block as text is the better failure.
        if (size.failed) throw new Error(`${selection.kind} failed to draw`)
        await withTimeout(
          page.locator("#root").screenshot({ path }) as Promise<unknown>,
          timeoutMs,
          `screenshotting ${selection.kind}`,
        )
        images.push({ kind: selection.kind, path, width: size.width, height: size.height })
        rendered.push(selection)
      } catch {
        // This block stays as text. The others are unaffected.
      }
    }
  } finally {
    await lease.release()
  }

  return { text: stripBlocks(markdown, rendered), images }
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm exec vitest run --project image render`
Expected: PASS, 9 tests.

If `pageBundlePath()` throws during the test because `@ai-gui/image/package.json` is not an exported subpath, add `"./package.json": "./package.json"` to the `exports` map in `packages/image/package.json` and rerun.

- [ ] **Step 6: Export**

Add to `packages/image/src/index.ts`:

```ts
export { renderMarkdownToImages } from "./render"
export type { InternalRenderOptions } from "./render"
```

- [ ] **Step 7: Commit**

```bash
git add packages/image/src packages/image/package.json pnpm-lock.yaml
git commit -m "feat(image): renderMarkdownToImages with per-block degradation"
```

---

## Task 8: End-to-end screenshot test

This is the only test that needs a real Chromium, so it is opt-in. Without it nothing verifies that the page bundle, the quiescence logic, and Playwright actually agree.

**Files:**
- Create: `packages/image/src/page/html.test.ts`
- Create: `packages/image/src/render.e2e.test.ts`

- [ ] **Step 1: Test the page template**

`pageHtml` is a pure string function, so it costs nothing to pin down and it is the one part of the page that can be checked without a browser.

`packages/image/src/page/html.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { pageHtml } from "./html"

describe("pageHtml", () => {
  it("defaults to a light background", () => {
    expect(pageHtml()).toContain("background:#ffffff")
  })

  it("switches to the dark palette on request", () => {
    const html = pageHtml({ theme: "dark" })
    expect(html).toContain("background:#161616")
    expect(html).not.toContain("background:#ffffff")
  })

  it("kills animation, so nothing is captured mid-frame", () => {
    expect(pageHtml()).toContain("animation:none!important")
    expect(pageHtml()).toContain("transition:none!important")
  })

  it("names CJK faces, because a screenshot cannot fall back later", () => {
    expect(pageHtml()).toContain("PingFang SC")
    expect(pageHtml()).toContain("Noto Sans CJK SC")
  })

  it("constrains the root to the requested width", () => {
    expect(pageHtml({ width: 500 })).toContain("max-width:500px")
  })

  it("carries the plugin stylesheets, or every picture renders unstyled", () => {
    const html = pageHtml()
    expect(html).toContain("data-aigui-renderer")
    expect(html.length).toBeGreaterThan(2000)
  })

  it("gives the renderer the root the screenshot targets", () => {
    expect(pageHtml()).toContain('<div id="root"></div>')
  })

  /**
   * These two caught a bug that every other assertion missed: KaTeX's default stylesheet is an
   * `@import` of a bare npm specifier, which resolves to nothing in a `setContent` page. Formulas
   * rendered as flat text — `\frac{a}{b}` came out as "ba" — at a plausible size, so only looking
   * at the picture revealed it.
   */
  it("carries KaTeX's real stylesheet, not an unresolvable @import", () => {
    const html = pageHtml()
    expect(html).toContain(".katex")
    expect(html).not.toContain('@import "katex')
  })

  it("inlines the KaTeX fonts, so no request has to succeed for maths to look right", () => {
    const html = pageHtml()
    expect(html).toContain("data:font/woff2;base64,")
    expect(html).not.toContain("cdn.jsdelivr.net")
  })
})
```

Run: `pnpm exec vitest run --project image html`
Expected: PASS, 9 tests.

- [ ] **Step 2: Write the end-to-end test**

`packages/image/src/render.e2e.test.ts`:

```ts
import { mkdtemp, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { closeBrowser } from "./browser"
import { renderMarkdownToImages } from "./render"

const enabled = process.env.AIGUI_IMAGE_E2E === "1"

afterAll(async () => {
  await closeBrowser()
})

describe.skipIf(!enabled)("renderMarkdownToImages (real Chromium)", () => {
  /**
   * `minHeight` is the assertion that earns its keep. `#root` carries 16px of padding on each
   * side, so an *empty* root still measures 32px tall — a blank render sails past any threshold
   * below that. Each case therefore names a height only a genuinely drawn block can reach.
   */
  const cases: Array<[string, string, number]> = [
    ["chart", '```chart\n{"xAxis":{"type":"category","data":["A","B"]},"yAxis":{"type":"value"},"series":[{"type":"bar","data":[3,7]}]}\n```', 300],
    ["mermaid", "```mermaid\ngraph TD;\nA-->B;\nB-->C;\n```", 120],
    // Measured, not guessed: a properly typeset fraction plus the root's 32px padding comes to
    // ~99px. Unstyled — the KaTeX-CSS bug — it collapsed to 29px, and an empty root is 32px. 80
    // sits above both failure modes and comfortably below the real thing.
    ["math", "$$\n\\frac{a}{b} = c\n$$", 80],
    ["table", "| 城市 | 温度 |\n| --- | --- |\n| 东京 | 24 |\n| 上海 | 31 |", 80],
  ]

  it.each(cases)("draws a %s to a non-trivial PNG", async (kind, source, minHeight) => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-e2e-"))
    const result = await renderMarkdownToImages(source, { outDir, timeoutMs: 30_000 })
    expect(result.images.map((image) => image.kind)).toEqual([kind])
    expect(result.text).toBe("")
    const info = await stat(result.images[0].path)
    // A blank 720px PNG compresses to roughly a kilobyte. Anything real is far larger.
    expect(info.size).toBeGreaterThan(2000)
    expect(result.images[0].width).toBeGreaterThan(50)
    expect(result.images[0].height).toBeGreaterThan(minHeight)
  }, 60_000)

  /**
   * Mermaid is the case that catches a regression of the quiescence race. Its plugin resolves
   * asynchronously, so if the page ever again declares a block finished merely because the DOM
   * went quiet, this screenshots an empty `data-aigui-async-pending` div and the height collapses
   * to the padding. Repeated because the failure was intermittent by nature.
   */
  it("waits for Mermaid every time, not just when it happens to be fast", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-e2e-mermaid-"))
    const source = "```mermaid\ngraph TD;\nA[Start]-->B[Middle];\nB-->C[End];\n```"
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await renderMarkdownToImages(source, { outDir, timeoutMs: 30_000 })
      expect(result.images).toHaveLength(1)
      expect(result.images[0].height).toBeGreaterThan(120)
    }
  }, 120_000)

  it("typesets symbols a fallback font does not have", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-e2e-symbols-"))
    const source = "$$\n\\sum_{i=1}^{n} \\sqrt{\\frac{x_i}{\\alpha}} \\in \\mathbb{R}\n$$"
    const result = await renderMarkdownToImages(source, { outDir, timeoutMs: 30_000 })
    expect(result.images).toHaveLength(1)
    // Blackboard bold and the big operators only exist in KaTeX's own faces. If the fonts failed
    // to load this still renders, just wrong — so lean on the height a real radical forces.
    expect(result.images[0].height).toBeGreaterThan(90)
  }, 60_000)

  it("renders CJK text without tofu", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-e2e-cjk-"))
    const result = await renderMarkdownToImages("| 项目 | 数值 |\n| --- | --- |\n| 营业额 | 一万 |", {
      outDir,
      timeoutMs: 30_000,
    })
    const info = await stat(result.images[0].path)
    expect(info.size).toBeGreaterThan(2000)
  }, 60_000)

  it("keeps the prose and drops only the fence", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-e2e-mixed-"))
    const source = 'Here is the breakdown.\n\n```chart\n{"series":[{"type":"pie","data":[{"value":5,"name":"A"},{"value":3,"name":"B"}]}]}\n```\n\nLet me know if you want it by month.'
    const result = await renderMarkdownToImages(source, { outDir, timeoutMs: 30_000 })
    expect(result.text).toBe("Here is the breakdown.\n\nLet me know if you want it by month.")
    expect(result.images).toHaveLength(1)
  }, 60_000)
})
```

- [ ] **Step 3: Install Chromium and run it**

```bash
pnpm --filter @ai-gui/image exec playwright install chromium
pnpm --filter @ai-gui/image build
AIGUI_IMAGE_E2E=1 pnpm exec vitest run --project image render.e2e
```

Expected: PASS, 8 tests.

- [ ] **Step 4: Actually look at the pictures**

A passing size assertion is not the same as a correct picture. Render one of each kind to a directory that survives the test run and open them:

```bash
node -e '
const { renderMarkdownToImages } = require("./packages/image/dist/index.cjs")
const cases = {
  chart: `\`\`\`chart\n{"xAxis":{"type":"category","data":["A","B"]},"yAxis":{"type":"value"},"series":[{"type":"bar","data":[3,7]}]}\n\`\`\``,
  mermaid: "```mermaid\ngraph TD;\nA-->B;\nB-->C;\n```",
  math: "$$\n\\frac{a}{b} = c\n$$",
  table: "| 城市 | 温度 |\n| --- | --- |\n| 东京 | 24 |\n| 上海 | 31 |",
}
;(async () => {
  for (const [k, v] of Object.entries(cases)) {
    const r = await renderMarkdownToImages(v, { outDir: "/tmp/aigui-look" })
    console.log(k, r.images[0]?.path, r.images[0]?.width + "x" + r.images[0]?.height)
  }
  const { closeBrowser } = require("./packages/image/dist/index.cjs")
  await closeBrowser()
})()
'
```

Then read each PNG and confirm with your own eyes: the chart has bars and axis labels, the Mermaid diagram has three connected boxes with visible text, the formula is typeset rather than raw TeX, and the table's Chinese characters are real glyphs rather than boxes. Report what you actually saw. If a picture is wrong, say so — every automated assertion here can pass on a subtly broken image.

- [ ] **Step 5: Confirm the default run still skips the browser tests**

Run: `pnpm exec vitest run --project image`
Expected: the e2e tests report as skipped; the `html.test.ts` tests run and pass; everything else passes.

- [ ] **Step 6: Commit**

```bash
git add packages/image/src/render.e2e.test.ts packages/image/src/page/html.test.ts
git commit -m "test(image): page template unit tests and opt-in screenshot coverage"
```

---

## Task 9: `@ai-gui/image` README

**Files:**
- Create: `packages/image/README.md`
- Modify: `README.md`

- [ ] **Step 1: Write the package README**

`packages/image/README.md`:

````markdown
# @ai-gui/image

Render [AIGUI](../../README.md) markdown blocks — ECharts charts, Mermaid diagrams, KaTeX math, tables, cards, dashboards — to PNG, by running the real `@ai-gui/vanilla` renderer in a headless Chromium and screenshotting each block.

Use it where a channel carries pictures but not markup: WeChat, email, an image-only webhook.

## Install

```sh
pnpm add @ai-gui/image playwright
pnpm exec playwright install chromium
```

Playwright is an optional peer dependency. Without it every render throws `BrowserUnavailableError`, so a host can treat pictures as a bonus rather than a requirement.

On Linux the container also needs CJK faces, or Chinese renders as tofu in the delivered image:

```sh
apt-get install -y fonts-noto-cjk
```

Maths needs nothing: KaTeX's stylesheet and all twenty of its font faces are inlined into the page, so formulas typeset correctly with no network and no system fonts. Only CJK text depends on what the host has installed.

## Usage

```ts
import { renderMarkdownToImages } from "@ai-gui/image"

const { text, images } = await renderMarkdownToImages(answer, { outDir: "/tmp/aigui" })
// text   — the answer with every rendered block removed
// images — [{ kind: "chart", path: "/tmp/aigui/aigui-chart-0-…png", width, height }]
```

Blocks that fail to render are left in `text` as their original source, so a broken diagram costs a picture, never the answer.

## Exports

- `renderMarkdownToImages(markdown, options)` — the whole job.
- `selectRenderableBlocks(markdown, options)` / `stripBlocks(markdown, selections)` — the pure parts, if you want to drive rendering yourself.
- `hasTrigger(markdown)` — a cheap pre-filter for hot paths.
- `closeBrowser()` — shut the resident Chromium down now instead of waiting for the idle timer.
- `BrowserUnavailableError` — Playwright is not installed.

## Options

- `outDir` — where PNGs are written (required).
- `kinds` — which families to draw. Default: all six.
- `theme` — `"light"` (default) or `"dark"`.
- `width` — viewport width in CSS pixels. Default 720.
- `scale` — device pixels per CSS pixel. Default 2, which is what a phone screen wants.
- `max` — cap on pictures per call. Default 6; the rest stay as text.
- `timeoutMs` — per-block budget. Default 10000.
- `idleShutdownMs` — how long the browser stays resident with nothing to do. Default 300000.

## Cost when there is nothing to draw

`renderMarkdownToImages` parses before it launches anything, and returns the source untouched if no block qualifies. The browser is lazy and shuts itself down after five idle minutes, so a process that renders one chart an hour does not hold a Chromium open in between.

## Testing

The screenshot tests need a real browser and are opt-in:

```sh
pnpm exec playwright install chromium
AIGUI_IMAGE_E2E=1 pnpm exec vitest run --project image render.e2e
```
````

- [ ] **Step 2: Add it to the root README**

In `README.md`, add `@ai-gui/image` to the optional-install list in the Install section:

```sh
# rendering blocks to images, server-side (optional)
pnpm add @ai-gui/image
```

- [ ] **Step 3: Commit**

```bash
git add packages/image/README.md README.md
git commit -m "docs(image): package README and root README entry"
```

---

## Task 10: Scaffold `@ai-gui/openclaw`

**Files:**
- Create: `packages/openclaw/package.json`
- Create: `packages/openclaw/openclaw.plugin.json`
- Create: `packages/openclaw/tsconfig.json`
- Create: `packages/openclaw/tsdown.config.ts`
- Create: `packages/openclaw/src/index.ts`
- Create: `packages/openclaw/src/manifest.test.ts`
- Copy: `packages/openclaw/LICENSE`
- Modify: `vitest.workspace.ts`

- [ ] **Step 1: Create the package manifest**

`packages/openclaw/package.json`. `openclaw.extensions` is how OpenClaw finds the runtime entry — it must point at built JavaScript, not TypeScript source.

```json
{
  "name": "@ai-gui/openclaw",
  "version": "0.30.0",
  "description": "OpenClaw plugin that renders AIGUI blocks as images for channels that only carry pictures, such as WeChat.",
  "keywords": ["openclaw", "wechat", "weixin", "chart", "plugin", "aigui"],
  "license": "MIT",
  "author": "Liang Li <ll_faw@hotmail.com>",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/liliang-cn/aigui.git",
    "directory": "packages/openclaw"
  },
  "homepage": "https://github.com/liliang-cn/aigui#readme",
  "bugs": "https://github.com/liliang-cn/aigui/issues",
  "type": "module",
  "engines": { "node": ">=18" },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    }
  },
  "openclaw": { "extensions": "./dist/index.js" },
  "files": ["dist", "openclaw.plugin.json", "README.md", "LICENSE"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "tsdown",
    "test": "pnpm --dir ../.. exec vitest run --project openclaw",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@ai-gui/image": "workspace:*"
  },
  "devDependencies": { "@types/node": "^22.0.0" },
  "peerDependencies": { "openclaw": ">=2026.5.12", "playwright": "^1.48.0" },
  "peerDependenciesMeta": {
    "openclaw": { "optional": true },
    "playwright": { "optional": true }
  }
}
```

- [ ] **Step 2: Create the OpenClaw manifest**

`packages/openclaw/openclaw.plugin.json`. OpenClaw reads this to validate config **without executing plugin code**, so every config key must be declared here or the gateway rejects the config.

```json
{
  "id": "ai-gui",
  "name": "AIGUI",
  "description": "Renders charts, diagrams, math, tables, cards and dashboards as images for picture-only channels.",
  "version": "0.30.0",
  "contracts": { "tools": ["aigui_render"] },
  "toolMetadata": { "aigui_render": { "optional": true } },
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "channels": { "type": "array", "items": { "type": "string" } },
      "blocks": {
        "type": "array",
        "items": { "enum": ["chart", "mermaid", "dashboard", "card", "math", "table"] }
      },
      "theme": { "enum": ["light", "dark"] },
      "width": { "type": "integer", "minimum": 200, "maximum": 2000 },
      "scale": { "type": "integer", "minimum": 1, "maximum": 4 },
      "maxImages": { "type": "integer", "minimum": 1, "maximum": 20 },
      "timeoutMs": { "type": "integer", "minimum": 1000, "maximum": 120000 },
      "idleShutdownMs": { "type": "integer", "minimum": 10000, "maximum": 3600000 }
    }
  }
}
```

- [ ] **Step 3: Create tsconfig and build config**

`packages/openclaw/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "lib": ["ES2022"] },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts", "src/**/*.spec.ts"]
}
```

`packages/openclaw/tsdown.config.ts`:

```ts
import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  external: ["openclaw", "playwright", /^openclaw\//],
})
```

- [ ] **Step 4: Create the source entry and pin the manifest to it**

A package with no `src/` breaks three things at once: `tsc --noEmit` reports no inputs, `tsdown` has no entry, and a registered vitest project with no test files errors out. So the entry exists from the start, holding the two names that must agree between the code and the manifest.

`packages/openclaw/src/index.ts`:

```ts
/** The id OpenClaw knows this plugin by. Must match `openclaw.plugin.json`. */
export const PLUGIN_ID = "ai-gui"

/** The agent tool this plugin registers. Must be declared in the manifest's `contracts.tools`. */
export const TOOL_NAME = "aigui_render"
```

(Task 14 moves both constants into their own `constants.ts` once `tool.ts` needs to share them; the exports from this barrel stay the same.)

`packages/openclaw/src/manifest.test.ts`. OpenClaw reads `openclaw.plugin.json` to validate configuration *without executing plugin code*, and it rejects a tool that the manifest does not declare. That makes the manifest and the code two sources of one truth, which is exactly the pair worth pinning together.

```ts
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { PLUGIN_ID, TOOL_NAME } from "./index"

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL("../openclaw.plugin.json", import.meta.url)), "utf8"),
) as {
  id: string
  contracts: { tools: string[] }
  toolMetadata: Record<string, { optional?: boolean }>
  configSchema: { properties: Record<string, unknown>; additionalProperties: boolean }
}

describe("openclaw.plugin.json", () => {
  it("declares the id the code uses", () => {
    expect(manifest.id).toBe(PLUGIN_ID)
  })

  it("declares the tool the code registers", () => {
    // A tool missing from contracts.tools is skipped at load time and reported as a diagnostic.
    expect(manifest.contracts.tools).toContain(TOOL_NAME)
  })

  it("keeps the tool opt-in", () => {
    expect(manifest.toolMetadata[TOOL_NAME]?.optional).toBe(true)
  })

  it("declares every config key the plugin reads", () => {
    // `additionalProperties: false` means an undeclared key fails the operator's whole config.
    expect(manifest.configSchema.additionalProperties).toBe(false)
    expect(Object.keys(manifest.configSchema.properties).sort()).toEqual([
      "blocks",
      "channels",
      "idleShutdownMs",
      "maxImages",
      "scale",
      "theme",
      "timeoutMs",
      "width",
    ])
  })
})
```

Run: `pnpm exec vitest run --project openclaw`
Expected: PASS, 4 tests.

- [ ] **Step 5: Register with the test workspace**

Add to the `alias` object in `vitest.workspace.ts`:

```ts
  "@ai-gui/openclaw": fileURLToPath(new URL("./packages/openclaw/src/index.ts", import.meta.url)),
```

Add to the projects array:

```ts
  {
    resolve: { alias },
    test: { name: "openclaw", root: "packages/openclaw", coverage },
  },
```

- [ ] **Step 6: Licence and install**

```bash
cp packages/plugin-chart/LICENSE packages/openclaw/LICENSE
pnpm install
```

- [ ] **Step 7: Verify the package builds and typechecks**

```bash
pnpm --filter @ai-gui/openclaw build
pnpm --filter @ai-gui/openclaw exec tsc --noEmit
pnpm build
```

All three must succeed. The last one matters: `turbo.json`'s `build` task is unscoped and CI runs a bare `pnpm build`, so a package that cannot build breaks the whole workspace.

- [ ] **Step 8: Commit**

```bash
git add packages/openclaw vitest.workspace.ts pnpm-lock.yaml
git commit -m "feat(openclaw): scaffold @ai-gui/openclaw plugin package"
```

---

## Task 11: Config resolution

**Files:**
- Create: `packages/openclaw/src/config.ts`
- Create: `packages/openclaw/src/config.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/openclaw/src/config.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { resolveConfig } from "./config"

describe("resolveConfig", () => {
  it("defaults to WeChat only, so no other channel changes behaviour on install", () => {
    expect(resolveConfig(undefined).channels).toEqual(["openclaw-weixin"])
  })

  it("defaults to every block family", () => {
    expect(resolveConfig(undefined).blocks).toEqual(["chart", "mermaid", "dashboard", "card", "math", "table"])
  })

  it("carries the documented numeric defaults", () => {
    const config = resolveConfig(undefined)
    expect(config).toMatchObject({
      theme: "light",
      width: 720,
      scale: 2,
      maxImages: 6,
      timeoutMs: 10_000,
      idleShutdownMs: 300_000,
    })
  })

  it("takes operator overrides", () => {
    const config = resolveConfig({ channels: ["telegram"], theme: "dark", maxImages: 2 })
    expect(config.channels).toEqual(["telegram"])
    expect(config.theme).toBe("dark")
    expect(config.maxImages).toBe(2)
    expect(config.width).toBe(720)
  })

  it("ignores junk rather than failing a reply", () => {
    const config = resolveConfig({ channels: "telegram", theme: "chartreuse", maxImages: -4 } as never)
    expect(config.channels).toEqual(["openclaw-weixin"])
    expect(config.theme).toBe("light")
    expect(config.maxImages).toBe(6)
  })

  it("accepts an unknown channel id without complaint", () => {
    expect(resolveConfig({ channels: ["some-future-channel"] }).channels).toEqual(["some-future-channel"])
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm exec vitest run --project openclaw config`
Expected: FAIL — `Failed to resolve import "./config"`.

- [ ] **Step 3: Write the implementation**

`packages/openclaw/src/config.ts`:

```ts
import type { RenderableKind } from "@ai-gui/image"

export interface AiguiPluginConfig {
  channels: string[]
  blocks: RenderableKind[]
  theme: "light" | "dark"
  width: number
  scale: number
  maxImages: number
  timeoutMs: number
  idleShutdownMs: number
}

const ALL_BLOCKS: RenderableKind[] = ["chart", "mermaid", "dashboard", "card", "math", "table"]

const DEFAULTS: AiguiPluginConfig = {
  // WeChat only. Telegram and Slack already render markdown; turning pictures on for them is an
  // opinion an operator should have to state, not something an install imposes.
  channels: ["openclaw-weixin"],
  blocks: ALL_BLOCKS,
  theme: "light",
  width: 720,
  scale: 2,
  maxImages: 6,
  timeoutMs: 10_000,
  idleShutdownMs: 300_000,
}

function strings(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback
  const out = value.filter((item): item is string => typeof item === "string" && item.length > 0)
  return out.length > 0 ? out : fallback
}

function blocks(value: unknown, fallback: RenderableKind[]): RenderableKind[] {
  if (!Array.isArray(value)) return fallback
  const out = value.filter((item): item is RenderableKind => ALL_BLOCKS.includes(item as RenderableKind))
  return out.length > 0 ? out : fallback
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  const rounded = Math.round(value)
  return rounded >= min && rounded <= max ? rounded : fallback
}

/**
 * Turn whatever the operator wrote into a usable config.
 *
 * Nothing here throws. A typo in a config file must not be able to stop replies from being
 * delivered — the worst it can do is leave a setting at its default.
 */
export function resolveConfig(raw: unknown): AiguiPluginConfig {
  const input = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>
  return {
    channels: strings(input.channels, DEFAULTS.channels),
    blocks: blocks(input.blocks, DEFAULTS.blocks),
    theme: input.theme === "dark" ? "dark" : "light",
    width: integer(input.width, DEFAULTS.width, 200, 2000),
    scale: integer(input.scale, DEFAULTS.scale, 1, 4),
    maxImages: integer(input.maxImages, DEFAULTS.maxImages, 1, 20),
    timeoutMs: integer(input.timeoutMs, DEFAULTS.timeoutMs, 1000, 120_000),
    idleShutdownMs: integer(input.idleShutdownMs, DEFAULTS.idleShutdownMs, 10_000, 3_600_000),
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --project openclaw config`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/openclaw/src
git commit -m "feat(openclaw): config resolution that never throws"
```

---

## Task 12: Payload rewriting

**Files:**
- Create: `packages/openclaw/src/rewrite.ts`
- Create: `packages/openclaw/src/rewrite.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/openclaw/src/rewrite.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { rewritePayload } from "./rewrite"

describe("rewritePayload", () => {
  it("replaces the text and appends the pictures", () => {
    const result = rewritePayload({ text: "old" }, "Intro.\n\nOutro.", ["/tmp/a.png"])
    expect(result.text).toBe("Intro.\n\nOutro.")
    expect(result.mediaUrls).toEqual(["/tmp/a.png"])
  })

  it("keeps media the payload already carried, pictures last", () => {
    const result = rewritePayload({ text: "x", mediaUrls: ["/tmp/voice.ogg"] }, "y", ["/tmp/a.png"])
    expect(result.mediaUrls).toEqual(["/tmp/voice.ogg", "/tmp/a.png"])
  })

  it("folds a single existing mediaUrl into the list", () => {
    const result = rewritePayload({ text: "x", mediaUrl: "/tmp/one.png" }, "y", ["/tmp/a.png"])
    expect(result.mediaUrls).toEqual(["/tmp/one.png", "/tmp/a.png"])
    expect(result.mediaUrl).toBeUndefined()
  })

  it("drops the text entirely when the message was nothing but a picture", () => {
    const result = rewritePayload({ text: "```chart\n{}\n```" }, "", ["/tmp/a.png"])
    expect(result.text).toBeUndefined()
    expect(result.mediaUrls).toEqual(["/tmp/a.png"])
  })

  it("leaves the payload alone when nothing was drawn", () => {
    const payload = { text: "hello", replyToId: "42" }
    expect(rewritePayload(payload, "hello", [])).toBe(payload)
  })

  it("preserves unrelated payload fields", () => {
    const result = rewritePayload({ text: "x", replyToId: "42", isReasoning: false }, "y", ["/tmp/a.png"])
    expect(result.replyToId).toBe("42")
    expect(result.isReasoning).toBe(false)
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm exec vitest run --project openclaw rewrite`
Expected: FAIL — `Failed to resolve import "./rewrite"`.

- [ ] **Step 3: Write the implementation**

`packages/openclaw/src/rewrite.ts`:

```ts
/** The reply fields this plugin touches. Structural, so no OpenClaw import is needed to test it. */
export interface RewritablePayload {
  text?: string
  mediaUrl?: string
  mediaUrls?: string[]
  [key: string]: unknown
}

/**
 * Put the pictures into the payload and the leftover prose back into `text`.
 *
 * `text` is dropped rather than set to an empty string when the whole message was one chart: an
 * empty body is a visible blank bubble on some channels, and core treats a payload with no
 * visible text and no media as nothing to send.
 */
export function rewritePayload<T extends RewritablePayload>(
  payload: T,
  text: string,
  imagePaths: string[],
): T {
  if (imagePaths.length === 0) return payload
  const existing = payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : [])
  const next: RewritablePayload = { ...payload, mediaUrls: [...existing, ...imagePaths] }
  delete next.mediaUrl
  if (text.trim().length > 0) next.text = text
  else delete next.text
  return next as T
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --project openclaw rewrite`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/openclaw/src
git commit -m "feat(openclaw): pure payload rewriting"
```

---

## Task 13: The `reply_payload_sending` hook

**Files:**
- Create: `packages/openclaw/src/hook.ts`
- Create: `packages/openclaw/src/hook.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/openclaw/src/hook.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import { createReplyPayloadHook } from "./hook"

const CHART = '```chart\n{"series":[{"type":"bar","data":[1,2]}]}\n```'

function deps(overrides: Record<string, unknown> = {}) {
  return {
    outDir: "/tmp/aigui",
    render: vi.fn(async () => ({ text: "Intro.", images: [{ kind: "chart", path: "/tmp/a.png", width: 1, height: 1 }] })),
    warn: vi.fn(),
    ...overrides,
  }
}

function event(payload: Record<string, unknown>, channel = "openclaw-weixin") {
  return { payload, channel, kind: "reply" as const }
}

describe("createReplyPayloadHook", () => {
  it("draws pictures for WeChat and rewrites the payload", async () => {
    const d = deps()
    const hook = createReplyPayloadHook(d)
    const result = await hook(event({ text: `Intro.\n\n${CHART}` }), {})
    expect(d.render).toHaveBeenCalledOnce()
    expect(result?.payload?.mediaUrls).toEqual(["/tmp/a.png"])
    expect(result?.payload?.text).toBe("Intro.")
  })

  it("does nothing on a channel that is not configured", async () => {
    const d = deps()
    const hook = createReplyPayloadHook(d)
    expect(await hook(event({ text: `Intro.\n\n${CHART}` }, "telegram"), {})).toBeUndefined()
    expect(d.render).not.toHaveBeenCalled()
  })

  it("does not touch the renderer for ordinary prose", async () => {
    const d = deps()
    const hook = createReplyPayloadHook(d)
    expect(await hook(event({ text: "Just a sentence." }), {})).toBeUndefined()
    expect(d.render).not.toHaveBeenCalled()
  })

  it("skips reasoning, commentary, status and error payloads", async () => {
    const d = deps()
    const hook = createReplyPayloadHook(d)
    for (const flag of ["isReasoning", "isCommentary", "isStatusNotice", "isError"]) {
      expect(await hook(event({ text: CHART, [flag]: true }), {})).toBeUndefined()
    }
    expect(d.render).not.toHaveBeenCalled()
  })

  it("skips a payload with no text", async () => {
    const d = deps()
    const hook = createReplyPayloadHook(d)
    expect(await hook(event({ mediaUrl: "/tmp/x.png" }), {})).toBeUndefined()
    expect(d.render).not.toHaveBeenCalled()
  })

  it("leaves the reply untouched when rendering throws", async () => {
    const d = deps({
      render: vi.fn(async () => {
        throw new Error("chromium is not installed")
      }),
    })
    const hook = createReplyPayloadHook(d)
    expect(await hook(event({ text: CHART }), {})).toBeUndefined()
    expect(d.warn).toHaveBeenCalledOnce()
  })

  it("warns about a missing browser only once", async () => {
    const d = deps({
      render: vi.fn(async () => {
        throw new Error("chromium is not installed")
      }),
    })
    const hook = createReplyPayloadHook(d)
    await hook(event({ text: CHART }), {})
    await hook(event({ text: CHART }), {})
    await hook(event({ text: CHART }), {})
    expect(d.warn).toHaveBeenCalledOnce()
  })

  it("leaves the reply untouched when nothing rendered", async () => {
    const d = deps({ render: vi.fn(async () => ({ text: CHART, images: [] })) })
    const hook = createReplyPayloadHook(d)
    expect(await hook(event({ text: CHART }), {})).toBeUndefined()
  })

  it("passes the resolved config through to the renderer", async () => {
    const d = deps()
    const hook = createReplyPayloadHook(d)
    await hook({ ...event({ text: CHART }), context: { pluginConfig: { maxImages: 2, theme: "dark" } } }, {})
    expect(d.render).toHaveBeenCalledWith(
      CHART,
      expect.objectContaining({ max: 2, theme: "dark", outDir: "/tmp/aigui" }),
    )
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm exec vitest run --project openclaw hook`
Expected: FAIL — `Failed to resolve import "./hook"`.

- [ ] **Step 3: Write the implementation**

`packages/openclaw/src/hook.ts`:

```ts
import { hasTrigger, type RenderOptions, type RenderResult } from "@ai-gui/image"
import { resolveConfig } from "./config"
import { rewritePayload, type RewritablePayload } from "./rewrite"

export interface HookDeps {
  /** Where PNGs are written. Resolved from the OpenClaw state directory by the plugin entry. */
  outDir: string
  render: (markdown: string, options: RenderOptions) => Promise<RenderResult>
  warn: (message: string, error?: unknown) => void
}

interface HookEvent {
  payload: RewritablePayload
  channel?: string
  context?: { pluginConfig?: unknown }
}

interface HookResult {
  payload?: RewritablePayload
}

/** Lanes that are not answer prose. A chart fence in a thinking trace is not a picture request. */
const SUPPRESSED = ["isReasoning", "isCommentary", "isStatusNotice", "isError"] as const

/**
 * Turn renderable blocks in an outbound reply into pictures.
 *
 * The guards run cheapest first and the renderer is the last thing touched, so an ordinary
 * conversation never pays for this plugin being installed. Every failure path returns `undefined`,
 * which OpenClaw reads as "no opinion" and delivers the original reply: a chart that will not draw
 * costs a picture, never the answer.
 */
export function createReplyPayloadHook(deps: HookDeps) {
  let warnedAboutBrowser = false

  return async (event: HookEvent, _ctx: unknown): Promise<HookResult | undefined> => {
    const config = resolveConfig(
      (event.context?.pluginConfig ?? (_ctx as { pluginConfig?: unknown } | undefined)?.pluginConfig) ?? undefined,
    )
    if (!event.channel || !config.channels.includes(event.channel)) return undefined
    const payload = event.payload
    if (SUPPRESSED.some((flag) => payload[flag] === true)) return undefined
    const text = typeof payload.text === "string" ? payload.text : ""
    if (text.length === 0 || !hasTrigger(text)) return undefined

    let result: RenderResult
    try {
      result = await deps.render(text, {
        outDir: deps.outDir,
        kinds: config.blocks,
        theme: config.theme,
        width: config.width,
        scale: config.scale,
        max: config.maxImages,
        timeoutMs: config.timeoutMs,
        idleShutdownMs: config.idleShutdownMs,
      })
    } catch (error) {
      // Once. A gateway without Chromium would otherwise log this on every single reply.
      if (!warnedAboutBrowser) {
        warnedAboutBrowser = true
        deps.warn("AIGUI could not render blocks as images; sending the reply as text", error)
      }
      return undefined
    }

    if (result.images.length === 0) return undefined
    return { payload: rewritePayload(payload, result.text, result.images.map((image) => image.path)) }
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --project openclaw hook`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/openclaw/src
git commit -m "feat(openclaw): reply_payload_sending hook with cheap guards"
```

---

## Task 14: The `aigui_render` tool

**Files:**
- Create: `packages/openclaw/src/constants.ts`
- Modify: `packages/openclaw/src/index.ts`
- Modify: `packages/openclaw/src/manifest.test.ts`
- Create: `packages/openclaw/src/tool.ts`
- Create: `packages/openclaw/src/tool.test.ts`

- [ ] **Step 0: Give the tool's name one home**

`manifest.test.ts` pins `openclaw.plugin.json` to `TOOL_NAME`, but if `tool.ts` spells the name out separately then renaming the tool leaves the test passing while OpenClaw silently skips the registration — the precise failure that test exists to catch. The constants move to their own module so both sides can share them without `tool.ts` importing the barrel that will re-export it.

`packages/openclaw/src/constants.ts`:

```ts
/** The id OpenClaw knows this plugin by. Must match `openclaw.plugin.json`. */
export const PLUGIN_ID = "ai-gui"

/** The agent tool this plugin registers. Must be declared in the manifest's `contracts.tools`. */
export const TOOL_NAME = "aigui_render"
```

In `packages/openclaw/src/index.ts`, replace the two inline declarations with a re-export, leaving the public surface identical:

```ts
export { PLUGIN_ID, TOOL_NAME } from "./constants"
```

In `packages/openclaw/src/manifest.test.ts`, change the import to `from "./constants"`.

Run: `pnpm exec vitest run --project openclaw manifest`
Expected: PASS, 4 tests — unchanged behaviour, one source of truth.

- [ ] **Step 1: Write the failing test**

`packages/openclaw/src/tool.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import { createRenderTool } from "./tool"

describe("aigui_render", () => {
  it("is named and described for the model", () => {
    const tool = createRenderTool({ outDir: "/tmp/aigui", render: vi.fn(), warn: vi.fn() })
    expect(tool.name).toBe("aigui_render")
    expect(tool.description.length).toBeGreaterThan(20)
    expect(tool.parameters).toBeTypeOf("object")
  })

  it("returns the path of every picture it drew", async () => {
    const render = vi.fn(async () => ({
      text: "",
      images: [
        { kind: "chart", path: "/tmp/a.png", width: 1, height: 1 },
        { kind: "table", path: "/tmp/b.png", width: 1, height: 1 },
      ],
    }))
    const tool = createRenderTool({ outDir: "/tmp/aigui", render, warn: vi.fn() })
    const result = await tool.execute("id", { markdown: "```chart\n{}\n```" })
    expect(result.content[0].text).toContain("/tmp/a.png")
    expect(result.content[0].text).toContain("/tmp/b.png")
  })

  it("tells the model plainly when there was nothing to draw", async () => {
    const render = vi.fn(async () => ({ text: "prose", images: [] }))
    const tool = createRenderTool({ outDir: "/tmp/aigui", render, warn: vi.fn() })
    const result = await tool.execute("id", { markdown: "prose" })
    expect(result.content[0].text).toMatch(/no renderable/i)
  })

  it("reports a render failure as a tool result rather than throwing", async () => {
    const render = vi.fn(async () => {
      throw new Error("chromium missing")
    })
    const tool = createRenderTool({ outDir: "/tmp/aigui", render, warn: vi.fn() })
    const result = await tool.execute("id", { markdown: "```chart\n{}\n```" })
    expect(result.content[0].text).toContain("chromium missing")
  })

  it("passes theme and width through", async () => {
    const render = vi.fn(async () => ({ text: "", images: [{ kind: "chart", path: "/tmp/a.png", width: 1, height: 1 }] }))
    const tool = createRenderTool({ outDir: "/tmp/aigui", render, warn: vi.fn() })
    await tool.execute("id", { markdown: "x", theme: "dark", width: 1000 })
    expect(render).toHaveBeenCalledWith("x", expect.objectContaining({ theme: "dark", width: 1000 }))
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm exec vitest run --project openclaw tool`
Expected: FAIL — `Failed to resolve import "./tool"`.

- [ ] **Step 3: Write the implementation**

`packages/openclaw/src/tool.ts`. The JSON Schema is written by hand rather than with TypeBox so the package needs no runtime dependency for one object shape.

```ts
import { TOOL_NAME } from "./constants"
import type { HookDeps } from "./hook"

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>
}

/**
 * Let the model draw on purpose.
 *
 * The tool returns paths, not images. That is deliberate: it is the same shape OpenClaw's own
 * `image_generate` uses, where the model attaches the result with the `message` tool. Inventing a
 * second delivery mechanism here would mean owning session targeting and ordering that core
 * already handles.
 */
export function createRenderTool(deps: HookDeps) {
  return {
    name: TOOL_NAME,
    description:
      "Render AIGUI markdown (a ```chart, ```mermaid, ```dashboard or ```card fence, $$math$$, or a table) to PNG files and return their paths. Attach the returned paths with the message tool to show them in the chat.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["markdown"],
      properties: {
        markdown: { type: "string", description: "The markdown block to draw." },
        theme: { enum: ["light", "dark"], description: "Colour scheme. Defaults to light." },
        width: { type: "integer", minimum: 200, maximum: 2000, description: "Width in CSS pixels." },
      },
    },
    async execute(_id: string, params: { markdown: string; theme?: "light" | "dark"; width?: number }): Promise<ToolResult> {
      try {
        const result = await deps.render(params.markdown, {
          outDir: deps.outDir,
          theme: params.theme,
          width: params.width,
        })
        if (result.images.length === 0) {
          return { content: [{ type: "text", text: "No renderable block found in that markdown; nothing was drawn." }] }
        }
        const paths = result.images.map((image) => `${image.kind}: ${image.path}`).join("\n")
        return { content: [{ type: "text", text: `图片已生成:\n${paths}` }] }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { content: [{ type: "text", text: `Rendering failed: ${message}` }] }
      }
    },
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --project openclaw tool`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/openclaw/src
git commit -m "feat(openclaw): aigui_render agent tool"
```

---

## Task 15: Shrinking oversized pictures

A tall dashboard at 2x can run to several megabytes, which some channels reject outright. OpenClaw already owns the fix — `api.runtime.media.resizeToJpeg` — so this is a matter of plumbing it in as an optional dependency rather than reimplementing image encoding.

**Files:**
- Modify: `packages/openclaw/src/hook.ts`
- Modify: `packages/openclaw/src/hook.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/openclaw/src/hook.test.ts`:

```ts
describe("oversized pictures", () => {
  it("hands every picture to the shrinker and sends what comes back", async () => {
    const shrink = vi.fn(async (path: string) => `${path}.jpg`)
    const d = deps({ shrink })
    const hook = createReplyPayloadHook(d)
    const result = await hook(event({ text: CHART }), {})
    expect(shrink).toHaveBeenCalledWith("/tmp/a.png")
    expect(result?.payload?.mediaUrls).toEqual(["/tmp/a.png.jpg"])
  })

  it("sends the original when the shrinker declines", async () => {
    const d = deps({ shrink: vi.fn(async () => undefined) })
    const hook = createReplyPayloadHook(d)
    const result = await hook(event({ text: CHART }), {})
    expect(result?.payload?.mediaUrls).toEqual(["/tmp/a.png"])
  })

  it("sends the original when the shrinker throws", async () => {
    const d = deps({
      shrink: vi.fn(async () => {
        throw new Error("sharp is unavailable")
      }),
    })
    const hook = createReplyPayloadHook(d)
    const result = await hook(event({ text: CHART }), {})
    expect(result?.payload?.mediaUrls).toEqual(["/tmp/a.png"])
  })

  it("works with no shrinker at all", async () => {
    const d = deps()
    const hook = createReplyPayloadHook(d)
    const result = await hook(event({ text: CHART }), {})
    expect(result?.payload?.mediaUrls).toEqual(["/tmp/a.png"])
  })

  /**
   * One picture failing to shrink must not take its siblings down. The `try`/`catch` lives inside
   * the per-image callback for exactly this reason: hoisted outside the map, one rejection would
   * reject the whole `Promise.all` and the reply would arrive with no pictures at all.
   */
  it("shrinks each picture independently, so one failure costs only itself", async () => {
    const d = deps({
      render: vi.fn(async () => ({
        text: "Intro.",
        images: [
          { kind: "chart", path: "/tmp/a.png", width: 1, height: 1 },
          { kind: "mermaid", path: "/tmp/b.png", width: 1, height: 1 },
          { kind: "table", path: "/tmp/c.png", width: 1, height: 1 },
        ],
      })),
      shrink: vi.fn(async (path: string) => {
        if (path === "/tmp/b.png") throw new Error("re-encode failed")
        if (path === "/tmp/c.png") return undefined
        return `${path}.jpg`
      }),
    })
    const hook = createReplyPayloadHook(d)
    const result = await hook(event({ text: CHART }), {})
    expect(result?.payload?.mediaUrls).toEqual(["/tmp/a.png.jpg", "/tmp/b.png", "/tmp/c.png"])
  })
})
```

- [ ] **Step 2: Run to confirm they fail**

Run: `pnpm exec vitest run --project openclaw hook`
Expected: FAIL — the first test's `expect(shrink).toHaveBeenCalledWith(...)` reports zero calls.

- [ ] **Step 3: Add the dependency to the hook**

In `packages/openclaw/src/hook.ts`, extend `HookDeps`:

```ts
export interface HookDeps {
  /** Where PNGs are written. Resolved from the OpenClaw state directory by the plugin entry. */
  outDir: string
  render: (markdown: string, options: RenderOptions) => Promise<RenderResult>
  warn: (message: string, error?: unknown) => void
  /**
   * Bring a picture under the channel's size limit, returning the path to send.
   *
   * Optional, and allowed to decline by returning undefined: a picture that is already small
   * enough needs no work, and a re-encode that fails is a worse outcome than a large PNG.
   */
  shrink?: (path: string) => Promise<string | undefined>
}
```

Then replace the final line of the returned handler:

```ts
    if (result.images.length === 0) return undefined
    const paths = await Promise.all(
      result.images.map(async (image) => {
        if (!deps.shrink) return image.path
        try {
          return (await deps.shrink(image.path)) ?? image.path
        } catch {
          return image.path
        }
      }),
    )
    return { payload: rewritePayload(payload, result.text, paths) }
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --project openclaw hook`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/openclaw/src
git commit -m "feat(openclaw): optional shrink step for oversized pictures"
```

---

## Task 16: The plugin entry

**Files:**
- Create: `packages/openclaw/src/index.ts`

- [ ] **Step 1: Write the entry**

`packages/openclaw/src/index.ts`. `openclaw` is an optional peer, so the SDK import must be dynamic — importing this package in a plain Node script (or a vitest run) must not fail because OpenClaw is absent.

```ts
import { homedir } from "node:os"
import { join } from "node:path"
import { closeBrowser, renderMarkdownToImages } from "@ai-gui/image"
import { createReplyPayloadHook, type HookDeps } from "./hook"
import { createRenderTool } from "./tool"

export { createReplyPayloadHook } from "./hook"
export { createRenderTool } from "./tool"
export { resolveConfig } from "./config"
export type { AiguiPluginConfig } from "./config"
export { rewritePayload } from "./rewrite"

/** The id OpenClaw knows this plugin by. Must match `openclaw.plugin.json`. */
export const PLUGIN_ID = "ai-gui"

/** The agent tool this plugin registers. Must be declared in the manifest's `contracts.tools`. */
export const TOOL_NAME = "aigui_render"

/** The shape of the runtime this plugin reaches into. Everything on it is treated as optional. */
interface PluginApi {
  on: (name: string, handler: unknown, options?: { timeoutMs?: number }) => void
  registerTool: (tool: unknown, options?: { optional?: boolean }) => void
  runtime?: {
    paths?: { stateDir?: string }
    media?: { resizeToJpeg?: (input: Buffer, options: { maxWidth: number }) => Promise<Buffer> }
  }
}

/**
 * Where the pictures go. OpenClaw owns `media/outbound`; this plugin owns a folder inside it.
 *
 * The runtime is asked first because an operator can move the state directory, and a hardcoded
 * `~/.openclaw` would then write pictures somewhere the gateway never looks.
 */
function outboundDir(api: PluginApi): string {
  const state = api.runtime?.paths?.stateDir ?? process.env.OPENCLAW_STATE_DIR ?? join(homedir(), ".openclaw")
  return join(state, "media", "outbound", "aigui")
}

/** Wraps the runtime's re-encoder, if this OpenClaw version has one. */
function makeShrink(api: PluginApi): HookDeps["shrink"] {
  const resize = api.runtime?.media?.resizeToJpeg
  if (!resize) return undefined
  return async (path: string) => {
    const { readFile, stat, writeFile } = await import("node:fs/promises")
    const info = await stat(path)
    // Under a megabyte every channel accepts it as-is; re-encoding would only lose quality.
    if (info.size < 1_000_000) return undefined
    const jpeg = await resize(await readFile(path), { maxWidth: 1440 })
    const target = `${path}.jpg`
    await writeFile(target, jpeg)
    return target
  }
}

function deps(api: PluginApi): HookDeps {
  return {
    outDir: outboundDir(api),
    render: renderMarkdownToImages,
    warn: (message, error) => console.warn(`[ai-gui] ${message}`, error ?? ""),
    shrink: makeShrink(api),
  }
}

const { definePluginEntry } = await import("openclaw/plugin-sdk/plugin-entry")

export default definePluginEntry({
  id: "ai-gui",
  name: "AIGUI",
  description: "Renders charts, diagrams, math, tables, cards and dashboards as images for picture-only channels.",
  register(api: PluginApi) {
    const shared = deps(api)
    // Rendering can take seconds; the runner's default per-hook budget is shorter than that.
    api.on("reply_payload_sending", createReplyPayloadHook(shared), { timeoutMs: 60_000 })
    api.registerTool(createRenderTool(shared), { optional: true })
    // Without this a stopped gateway can leave a Chromium behind until its idle timer fires.
    api.on("gateway_stop", async () => {
      await closeBrowser()
    })
  },
})
```

Three things were checked against the installed `openclaw@2026.7.1` rather than assumed, and two of them contradicted this plan's first draft:

- **State directory.** `api.runtime.paths.stateDir` does not exist. The real accessor is `api.runtime.state.resolveStateDir(env?)` (`dist/types-DaHgOqFX.d.ts:3821`), which already handles `OPENCLAW_STATE_DIR` itself. The manual fallback stays only for a runtime that lacks it.
- **`resizeToJpeg`.** Takes a single object, not `(buffer, options)`: `{ buffer, maxSide, quality, withoutEnlargement? }` (`dist/media-services-BqLZh0ST.d.ts:80`). OpenClaw's own doc example at `docs/plugins/sdk-runtime.md:492` is stale.
- **`definePluginEntry` is deliberately not used.** A top-level `await import` of it breaks tsdown's `cjs` output, and the helper turns out to be a pure factory — but one with a trap. Called without an explicit `configSchema`, it defaults to `emptyPluginConfigSchema`, whose `safeParse` rejects anything non-empty with `"config must be empty"` (`dist/config-schema-ByzWLagI.js:100`). Every setting an operator wrote would be refused. Omitting the field entirely is what we want: the loader skips a plugin with no runtime schema (`dist/schema-DRyO1XBt.js:3140`), and `openclaw.plugin.json` — which OpenClaw requires to carry the schema anyway (`dist/plugins-authoring-command-DORDD8cF.js:119`) — remains the single source of config truth.

A regression guard for that last point, appended to `packages/openclaw/src/manifest.test.ts`:

```ts
import entry from "./index"

describe("plugin entry", () => {
  it("identifies itself with the manifest's id", () => {
    expect((entry as { id: string }).id).toBe(manifest.id)
  })

  /**
   * Wrapping this in `definePluginEntry` without an explicit schema would default it to
   * `emptyPluginConfigSchema`, which rejects any non-empty config outright. The manifest is where
   * the schema lives; a runtime schema here would only shadow it, and an empty one would break
   * every operator setting.
   */
  it("carries no runtime config schema, leaving the manifest authoritative", () => {
    expect("configSchema" in (entry as object)).toBe(false)
  })

  it("registers something", () => {
    expect(typeof (entry as { register: unknown }).register).toBe("function")
  })
})
```

- [ ] **Step 2: Build and typecheck**

```bash
pnpm --filter @ai-gui/openclaw build
pnpm --filter @ai-gui/openclaw exec tsc --noEmit
```

Expected: `dist/index.js` exists, no type errors.

If the top-level `await import("openclaw/plugin-sdk/plugin-entry")` fails to typecheck because the module has no types available without OpenClaw installed, add `openclaw` to the package's `devDependencies` at the version already installed globally (`2026.7.1-2`) and rerun. If the tsdown build rejects top-level await in the `cjs` output, move the import inside `register` and export a plain object matching `definePluginEntry`'s return shape.

- [ ] **Step 3: Run the whole package's tests**

Run: `pnpm exec vitest run --project openclaw`
Expected: PASS, all tests.

- [ ] **Step 4: Commit**

```bash
git add packages/openclaw/src
git commit -m "feat(openclaw): plugin entry wiring hook and tool"
```

---

## Task 17: Docs, changeset, and a live smoke test

**Files:**
- Create: `packages/openclaw/README.md`
- Create: `.changeset/aigui-image-openclaw.md`
- Modify: `README.md`

- [ ] **Step 1: Write the package README**

`packages/openclaw/README.md`:

````markdown
# @ai-gui/openclaw

An [OpenClaw](https://openclaw.ai) plugin that renders [AIGUI](../../README.md) blocks as images, so charts, diagrams, formulas, tables, cards and dashboards survive a channel that only carries pictures — WeChat above all.

WeChat messages are text or media, nothing else. Without this, a ` ```chart ` fence arrives as a wall of ECharts JSON.

## Install

```sh
openclaw plugins install @ai-gui/openclaw
openclaw config set plugins.entries.ai-gui.enabled true
openclaw gateway restart
```

Chromium is needed for rendering:

```sh
pnpm add playwright && pnpm exec playwright install chromium
```

On a Linux gateway, install CJK fonts too (`apt-get install -y fonts-noto-cjk`), or Chinese labels come out as tofu in the image.

## What it does

Two paths, both optional to use:

- **Automatic.** A `reply_payload_sending` hook scans outbound replies on the configured channels, draws any renderable block, removes the fence from the text, and attaches the PNGs. The model needs to know nothing about it.
- **Deliberate.** The optional `aigui_render` tool lets the model draw on purpose and returns file paths for the `message` tool to attach. Enable it with `tools.allow`.

A drawing that fails never costs the answer: the reply is delivered as written, fence and all.

## Configuration

```json5
{
  plugins: {
    entries: {
      "ai-gui": {
        enabled: true,
        config: {
          channels: ["openclaw-weixin"],
          blocks: ["chart", "mermaid", "dashboard", "card", "math", "table"],
          theme: "light",
          width: 720,
          scale: 2,
          maxImages: 6,
          timeoutMs: 10000,
          idleShutdownMs: 300000,
        },
      },
    },
  },
}
```

`channels` defaults to WeChat alone. Telegram and Slack already render markdown well, so turning pictures on for them is a decision an operator states rather than one an install makes.

## Cost when idle

An ordinary text conversation pays nothing. The hook checks the channel, then the payload lane, then a regex — and only launches Chromium once the parser has confirmed there is a real block to draw. The browser shuts itself down after five idle minutes.
````

- [ ] **Step 2: Add both packages to the root README**

In `README.md`, extend the feature list with one bullet:

```md
- **Pictures for picture-only channels** — `@ai-gui/image` renders any block to PNG in a headless browser, and `@ai-gui/openclaw` wires that into OpenClaw so a chart reaches WeChat as a chart.
```

- [ ] **Step 3: Write the changeset**

`.changeset/aigui-image-openclaw.md`:

```md
---
"@ai-gui/image": minor
"@ai-gui/openclaw": minor
---

Render AIGUI blocks as images for channels that only carry pictures.

`@ai-gui/image` runs the real vanilla renderer in a headless Chromium and screenshots each chart, Mermaid diagram, KaTeX formula, table, card, or dashboard. `@ai-gui/openclaw` is an OpenClaw plugin that uses it to rewrite outbound replies, so a chart reaches WeChat as a chart rather than as ECharts JSON. A block that fails to render is left as text; the answer is never lost to a failed drawing.
```

- [ ] **Step 4: Run the full verification suite**

```bash
pnpm build
pnpm typecheck
pnpm test:unit
pnpm validate:packages
```

Expected: all four pass. `validate:packages` packs both new tarballs and imports them; if it complains that a target is missing from a tarball, the `files` array or the `exports` map is wrong.

- [ ] **Step 5: Commit**

```bash
git add packages/openclaw/README.md README.md .changeset
git commit -m "docs: README and changeset for @ai-gui/image and @ai-gui/openclaw"
```

- [ ] **Step 6: Live smoke test against the running gateway**

This is the step that proves the plan, and it cannot be done from a unit test. The plugin's config key, the hook event shape, and WeChat's media handling are all assumptions until a real message arrives.

```bash
# Point OpenClaw at the local build.
openclaw plugins install "$PWD/packages/openclaw"
openclaw config set plugins.entries.ai-gui.enabled true
openclaw gateway restart
openclaw plugins inspect ai-gui --runtime --json
```

Expected from `inspect`: the plugin loads, `aigui_render` is listed, and no diagnostics are reported.

Then send yourself a WeChat message asking for a chart, and confirm:

1. The picture arrives and is readable on a phone.
2. Chinese labels render as characters, not boxes.
3. The prose arrives with the fence removed, not with a block of JSON.
4. Asking an ordinary question still replies at normal speed.
5. `~/.openclaw/media/outbound/aigui/` contains the PNGs.

If the hook never fires, check the resolved config location: this plan reads plugin config from `event.context.pluginConfig` with a fallback to `ctx.pluginConfig`, because the SDK's typed event does not declare `context`. Log both in the handler, find which one the runtime populates, and simplify `hook.ts` to read only that one.

- [ ] **Step 7: Commit any fixes the smoke test produced**

```bash
git add -A
git commit -m "fix(openclaw): corrections from the live gateway smoke test"
```
