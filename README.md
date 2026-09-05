# AIGUI

A framework-agnostic TypeScript SDK for rendering **streaming** LLM output as generated interfaces, interactive cards, revisioned artifacts, markdown, charts, citations, math, and diagrams.

AIGUI turns a raw model stream into a live, structured UI. Text and markdown render progressively (with in-memory repair of half-typed syntax); richer blocks (cards, charts, math, mermaid) show a loading skeleton while they stream, then render complete. A headless core emits a framework-agnostic AST plus patches; thin adapters render it in React, Vue, or vanilla DOM; plugins add block types.

## Features

- **Streaming-first** — progressive markdown with live repair of incomplete syntax; block types are complete-gated (skeleton → full render).
- **CJK-correct markdown** — emphasis closes where CommonMark refuses to, so `**严格单调（单射）**的函数` renders bold instead of showing its asterisks. ASCII parsing is unchanged.
- **Framework-agnostic core** — one headless engine, adapters for React / Vue / vanilla.
- **App-defined cards** — the LLM only fills data into fenced `card:<type>` blocks; your app owns the schema, the render component, and the real API calls behind buttons.
- **Declarative generated UI** — one bounded `ui` tree composes layout, data, forms, registered actions, local bindings, and host-owned card components without generated code.
- **Pluggable blocks** — KaTeX math, Mermaid/UML diagrams, molecular structures, interactive maps, ECharts charts, primitive UI, secure source lists, and teaching figures across six subjects.
- **One stream, many channels** — the answer's text is a single-writer buffer, so progress, background jobs and late tool results ride their own channel and update a Card by id, in any order and as often as they like. `cardChannel(store)` wires it in one line.
- **Prompt assembly** — `buildSystemPrompt` produces the system-prompt guidance (card specs + each plugin's prompt spec) so the model knows exactly what it may emit. Pass `locale` to get those rules in the product's language: `buildSystemPrompt({ registry, plugins, locale: "zh-CN" })`.
- **Deferrable plugins** — pass a loader instead of an array (`plugins={() => import("@ai-gui/plugin-mermaid").then(m => [m.mermaid()])}`); the answer streams as plain markdown and the renderer reparses what it buffered once the chunk lands, with no replay in the host.
- **Clicks mapped to the model's output** — `onNodeClick(node, event)` reports which parsed block a click landed in, so a path in inline code or a citation can be actionable without reading the DOM.
- **Safe by default** — the core sanitizes all HTML output, and `rawHtml={false}` escapes the tags a model writes in prose instead of interpreting them.
- **Observable when requested** — opt-in debug events and `@ai-gui/devtools` provide a bounded, redacted runtime timeline and deterministic stream simulator.
- **Revisioned artifacts** — models can create and update persistent text, code, Markdown, and JSON documents without executing generated code.
- **Pictures for picture-only channels** — `@ai-gui/image` renders any block to PNG in a headless browser, and `@ai-gui/openclaw` wires that into OpenClaw so a chart reaches WeChat as a chart.
- **Tiny surface, well tested** — 1360+ tests, built with [tsdown](https://github.com/rolldown/tsdown).

## Install

Install the core plus the adapter for your framework, then any plugins you want:

```sh
# React
pnpm add @ai-gui/core @ai-gui/react

# Vue
pnpm add @ai-gui/core @ai-gui/vue

# vanilla DOM
pnpm add @ai-gui/core @ai-gui/vanilla

# plugins (optional)
pnpm add @ai-gui/plugin-solid @ai-gui/plugin-scene @ai-gui/plugin-function @ai-gui/plugin-optics @ai-gui/plugin-motion @ai-gui/plugin-gravity @ai-gui/plugin-graph @ai-gui/plugin-physics @ai-gui/plugin-quote @ai-gui/plugin-figure @ai-gui/plugin-ui @ai-gui/plugin-katex @ai-gui/plugin-highlight @ai-gui/plugin-mermaid @ai-gui/plugin-molecule @ai-gui/plugin-map @ai-gui/plugin-primitives @ai-gui/plugin-chart @ai-gui/plugin-dashboard @ai-gui/plugin-bigscreen @ai-gui/plugin-form @ai-gui/plugin-citation @ai-gui/plugin-artifact @ai-gui/plugin-progress @ai-gui/plugin-flashcard @ai-gui/plugin-evidence @ai-gui/plugin-resultset

# plugin authoring helpers (optional)
pnpm add @ai-gui/plugin-sdk

# model stream adapters (optional, no provider SDK required)
pnpm add @ai-gui/openai # or @ai-gui/anthropic / @ai-gui/vercel-ai

# development diagnostics (optional)
pnpm add -D @ai-gui/devtools

# rendering blocks to images, server-side (optional)
pnpm add @ai-gui/image

# an OpenClaw plugin that uses it, for chat channels that carry only pictures (optional)
openclaw plugins install "@ai-gui/openclaw"

# server-driven cards over a WebSocket, for a backend with no frontend project (optional)
pnpm add @ai-gui/live
```

## Quick start — React

Register a card type (schema + render component), mount `<AIRenderer>`, feed it a streaming response, and build the system prompt from the same registry.

```tsx
import { CardRegistry, buildSystemPrompt } from "@ai-gui/core"
import { AIRenderer } from "@ai-gui/react"
import { useRef } from "react"

// 1. Define a card. The LLM only fills `data`; the app owns the render + actions.
const registry = new CardRegistry()
registry.register({
  type: "weather",
  description: "A weather summary for a city",
  schema: { type: "object", properties: { city: { type: "string" }, tempC: { type: "number" } } },
  example: { city: "Tokyo", tempC: 24 },
  render: ({ data, onAction }: { data: any; onAction: (a: any) => void }) => (
    <div className="weather-card">
      <b>{data.city}</b> — {data.tempC}°C
      <button onClick={() => onAction({ type: "refresh", params: { city: data.city } })}>
        Refresh
      </button>
    </div>
  ),
})

function Chat() {
  const ref = useRef<React.ComponentRef<typeof AIRenderer>>(null)

  async function ask(prompt: string) {
    // Pass `plugins` too, or the model is never told it may draw a diagram or write TeX.
    const system = buildSystemPrompt({ registry, plugins })
    const res = await fetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ system, prompt }),
    })
    ref.current?.reset()
    await ref.current?.feed(res.body!) // feed a ReadableStream directly
  }

  return (
    <AIRenderer
      ref={ref}
      registry={registry}
      // buttons emit here; the APP makes the real request, never the LLM
      onCardAction={({ type, params, cardType }) => {
        console.log(cardType, type, params)
      }}
    />
  )
}
```

`useAIRenderer(options)` is the hook form, returning `{ nodes, push, feed, reset }` if you want to drive rendering yourself.

## Quick start — Vue

```vue
<script setup lang="ts">
import { ref } from "vue"
import { CardRegistry, buildSystemPrompt } from "@ai-gui/core"
import { AIRenderer } from "@ai-gui/vue"

const registry = new CardRegistry()
// registry.register({ type, description, render /* a Vue component: props `data`, emits `action` */ })

const r = ref<InstanceType<typeof AIRenderer>>()

async function ask(prompt: string) {
  // Pass `plugins` too, or the model is never told it may draw a diagram or write TeX.
  const res = await fetch("/api/chat", { method: "POST", body: JSON.stringify({ system: buildSystemPrompt({ registry, plugins }), prompt }) })
  r.value?.reset()
  await r.value?.feed(res.body!)
}
</script>

<template>
  <AIRenderer ref="r" :registry="registry" @card-action="(a) => {/* app handles it */}" />
</template>
```

`useAIRenderer()` is also available as a composable.

## Quick start — vanilla

```ts
import { CardRegistry, buildSystemPrompt } from "@ai-gui/core"
import { createRenderer } from "@ai-gui/vanilla"

const registry = new CardRegistry()
registry.register({
  type: "weather",
  description: "A weather summary",
  // card render = (data, { onAction }) => HTMLElement
  render: (data: any, { onAction }: any) => {
    const el = document.createElement("div")
    el.textContent = `${data.city} — ${data.tempC}°C`
    return el
  },
})

const r = createRenderer(document.getElementById("out")!, {
  registry,
  onCardAction: ({ type, params, cardType }) => {/* app handles it */},
})

// Pass `plugins` too, or the model is never told it may draw a diagram or write TeX.
const res = await fetch("/api/chat", { method: "POST", body: JSON.stringify({ system: buildSystemPrompt({ registry, plugins }) }) })
await r.feed(res.body!)
// r.push(chunk) / r.reset() / r.destroy() also available
```

## Plugins

| Plugin | Factory | Adds |
| --- | --- | --- |
| `@ai-gui/plugin-katex` | `katex()` | Inline `$…$` and block `$$…$$` math |
| `@ai-gui/plugin-highlight` | `highlight({ themes?, langs?, theme? })` | Shiki syntax highlighting for code blocks (async) |
| `@ai-gui/plugin-mermaid` | `mermaid({ theme? })` | ` ```mermaid ` diagrams |
| `@ai-gui/plugin-primitives` | `primitives()` | ` ```list `, ` ```table `, ` ```key-value `, ` ```layout ` UI blocks |
| `@ai-gui/plugin-chart` | `chart({ interactive?, gl?, width?, height? })` | ` ```chart ` ECharts blocks — static SVG, live interactive, or 3D |
| `@ai-gui/plugin-bigscreen` | `bigscreen(options?)` | ` ```bigscreen ` animated data walls — counting KPIs, sweeping gauges, growing ranks, charts, turning 3D bars and globes on a grid the model lays out |
| `@ai-gui/plugin-form` | `form({ actionRuntime })` | Safe interactive ` ```form ` blocks with local validation and registered actions |
| `@ai-gui/plugin-citation` | `citation()` | Secure ` ```sources ` blocks with validated HTTPS links |
| `@ai-gui/plugin-artifact` | `artifact({ store? })` | Revisioned `artifact-create` / `artifact-update` commands and an inert document workspace |
| `@ai-gui/plugin-ui` | `ui({ registry, actionRuntime })` | Bounded ` ```ui ` trees with local state, forms, actions, and registered card slots |
| `@ai-gui/plugin-molecule` | `molecule(options?)` | Strict ` ```molecule ` blocks for SMILES/Molfile 2D and Molfile 3D structures |
| `@ai-gui/plugin-map` | `map(options?)` | Strict ` ```map ` blocks for inline GeoJSON, markers, routes, bounded navigation, and host-controlled basemaps |
| `@ai-gui/plugin-solid` | `solid(options?)` | ` ```solid ` blocks for solid-geometry teaching figures — solids, named points, sections, and marked lines and angles |
| `@ai-gui/plugin-scene` | `scene(options?)` | ` ```scene ` blocks for 3D scenes — primitives placed in metres, plus glTF models from host-allowed origins, turned with the mouse |
| `@ai-gui/plugin-function` | `fn(options?)` | ` ```function ` blocks for function and calculus figures — curves, tangents, areas, Riemann sums, computed from an expression |
| `@ai-gui/plugin-optics` | `optics(options?)` | ` ```optics ` blocks for ray optics — lenses, mirrors and refraction, with the image and the conclusion computed |
| `@ai-gui/plugin-motion` | `motion(options?)` | ` ```motion ` blocks for mechanics — projectiles, collisions and oscillation, drawn stroboscopically from the initial conditions |
| `@ai-gui/plugin-gravity` | `gravity(options?)` | ` ```gravity ` blocks for gravity and collisions — orbits, binaries, comets and colliding discs, integrated from the masses and orbits the model states |
| `@ai-gui/plugin-graph` | `graph(options?)` | ` ```graph ` blocks for knowledge graphs and ontologies — entities and typed relations, classes with `subClassOf` and properties with `domain`/`range`, drawn in 2D or 3D with the relations that break the ontology marked |
| `@ai-gui/plugin-physics` | `physics(options?)` | ` ```physics ` blocks for force and vector diagrams — bodies, surfaces, labelled arrows and angles, drawn not simulated |
| `@ai-gui/plugin-quote` | `quote(options?)` | ` ```quote ` blocks for candlestick charts — the host supplies the prices, the renderer computes every indicator |
| `@ai-gui/plugin-figure` | `figure(options?)` | ` ```figure ` blocks for labelled figures — regions with leader-line callouts naming each part |
| `@ai-gui/plugin-progress` | `progress(options?)` | ` ```progress ` blocks for a long turn — several steps per request, each updated in place by id |
| `@ai-gui/plugin-flashcard` | `flashcards({ actionRuntime, labels? })` | ` ```flashcards ` decks — one card at a time, answer hidden, self-graded through a registered action |
| `@ai-gui/plugin-evidence` | `evidence(options?)` | ` ```evidence ` blocks the **host** appends: which queries produced the numbers |
| `@ai-gui/plugin-resultset` | `resultset(options?)` | ` ```resultset ` tables the **host** appends: the numbers come from the query, not from the model retyping them |

Pass plugins to any adapter:

```tsx
import { katex } from "@ai-gui/plugin-katex"
import { highlight } from "@ai-gui/plugin-highlight"
import { mermaid } from "@ai-gui/plugin-mermaid"
import { primitives } from "@ai-gui/plugin-primitives"
import { chart } from "@ai-gui/plugin-chart"
import { form } from "@ai-gui/plugin-form"
import { citation } from "@ai-gui/plugin-citation"
import { ArtifactStore, artifact } from "@ai-gui/plugin-artifact"
import { ui } from "@ai-gui/plugin-ui"
import { molecule } from "@ai-gui/plugin-molecule"
import { map } from "@ai-gui/plugin-map"

// Stylesheets that pull in a third-party CSS file must be imported by the host; every other
// plugin's CSS is injected automatically by the renderer (once per plugin name, `plugin.css`).
// These two are the exceptions because their CSS points at files — fonts, marker images — by a
// path only a bundler can resolve.
import "@ai-gui/plugin-map/style.css"     // Leaflet
import "@ai-gui/plugin-katex/style.css"   // KaTeX

// Call the factories. `plugins={[katex]}` is the easy mistake and it used to be silent — a
// function has a `name` of its own, so the renderer took it and did nothing. It now throws.
// Keep plugin instances stable across component renders.
const artifactStore = new ArtifactStore()
const plugins = [ui({ registry, actionRuntime }), katex(), highlight(), mermaid(), molecule(), map(), chart({ interactive: true }), primitives(), citation(), artifact({ store: artifactStore })]

<AIRenderer
  registry={registry}
  plugins={plugins}
  theme="dark"          // charts and diagrams pick their own colours; tell them the page's
  locale="zh-CN"        // labels a plugin draws follow the host's language, English otherwise
  nodeRenderers={mine}  // optional: override individual node types, e.g. your own code block
/>
```

### Deferring the plugin bundle

Diagrams, maths and charts are the heaviest thing a page carrying them loads, and an answer that draws none should not pay for them. Pass a loader instead of an array and the renderer handles the rest: the answer renders as plain markdown until the import resolves, and then the buffered text is reparsed under the new grammar.

```tsx
// Stable across renders — define it outside the component or wrap it in useCallback.
const loadPlugins = () => Promise.all([
  import("@ai-gui/plugin-katex"),
  import("@ai-gui/plugin-mermaid"),
]).then(([k, m]) => [k.katex(), m.mermaid()])

<AIRenderer text={answer} plugins={loadPlugins} />
```

The host does not replay what it already pushed: the renderer keeps the source text and reparses it, so a diagram half-written when the chunk lands still renders. A failed import (offline, a bad deploy) leaves the answer as plain markdown and emits a `plugins-load-failed` debug event. The same shape works in every adapter — `createRenderer(el, { plugins: loadPlugins })`, `:plugins="loadPlugins"` — and each has `setPlugins` / a reactive prop for changing them later.

### Reacting to clicks on the model's output

`onNodeClick` reports the parsed block a click landed in, which is what makes an absolute path in inline code, a citation, or a code block's copy button possible without reading a DOM shape the renderer rebuilds as it streams.

```tsx
<AIRenderer
  text={answer}
  onNodeClick={(node, event) => {
    const path = (event.target as HTMLElement).closest("code")?.textContent
    if (node.type === "paragraph" && path?.startsWith("/")) revealInFinder(path)
  }}
/>
```

`node` is the AST node — its `type`, `content`, and `key` — while `event.target` is the exact element clicked inside it.

### Raw HTML the model did not mean as markup

Raw HTML in model output is interpreted by default, which is right for a model that is asked to write it and wrong for one that is not: a line like `return "done\n<code>"` is text the model is describing, and interpreting it swallows the rest of the sentence into an element. Sanitizing does not help, since `<code>` is a tag every allowlist keeps. Pass `rawHtml={false}` (`rawHtml: false` in the core and vanilla) and every tag the model writes is escaped and shown as the characters it wrote. Cards, `ui` trees, and a plugin's own markup are unaffected.

By default `chart()` renders a static SSR SVG; `chart({ interactive: true })` renders a live ECharts instance (tooltip / dataZoom / click); `chart({ gl: true })` renders 3D charts via `echarts-gl` (WebGL, live-only). Charts are complete-gated: skeleton while streaming, full render when the option JSON is complete.

Forms use the same `ActionRuntime` in every adapter: `const plugins = [form({ actionRuntime })]`. A closed valid `form` JSON fence mounts an accessible native form; incomplete fences remain a loading skeleton, invalid definitions render a safe fallback, and only actions already registered in the runtime can execute. See [`packages/plugin-form/README.md`](./packages/plugin-form/README.md) for the schema and lifecycle details.

`ui({ registry, actionRuntime })` is the main composition layer for AI-generated interfaces. The model can combine fixed node kinds such as `stack`, `grid`, `heading`, `text`, `table`, `keyValue`, `form`, `field`, `button`, and registered `card` slots. State is flat and scalar; the only binding syntax is `{"$state":"key"}`. Actions and cards must already be registered by the host. HTML, CSS, JavaScript, URLs, expressions, loops, workflows, remote components, and artifact commands are rejected.

`citation()` renders a strict `sources` JSON fence as an accessible source list. HTTPS is required by default, unknown fields and unsafe protocols are rejected, and generated source text is never treated as HTML.

`artifact()` lets the model create and revise persistent generated documents through complete-gated JSON commands. Every update requires the exact current `baseRevision`; `operationId` receipts make stream replay idempotent. The workspace previews `text`, `code`, `markdown`, and `json`, supports copy/download, and never executes generated HTML, JavaScript, components, actions, or network requests. `ArtifactStore.snapshot()` and `restore()` support application-owned persistence.

`molecule()` validates chemistry with OpenChemLib, renders safe 2D SVG, and can lazily mount 3Dmol for local Molfiles containing genuine 3D coordinates. SMILES is 2D-only in v1. The model cannot supply URLs, remote structures, scripts, shaders, callbacks, or network operations.

`quote()` is the one figure plugin that runs the other way round: a price follows from nothing, so the model relays bars it actually has rather than deriving them, and the protocol makes relaying the only thing it can do. A bar whose high is below its close is refused as impossible; indicators are named rather than valued so a hand-computed average cannot reach the chart; and there is no field for a view on the market, because a view rendered as a mark reads as something the data supports.

`motion()` draws mechanics stroboscopically — equal time intervals, so the spacing between marks is what shows the acceleration, which is how a textbook draws motion and what makes the figure a pure function of its definition. Range, flight time and the velocities after a collision are computed, never quoted.

`optics()` draws a lens, mirror or refraction figure from the conditions, and writes the conclusion under it from the numbers it computed — the image position, whether it is upright or inverted, real or virtual, the refraction angle, whether total internal reflection happens. That sentence is the part a reader takes away and the part a model most often gets wrong, so it is generated rather than quoted, and cannot disagree with the rays above it.

`fn()` draws a curve from its expression, not from points the model sampled: it takes `y = f(x)` and an interval, and the tangent's slope, the shaded area, the Riemann rectangles and the derivative are all computed here. A model plotting through `chart` has to sample the function itself, which puts its arithmetic into the picture where a wrong point is indistinguishable from a right one. Expressions go through a fixed grammar with no `eval`, and a definition carrying sampled points is refused.

`solid()` draws the figure a solid-geometry question needs, from the conditions rather than from an answer. The model names the solid the way a textbook does (`正方体 ABCD-A1B1C1D1`) and says which three points a cutting plane passes through; the section polygon is computed here. That division is the point: a model asked how many sides a section has sometimes says five when it is six, and the drawing would be wrong in a way a student cannot see. Vertex coordinates, unknown fields, and references to points that were never defined are all refused rather than drawn around. Three.js loads only when a figure is actually drawn.

`map()` renders inline GeoJSON, markers, and routes with bounded Leaflet navigation. It is vector-only and network-free by default. Optional raster basemaps are configured exclusively by the host with an exact origin allowlist; tile URLs, tokens, remote GeoJSON, geocoding, HTML popups, and style expressions are not part of the model protocol. Use ECharts for statistical maps and `plugin-map` for map navigation, routes, feature inspection, and geography teaching.

`physics()` draws force and vector diagrams — a body, the forces on it as labelled arrows, their angles, one force resolved into components. It is a drawing, not a simulation, and deliberately so: a rigid-body engine gives a teacher no way to label an intermediate quantity, stop at three seconds, or show a force that is in equilibrium and therefore never moves anything.

`figure()` draws the diagram whose point is what the parts are *called* — a cell with its organelles named, a leaf's layers, apparatus with the parts a method refers to — as regions with leader-line callouts. Use `mermaid` for boxes joined by arrows and `chart` for data.

`progress()` reports a long turn as several steps, each updated in place. A host-level "thinking…" is one line for the whole turn and cannot say which of four things is happening, which have finished, or that the third failed. Because a stream is append-only, an update arrives as another block: emitting a step again with the same `id` supersedes the earlier one, so restating the whole list does not duplicate rows.

`flashcards({ actionRuntime })` shows one card at a time with the answer hidden and a self-grade. A word shown beside its meaning is a word being read, and reading a word you have already read teaches nothing. Grades dispatch through the runtime's registry, which is the only allowlist.

`evidence()` and `resultset()` are the two blocks the **host** writes, not the model. A model that can invent a number can invent the query said to have produced it, so provenance written by the model is not provenance — it is more of the same claim. The application appends these fences from what it actually executed: `resultset` for the rows behind the numbers, `evidence` for the queries behind the rows.

Plugin authors can use `@ai-gui/plugin-sdk` for the existing core authoring types plus small, test-runner-neutral helpers such as `definePlugin`, `createTestNode`, `renderPluginNode`, and `mountOutputForTest`.

## Model streams

Provider adapters normalize content, reasoning, citations, usage, and errors without importing a provider SDK:

```ts
import { contentDeltas } from "@ai-gui/core"
import { openAIStream } from "@ai-gui/openai"

const response = await fetch("/api/openai")
await renderer.feed(contentDeltas(openAIStream(response)))
```

Use `anthropicStream(response)` or `vercelAIStream(response)` for the other providers. Each adapter also accepts the provider's standard SDK-shaped async event stream. Tool-call events are ignored; adapters never execute tools or network actions. Core exports `parseSSE`, `jsonLines`/`ndjson`, `textLines`, `readableBytes`, and `mockModelStream` for custom transports and deterministic tests.

## Actions

Card actions can be executed through a registered, validated runtime instead of an ad-hoc callback:

```tsx
import { ActionRegistry, createActionRuntime, getActionKey } from "@ai-gui/core"
import { AIRenderer, useActionState } from "@ai-gui/react"

const actions = new ActionRegistry()
actions.register<{ city: string }, unknown>({
  type: "weather.refresh",
  schema: {
    type: "object",
    required: ["city"],
    properties: { city: { type: "string" } },
    additionalProperties: false,
  },
  async run(params, { signal }) {
    return fetch(`/api/weather?city=${encodeURIComponent(params.city)}`, { signal }).then((r) => r.json())
  },
})

const actionRuntime = createActionRuntime({ registry: actions, timeoutMs: 10_000 })

function WeatherActions() {
  const state = useActionState(actionRuntime, getActionKey("weather.refresh", "weather"))
  return <span>{state.status}</span>
}

<AIRenderer
  registry={registry}
  actionRuntime={actionRuntime}
  onCardAction={(action) => console.log("action observed", action)}
/>
```

The model still only declares an action name and parameters. Only handlers registered by the application can execute. Invalid parameters, unknown actions, cancellation, timeout, duplicate submission and stale results are handled by the core runtime. Automatic dispatch errors are observed through runtime state or adapter hooks; `onCardAction` / `card-action` only observe action events. `reset()` and component teardown cancel only actions started by that renderer, so one runtime can safely be shared.

## Stateful cards

Add a stable top-level `id` to opt a Card into session state:

````md
```card:weather
{ "id": "weather-tokyo", "city": "Tokyo", "tempC": 24 }
```
````

Create one `CardStore` and share it with the action runtime and renderers:

```tsx
import { ActionRegistry, CardStore, createActionRuntime } from "@ai-gui/core"

const cardStore = new CardStore({ registry })
const actions = new ActionRegistry()

actions.register<{ city: string }, unknown>({
  type: "weather.refresh",
  async run(params, { signal, cardId }) {
    const next = await fetchWeather(params.city, { signal })
    return {
      op: "merge",
      cardId: cardId!,
      data: { tempC: next.tempC },
    }
  },
})

const actionRuntime = createActionRuntime({ registry: actions, cardStore })

<AIRenderer registry={registry} cardStore={cardStore} actionRuntime={actionRuntime} />
```

Card components receive `{ data, state, onAction }`. Store patches update the matching Card without reparsing Markdown or remounting the component. Supported patch operations are recursive object `merge`, full `replace`, and atomic batches. `cardStore.snapshot()` / `restore()` round-trip Card data and revisions; transient Action state is restored as idle. Cards without an `id` keep the existing stateless behavior.

## One stream, many channels

`Renderer` is a single-writer append-only buffer: `push` concatenates, and markdown block boundaries do not survive two sources interleaving into them. So anything arriving *alongside* the answer — progress, a background job, a tool that finished late, a second model — goes on its own channel and updates a Card by id instead, in any order and as many times as it likes.

```ts
import { CardStore, Renderer, StreamRouter, cardChannel } from "@ai-gui/core"

const store = new CardStore({ registry })
const renderer = new Renderer({ plugins, onPatch })

await new StreamRouter()
  .channel("content", renderer)                 // text deltas → the answer
  .on("cards", cardChannel(store, { onError })) // card messages → the store
  .on("usage", (u) => setTokens(u))             // anything else → your callback
  .feed(response.body)
```

Both wire formats work, mixed freely in one stream. A `data:` line with no `ch` and no `event:` goes to `content`, so an ordinary SSE endpoint needs no server change to start with:

```
{"ch":"content","delta":"Working"}
{"ch":"cards","data":{"op":"register","id":"job-7","type":"task","data":{"pct":0}}}
{"ch":"cards","data":{"op":"merge","cardId":"job-7","data":{"pct":60}}}
event: usage
data: {"in":120}
```

`cardChannel` accepts `register`, `merge`, `replace` and `batch`. Not `delete`: a card the reader is looking at should not vanish because a late frame said so — call `store.delete` from your own handler, where you can decide.

Send `revision` on a patch when a late frame overwriting newer state would be wrong; the store rejects the stale one. Without it, last write wins.

Every failure is reported through `onError` rather than thrown, because the handler runs inside one long `feed` await — a throw there would not just drop the card, it would kill the content channel and stop the answer mid-sentence. Leave `onError` unset and failures go to `console.error`; a silently swallowed one is indistinguishable from a card the model never sent.

For progress the model itself is reporting, `plugin-progress` is the simpler path: it is written in the answer, so it needs no second channel at all.

## DevTools and stream simulation

Enable debug instrumentation on the runtime objects you want to inspect, then attach them to one timeline:

```ts
import { ActionRegistry, CardStore, Renderer, createActionRuntime } from "@ai-gui/core"
import { createDevTools, createStreamSimulator } from "@ai-gui/devtools"

const registry = new ActionRegistry()
const cardStore = new CardStore({ debug: true })
const actionRuntime = createActionRuntime({ registry, cardStore, debug: true })
const renderer = new Renderer({ debug: true })

const devtools = createDevTools({
  maxEvents: 500,
  maxStringLength: 2_000,
  redact: ({ key }) => key === "email",
})

devtools.attach(renderer, actionRuntime, cardStore)
devtools.subscribe((event) => console.log(event.sequence, event.type, event.data))

const simulator = createStreamSimulator("# Hello, 世界", { chunkSize: 3, delayMs: 25 })
await renderer.feed(simulator.stream)
```

The timeline captures stream/feed lifecycle, repaired Markdown, AST snapshots and patches, parse/sanitize/diff timing, Action events and states, and CardStore changes/patches. Events have monotonic sequence numbers and timestamps. Core applies bounded string/depth/node budgets while constructing every event and redacts credentials, Bearer tokens, and common query-string secrets before any observer receives data. Debug events can still contain business data and arbitrary form PII that cannot be identified automatically; use the `redact` callback for application-specific fields and do not enable debug telemetry where that data must not leave the process. Devtools adds bounded event retention and export helpers through `snapshot()`, `clear()`, and `destroy()`. The runnable [`apps/playground`](./apps/playground) app provides React, Vue, and Vanilla streaming previews, transport controls, Card actions, timeline/AST/patch inspection, and reproduction import/export.

## How the LLM should generate

Don't hand-write generation rules — call `buildSystemPrompt({ base, registry, plugins })` and prepend the result to your system prompt. It assembles the card specs (from the registry) and each plugin's prompt spec, so the model is told exactly which fenced blocks it may emit. Everything else it writes is plain markdown.

**Pass `plugins`, not just `registry`.** Installing `mermaid()` teaches the renderer to draw a diagram; it does not teach the model that it may ask for one. A product that omits `plugins` here ships a chart, maths and diagram stack the model never uses. When the plugins are deferred behind a loader, build the prompt from the same list the loader resolves to — the prompt is assembled on the server or before the request, where the import cost does not apply.

The fence conventions it may use (only for **registered / enabled** block types):

- Cards: a ` ```card:<type> ` fence with JSON inside (data only).
- Charts: a ` ```chart ` fence with an ECharts option JSON.
- Primitives: ` ```list `, ` ```table `, ` ```key-value `, ` ```layout ` with JSON.
- Math: `$…$` inline, `$$…$$` block.
- Diagrams: ` ```mermaid `.
- Solid-geometry figures: ` ```solid ` with the solid, its named points, and the conditions on them — never coordinates or a stated result.
- Function and calculus figures: ` ```function ` with the expression and the interval — never sampled points, never a computed slope or area.
- Ray-optics figures: ` ```optics ` with the element and the object — never the image position, the magnification, or whether it is real or virtual.
- Motion figures: ` ```motion ` with the initial conditions — never the range, the flight time, or the velocities after a collision.
- Force diagrams: ` ```physics ` with the bodies, the forces on them and their angles.
- Price charts: ` ```quote ` with bars you actually have — never prices from memory, never indicator values, never a buy or sell signal.
- Labelled figures: ` ```figure ` with the regions and what each part is called.
- Progress on a long turn: ` ```progress ` with one step per thing being done; re-emit a step with the same `id` to update it.
- Flashcards: ` ```flashcards ` with the questions and answers to revise from.

`evidence` and `resultset` are **not** in that list. Those two fences are appended by the application from what it actually ran, so a model emitting one is claiming provenance it does not have.

Card buttons are **declarative**: the model emits an `action` name plus `params`; your app performs the real request. See [AGENTS.md](./AGENTS.md) for the exact syntax and examples.

## Architecture

```
LLM stream ──▶ @ai-gui/core (headless)
                 parse → AST + patches
                 plugins claim node types → RenderOutput (html | element | card | mount)
                 sanitize html
                    │
                    ▼
        adapter (@ai-gui/react | @ai-gui/vue | @ai-gui/vanilla)
                 renders AST/patches into the DOM
```

- **Core** parses the stream into an `ASTNode[]` and emits `Patch[]` as it grows; markdown is repaired in-memory while it streams.
- **Plugins** claim node types via `nodeRenderers` and return a framework-neutral `RenderOutput`: `html`, a structured `element`, a `card`, or a `mount` (a live DOM element for interactive widgets like charts). Renderers may be sync or async.
- **Adapters** turn AST + patches into their framework's output and host `mount` outputs with a proper cleanup lifecycle.
- **StreamRouter** (core) demultiplexes one transport stream into named channels. The answer's text goes to the `Renderer`, which is a single-writer append-only buffer; anything arriving alongside it — progress, a background job, a late tool result — goes on its own channel and updates a Card by id, in any order. `cardChannel(store)` wires that second half in one line.

## Packages

| Package | Purpose |
| --- | --- |
| [`@ai-gui/core`](./packages/core/README.md) | Headless streaming engine: `Renderer`, `StreamRouter`, `CardRegistry`, `buildSystemPrompt`, parser/diff/sanitize utilities, and the shared types. |
| [`@ai-gui/react`](./packages/react/README.md) | React adapter: `useAIRenderer` hook and `<AIRenderer>` component. |
| [`@ai-gui/vue`](./packages/vue/README.md) | Vue adapter: `useAIRenderer` composable and `<AIRenderer>` component. |
| [`@ai-gui/vanilla`](./packages/vanilla/README.md) | Vanilla-DOM adapter: `createRenderer(el, options)`. |
| [`@ai-gui/plugin-katex`](./packages/plugin-katex/README.md) | KaTeX math (`$…$`, `$$…$$`). |
| [`@ai-gui/plugin-solid`](./packages/plugin-solid/README.md) | Solid-geometry teaching figures (` ```solid `). |
| [`@ai-gui/plugin-scene`](./packages/plugin-scene/README.md) | 3D scenes from primitives and glTF models (` ```scene `). |
| [`@ai-gui/plugin-function`](./packages/plugin-function/README.md) | Function and calculus figures (` ```function `). |
| [`@ai-gui/plugin-optics`](./packages/plugin-optics/README.md) | Ray-optics figures (` ```optics `). |
| [`@ai-gui/plugin-motion`](./packages/plugin-motion/README.md) | Mechanics motion figures (` ```motion `). |
| [`@ai-gui/plugin-gravity`](./packages/plugin-gravity/README.md) | Orbits and collisions, integrated (` ```gravity `). |
| [`@ai-gui/plugin-graph`](./packages/plugin-graph/README.md) | Knowledge graphs and ontologies, 2D and 3D, checked (` ```graph `). |
| [`@ai-gui/plugin-physics`](./packages/plugin-physics/README.md) | Force and vector diagrams (` ```physics `). |
| [`@ai-gui/plugin-quote`](./packages/plugin-quote/README.md) | Candlestick charts with computed indicators (` ```quote `). |
| [`@ai-gui/plugin-figure`](./packages/plugin-figure/README.md) | Labelled figures with leader-line callouts (` ```figure `). |
| [`@ai-gui/plugin-progress`](./packages/plugin-progress/README.md) | Live progress steps for a long turn (` ```progress `). |
| [`@ai-gui/plugin-flashcard`](./packages/plugin-flashcard/README.md) | Self-graded flashcard decks (` ```flashcards `). |
| [`@ai-gui/plugin-ui`](./packages/plugin-ui/README.md) | Bounded declarative generated interfaces (` ```ui `). |
| [`@ai-gui/plugin-evidence`](./packages/plugin-evidence/README.md) | Host-written query provenance (` ```evidence `). |
| [`@ai-gui/plugin-resultset`](./packages/plugin-resultset/README.md) | Host-written result tables (` ```resultset `). |
| [`@ai-gui/plugin-highlight`](./packages/plugin-highlight/README.md) | Shiki syntax highlighting for code blocks. |
| [`@ai-gui/plugin-mermaid`](./packages/plugin-mermaid/README.md) | Mermaid diagrams. |
| [`@ai-gui/plugin-primitives`](./packages/plugin-primitives/README.md) | Primitive UI blocks: list / table / key-value / layout. |
| [`@ai-gui/plugin-chart`](./packages/plugin-chart/README.md) | ECharts charts: static SVG, live interactive, or 3D. |
| [`@ai-gui/plugin-bigscreen`](./packages/plugin-bigscreen/README.md) | Animated data walls with 3D panels (` ```bigscreen `). |
| [`@ai-gui/plugin-form`](./packages/plugin-form/README.md) | Accessible, validated forms that submit through `ActionRuntime`. |
| [`@ai-gui/plugin-citation`](./packages/plugin-citation/README.md) | Secure source-list blocks with bounded fields and validated links. |
| [`@ai-gui/plugin-artifact`](./packages/plugin-artifact/README.md) | Revisioned generated documents with a safe framework-neutral workspace. |
| [`@ai-gui/plugin-molecule`](./packages/plugin-molecule/README.md) | Safe SMILES/Molfile 2D and local Molfile 3D molecular views. |
| [`@ai-gui/plugin-map`](./packages/plugin-map/README.md) | Accessible inline GeoJSON, marker, and route maps with host-controlled networking. |
| [`@ai-gui/plugin-sdk`](./packages/plugin-sdk/README.md) | Minimal plugin authoring types and test helpers. |
| [`@ai-gui/openai`](./packages/openai/README.md) | OpenAI Responses and Chat Completions stream adapter. |
| [`@ai-gui/anthropic`](./packages/anthropic/README.md) | Anthropic Messages stream adapter. |
| [`@ai-gui/vercel-ai`](./packages/vercel-ai/README.md) | Vercel AI SDK full/data/UI stream adapter. |
| [`@ai-gui/devtools`](./packages/devtools/README.md) | Opt-in runtime timeline, redaction/limits, and deterministic stream simulation. |

## Testing & build

1360+ tests across the packages; each package is built with [tsdown](https://github.com/rolldown/tsdown).

```sh
pnpm test    # run the suite
pnpm build   # build all packages
```

## For agents

Integrating AIGUI into a project, or generating content for an AIGUI frontend? See [AGENTS.md](./AGENTS.md) (integration + generation guide) and [SKILL.md](./SKILL.md) (checklist form).

## License

MIT
