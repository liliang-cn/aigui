# AIGUI

A framework-agnostic TypeScript SDK for rendering **streaming** LLM output — markdown, interactive cards, charts, math, and diagrams — progressively, as the tokens arrive.

AIGUI turns a raw model stream into a live, structured UI. Text and markdown render progressively (with in-memory repair of half-typed syntax); richer blocks (cards, charts, math, mermaid) show a loading skeleton while they stream, then render complete. A headless core emits a framework-agnostic AST plus patches; thin adapters render it in React, Vue, or vanilla DOM; plugins add block types.

## Features

- **Streaming-first** — progressive markdown with live repair of incomplete syntax; block types are complete-gated (skeleton → full render).
- **Framework-agnostic core** — one headless engine, adapters for React / Vue / vanilla.
- **App-defined cards** — the LLM only fills data into fenced `card:<type>` blocks; your app owns the schema, the render component, and the real API calls behind buttons.
- **Pluggable blocks** — KaTeX math, Shiki syntax highlighting, Mermaid diagrams, primitive UI (list/table/key-value/layout), and ECharts charts (static SVG, live interactive, or 3D via WebGL).
- **Prompt assembly** — `buildSystemPrompt` produces the system-prompt guidance (card specs + each plugin's prompt spec) so the model knows exactly what it may emit.
- **Safe by default** — the core sanitizes all HTML output.
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
pnpm add @ai-gui/plugin-katex @ai-gui/plugin-highlight @ai-gui/plugin-mermaid @ai-gui/plugin-primitives @ai-gui/plugin-chart
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

Pass plugins to any adapter:

```tsx
import { katex } from "@ai-gui/plugin-katex"
import { highlight } from "@ai-gui/plugin-highlight"
import { mermaid } from "@ai-gui/plugin-mermaid"
import { primitives } from "@ai-gui/plugin-primitives"
import { chart } from "@ai-gui/plugin-chart"

<AIRenderer
  registry={registry}
  plugins={[katex(), highlight(), mermaid(), chart({ interactive: true }), primitives()]}
/>
```

By default `chart()` renders a static SSR SVG; `chart({ interactive: true })` renders a live ECharts instance (tooltip / dataZoom / click); `chart({ gl: true })` renders 3D charts via `echarts-gl` (WebGL, live-only). Charts are complete-gated: skeleton while streaming, full render when the option JSON is complete.

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
