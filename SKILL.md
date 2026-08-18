---
name: aigui
description: Use when integrating the @ai-gui SDK to render streaming LLM output as declarative generated UI, cards, revisioned artifacts, molecules, maps, markdown, charts, citations, math, and diagrams in React/Vue/vanilla; when rendering those blocks to PNG server-side for a channel that carries only pictures, such as WeChat via OpenClaw; or when generating content for an @ai-gui frontend.
---

# AIGUI

AIGUI is a framework-agnostic TypeScript SDK that renders **streaming** LLM output as live UI. A headless core parses the stream into an AST; adapters render it in React / Vue / vanilla; plugins add block types. Full detail: [AGENTS.md](./AGENTS.md) and [README.md](./README.md).

## When to use

- **Integrating**: adding `@ai-gui` to an app to render a streaming model response (markdown + cards + charts + math + diagrams).
- **Rendering to pictures**: the destination carries text and images but no markup — a chat channel, an email, an image-only webhook. See [Server-side images](#server-side-images).
- **Generating**: you are the LLM producing content that an AIGUI frontend will render.

## Integration checklist

1. **Pick an adapter** and install: `@ai-gui/core` + one of `@ai-gui/react` / `@ai-gui/vue` / `@ai-gui/vanilla`. Add plugins as needed.
2. **Register cards** on a `CardRegistry` — `register({ type, description, schema?, example?, render })`. The app owns the render component; the LLM only fills data.
   - React render: component gets `{ data, onAction }`. Vue: props `data`, emits `action`. Vanilla: `(data, { onAction }) => HTMLElement`.
3. **Mount the renderer**: `<AIRenderer ref registry plugins onCardAction />` (React/Vue) or `createRenderer(el, { registry, plugins, onCardAction })` (vanilla). Imperative API: `push` / `feed` / `reset` (+ `destroy` in vanilla).
4. **Wire `onCardAction({ type, params, cardType })`** to your real APIs. Buttons are declarative — the app makes the request, never the LLM.
5. **Add plugins**: create a stable array outside render, then pass `plugins={plugins}` — or a stable loader, `plugins={() => import("@ai-gui/plugin-mermaid").then(m => [m.mermaid()])}`, to keep the heavy bundle out of the first load. The renderer reparses what it buffered when the import lands, so no replay is needed. Plugin CSS is injected automatically; `plugin-map/style.css` and `plugin-katex/style.css` must be imported by the host.
6. **Build the system prompt** from the same registry + plugins: `buildSystemPrompt({ base, registry, plugins })`; prepend it to your system prompt. Passing `plugins` is what tells the model it may draw a diagram or write TeX — installing a plugin only teaches the renderer to draw one. Backend just streams text.
7. **Optional host hooks**: `onNodeClick(node, event)` maps a click to the parsed block it landed in; `rawHtml={false}` escapes raw HTML the model wrote instead of interpreting it.
8. **Feed the stream**: `reset()` then `feed(response.body)` — accepts a `ReadableStream` or `AsyncIterable<string>`. Renders progressively.

## Server-side images

`@ai-gui/image` renders the same blocks to PNG by running the real `@ai-gui/vanilla` renderer in a headless Chromium and screenshotting each one. Reach for it when the destination cannot display markup, not as a faster alternative to the browser path.

```ts
import { renderMarkdownToImages } from "@ai-gui/image"

const { text, images } = await renderMarkdownToImages(answer, { outDir: "/tmp/aigui" })
// text   — the answer with every rendered block removed
// images — [{ kind: "chart", path: "…png", width, height }]
```

Requires `playwright` (an optional peer) plus `playwright install chromium`. On Linux also install `fonts-noto-cjk`, or Chinese labels arrive as tofu — a screenshot cannot fall back to another font the way a web page can. Maths needs nothing extra; KaTeX's stylesheet and fonts are inlined into the page.

Four things worth knowing before using it:

- **A block that fails to render stays in `text` as its original source.** A broken diagram costs a picture, never the answer. Only blocks that actually produced a file are stripped.
- **It parses before it launches anything.** Prose costs nothing, and the browser shuts down after five idle minutes.
- **`kinds` selects the families to draw** — chart, mermaid, dashboard, card, math, table. Default is all six; `max` caps how many (default 6) and the rest stay as text.
- **The markdown path is not the same thing.** Streaming to a browser parses client-side on purpose, repairing half-typed syntax as bytes arrive. Do not reach for this package to render a live stream.

For the OpenClaw chat gateway, `@ai-gui/openclaw` wires this in with no code: install it, enable it, and a reply containing a ` ```chart ` fence reaches WeChat as prose plus a picture instead of a wall of ECharts JSON. It also exposes an optional `aigui_render` tool for drawing on purpose, which an operator must enable with `tools.allow`.

## Generation fence cheat-sheet

Write normal markdown. Add fenced blocks **only** for card/block types listed in your system prompt.

| Block | Syntax |
| --- | --- |
| Card | ` ```card:<type> ` + JSON data only |
| Generated UI | ` ```ui ` + one bounded declarative JSON tree |
| Chart | ` ```chart ` + ECharts option JSON (3D series if `gl` enabled) |
| List | ` ```list {"items":[...]} ` |
| Table | ` ```table {"headers":[...],"rows":[[...]]} ` |
| Key-value | ` ```key-value {"pairs":{...}} ` |
| Layout | ` ```layout {"direction":"row\|column","items":[...]} ` |
| Math | `$…$` inline, `$$…$$` block |
| Diagram | ` ```mermaid ` |
| Molecule | ` ```molecule ` + strict SMILES/Molfile JSON |
| Map | ` ```map ` + strict inline GeoJSON/markers/routes JSON |
| Solid geometry | ` ```solid ` + the solid, its named points, and the conditions on them — never coordinates, never a stated result |
| Function / calculus | ` ```function ` + the expression and the interval — never sampled points, never a computed slope or area |
| Ray optics | ` ```optics ` + the element and the object — never the image position or whether it is real or virtual |
| Motion | ` ```motion ` + the initial conditions — never the range, the flight time, or the velocities after a collision |
| Force diagram | ` ```physics ` + the bodies, the forces on them and their angles |
| Price chart | ` ```quote ` + bars you actually have — never prices from memory, never indicator values, never a signal |
| Labelled figure | ` ```figure ` + the regions and what each part is called |
| Progress | ` ```progress ` + one step per thing being done; re-emit the same `id` to update it |
| Flashcards | ` ```flashcards ` + the questions and answers to revise from |
| Sources | ` ```sources {"sources":[{"id":"...","title":"...","url":"https://..."}]} ` |
| Artifact create | ` ```artifact-create ` + strict JSON document definition |
| Artifact update | ` ```artifact-update ` + `operationId`, `id`, exact `baseRevision`, and full replacement content |

Card example:

    ```card:weather
    { "city": "Tokyo", "tempC": 24 }
    ```

## Key rules

- **Cards are app-defined** — only emit registered card types, filling data that matches the given schema/example. Do not invent types.
- **UI trees are bounded and declarative** — use only enabled node kinds, registered actions/cards, flat scalar state, and exact `{"$state":"key"}` bindings; never emit code, expressions, URLs, remote components, or workflows.
- **Buttons are declarative** — cards carry an `action` + `params`; the app performs the real request. Never claim you did it.
- **Blocks are complete-gated** — cards/charts/math/mermaid show a skeleton while streaming, then render complete (charts/3D never partial-drawn). Plain markdown renders progressively.
- **Call `buildSystemPrompt`** — don't hand-write generation rules; it assembles card specs + each plugin's prompt spec.
- **Only emit enabled block types** — everything else is plain markdown.
- **Source blocks are data only** — never emit scripts, callbacks, remote modules, credentials, or unsafe URLs.
- **Artifacts are inert documents** — code/HTML are previewed as source, never executed; every update must use the current revision and a unique operation ID.
- **Molecules use local chemistry data only** — SMILES is 2D-only in v1; 3D requires a local Molfile with real 3D coordinates. No URLs or network operations.
- **Maps are host-networked** — the model may emit only inline geographic data. Basemaps, tile providers, tokens, and network policy belong exclusively to the host.
- **`evidence` and `resultset` are the host's, not yours** — those fences are appended by the application from what it actually executed. A model that can invent a number can invent the query said to have produced it, so emitting one is claiming provenance you do not have.

See [AGENTS.md](./AGENTS.md) for full examples.
