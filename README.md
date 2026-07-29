# AIGUI

A framework-agnostic TypeScript SDK for rendering **streaming** LLM output as generated interfaces, interactive cards, revisioned artifacts, markdown, charts, citations, math, and diagrams.

AIGUI turns a raw model stream into a live, structured UI. Text and markdown render progressively (with in-memory repair of half-typed syntax); richer blocks (cards, charts, math, mermaid) show a loading skeleton while they stream, then render complete. A headless core emits a framework-agnostic AST plus patches; thin adapters render it in React, Vue, or vanilla DOM; plugins add block types.

## Features

- **Streaming-first** — progressive markdown with live repair of incomplete syntax; block types are complete-gated (skeleton → full render).
- **Framework-agnostic core** — one headless engine, adapters for React / Vue / vanilla.
- **App-defined cards** — the LLM only fills data into fenced `card:<type>` blocks; your app owns the schema, the render component, and the real API calls behind buttons.
- **Declarative generated UI** — one bounded `ui` tree composes layout, data, forms, registered actions, local bindings, and host-owned card components without generated code.
- **Pluggable blocks** — KaTeX math, Mermaid/UML diagrams, molecular structures, interactive maps, ECharts charts, primitive UI, and secure source lists.
- **Prompt assembly** — `buildSystemPrompt` produces the system-prompt guidance (card specs + each plugin's prompt spec) so the model knows exactly what it may emit. Pass `locale` to get those rules in the product's language: `buildSystemPrompt({ registry, plugins, locale: "zh-CN" })`.
- **Safe by default** — the core sanitizes all HTML output.
- **Observable when requested** — opt-in debug events and `@ai-gui/devtools` provide a bounded, redacted runtime timeline and deterministic stream simulator.
- **Revisioned artifacts** — models can create and update persistent text, code, Markdown, and JSON documents without executing generated code.
- **Tiny surface, well tested** — 150+ tests, built with [tsdown](https://github.com/rolldown/tsdown).

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
pnpm add @ai-gui/plugin-ui @ai-gui/plugin-katex @ai-gui/plugin-highlight @ai-gui/plugin-mermaid @ai-gui/plugin-molecule @ai-gui/plugin-map @ai-gui/plugin-primitives @ai-gui/plugin-chart @ai-gui/plugin-form @ai-gui/plugin-citation @ai-gui/plugin-artifact

# plugin authoring helpers (optional)
pnpm add @ai-gui/plugin-sdk

# model stream adapters (optional, no provider SDK required)
pnpm add @ai-gui/openai # or @ai-gui/anthropic / @ai-gui/vercel-ai

# development diagnostics (optional)
pnpm add -D @ai-gui/devtools
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
    const system = buildSystemPrompt({ registry })
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
  const res = await fetch("/api/chat", { method: "POST", body: JSON.stringify({ system: buildSystemPrompt({ registry }), prompt }) })
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

const res = await fetch("/api/chat", { method: "POST", body: JSON.stringify({ system: buildSystemPrompt({ registry }) }) })
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
| `@ai-gui/plugin-form` | `form({ actionRuntime })` | Safe interactive ` ```form ` blocks with local validation and registered actions |
| `@ai-gui/plugin-citation` | `citation()` | Secure ` ```sources ` blocks with validated HTTPS links |
| `@ai-gui/plugin-artifact` | `artifact({ store? })` | Revisioned `artifact-create` / `artifact-update` commands and an inert document workspace |
| `@ai-gui/plugin-ui` | `ui({ registry, actionRuntime })` | Bounded ` ```ui ` trees with local state, forms, actions, and registered card slots |
| `@ai-gui/plugin-molecule` | `molecule(options?)` | Strict ` ```molecule ` blocks for SMILES/Molfile 2D and Molfile 3D structures |
| `@ai-gui/plugin-map` | `map(options?)` | Strict ` ```map ` blocks for inline GeoJSON, markers, routes, bounded navigation, and host-controlled basemaps |

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
// plugin's CSS is injected automatically by the renderer.
import "@ai-gui/plugin-map/style.css"     // Leaflet
import "@ai-gui/plugin-katex/style.css"   // KaTeX

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

By default `chart()` renders a static SSR SVG; `chart({ interactive: true })` renders a live ECharts instance (tooltip / dataZoom / click); `chart({ gl: true })` renders 3D charts via `echarts-gl` (WebGL, live-only). Charts are complete-gated: skeleton while streaming, full render when the option JSON is complete.

Forms use the same `ActionRuntime` in every adapter: `const plugins = [form({ actionRuntime })]`. A closed valid `form` JSON fence mounts an accessible native form; incomplete fences remain a loading skeleton, invalid definitions render a safe fallback, and only actions already registered in the runtime can execute. See [`packages/plugin-form/README.md`](./packages/plugin-form/README.md) for the schema and lifecycle details.

`ui({ registry, actionRuntime })` is the main composition layer for AI-generated interfaces. The model can combine fixed node kinds such as `stack`, `grid`, `heading`, `text`, `table`, `keyValue`, `form`, `field`, `button`, and registered `card` slots. State is flat and scalar; the only binding syntax is `{"$state":"key"}`. Actions and cards must already be registered by the host. HTML, CSS, JavaScript, URLs, expressions, loops, workflows, remote components, and artifact commands are rejected.

`citation()` renders a strict `sources` JSON fence as an accessible source list. HTTPS is required by default, unknown fields and unsafe protocols are rejected, and generated source text is never treated as HTML.

`artifact()` lets the model create and revise persistent generated documents through complete-gated JSON commands. Every update requires the exact current `baseRevision`; `operationId` receipts make stream replay idempotent. The workspace previews `text`, `code`, `markdown`, and `json`, supports copy/download, and never executes generated HTML, JavaScript, components, actions, or network requests. `ArtifactStore.snapshot()` and `restore()` support application-owned persistence.

`molecule()` validates chemistry with OpenChemLib, renders safe 2D SVG, and can lazily mount 3Dmol for local Molfiles containing genuine 3D coordinates. SMILES is 2D-only in v1. The model cannot supply URLs, remote structures, scripts, shaders, callbacks, or network operations.

`map()` renders inline GeoJSON, markers, and routes with bounded Leaflet navigation. It is vector-only and network-free by default. Optional raster basemaps are configured exclusively by the host with an exact origin allowlist; tile URLs, tokens, remote GeoJSON, geocoding, HTML popups, and style expressions are not part of the model protocol. Use ECharts for statistical maps and `plugin-map` for map navigation, routes, feature inspection, and geography teaching.

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

The fence conventions it may use (only for **registered / enabled** block types):

- Cards: a ` ```card:<type> ` fence with JSON inside (data only).
- Charts: a ` ```chart ` fence with an ECharts option JSON.
- Primitives: ` ```list `, ` ```table `, ` ```key-value `, ` ```layout ` with JSON.
- Math: `$…$` inline, `$$…$$` block.
- Diagrams: ` ```mermaid `.

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
- **StreamRouter** (core) can demultiplex one transport stream into multiple named channels when you need more than one sink.

## Packages

| Package | Purpose |
| --- | --- |
| [`@ai-gui/core`](./packages/core/README.md) | Headless streaming engine: `Renderer`, `StreamRouter`, `CardRegistry`, `buildSystemPrompt`, parser/diff/sanitize utilities, and the shared types. |
| [`@ai-gui/react`](./packages/react/README.md) | React adapter: `useAIRenderer` hook and `<AIRenderer>` component. |
| [`@ai-gui/vue`](./packages/vue/README.md) | Vue adapter: `useAIRenderer` composable and `<AIRenderer>` component. |
| [`@ai-gui/vanilla`](./packages/vanilla/README.md) | Vanilla-DOM adapter: `createRenderer(el, options)`. |
| [`@ai-gui/plugin-katex`](./packages/plugin-katex/README.md) | KaTeX math (`$…$`, `$$…$$`). |
| [`@ai-gui/plugin-highlight`](./packages/plugin-highlight/README.md) | Shiki syntax highlighting for code blocks. |
| [`@ai-gui/plugin-mermaid`](./packages/plugin-mermaid/README.md) | Mermaid diagrams. |
| [`@ai-gui/plugin-primitives`](./packages/plugin-primitives/README.md) | Primitive UI blocks: list / table / key-value / layout. |
| [`@ai-gui/plugin-chart`](./packages/plugin-chart/README.md) | ECharts charts: static SVG, live interactive, or 3D. |
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

150+ tests across the packages; each package is built with [tsdown](https://github.com/rolldown/tsdown).

```sh
pnpm test    # run the suite
pnpm build   # build all packages
```

## For agents

Integrating AIGUI into a project, or generating content for an AIGUI frontend? See [AGENTS.md](./AGENTS.md) (integration + generation guide) and [SKILL.md](./SKILL.md) (checklist form).

## License

MIT
