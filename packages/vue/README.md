# @ai-gui/vue

Vue adapter for [AIGUI](../../README.md) — renders a streaming LLM response into Vue, with app-defined cards and plugins.

## Install

```sh
pnpm add @ai-gui/core @ai-gui/vue
```

## Usage

```vue
<script setup lang="ts">
import { ref } from "vue"
import { ActionRegistry, CardRegistry, CardStore, createActionRuntime } from "@ai-gui/core"
import { AIRenderer, useActionState } from "@ai-gui/vue"

const registry = new CardRegistry()
// A card render component receives props `data` and emits `action`.
registry.register({ type: "weather", description: "Weather summary", render: WeatherCard })

const actions = new ActionRegistry()
actions.register({ type: "refresh", run: async (params, { signal }) => fetch("/api/weather", { signal }) })
const cardStore = new CardStore({ registry })
const actionRuntime = createActionRuntime({ registry: actions, cardStore })

const r = ref<InstanceType<typeof AIRenderer>>()

async function ask() {
  const res = await fetch("/api/chat")
  r.value?.reset()
  await r.value?.feed(res.body!) // also: r.value?.push(chunk)
}
</script>

<template>
  <AIRenderer ref="r" :registry="registry" :card-store="cardStore" :action-runtime="actionRuntime" @card-action="(a) => console.log(a)" />
</template>
```

## Exports

- `<AIRenderer :registry :card-store :plugins :sanitize :raw-html :action-runtime @card-action @node-click />` — a render-function component; imperative `push` / `feed` / `reset` / `exportImages` via a template ref (exposed).
  - `:plugins` also takes a loader — `:plugins="() => import('@ai-gui/plugin-mermaid').then(m => [m.mermaid()])"` — and the renderer reparses what it buffered when the chunk lands.
  - `@node-click="(node, event) => …"` reports which parsed block a click landed in; `event.target` is the exact element clicked inside it.
- `useAIRenderer()` — composable returning `{ nodes, push, feed, reset }`.
- `useActionState(runtime, key)` — reactive action lifecycle state.

Cards with a top-level `id` subscribe to the supplied `CardStore`. Their Vue component receives `data` and `state` props and emits `action`; store updates preserve the component instance and local refs.

Card component contract: props `data`, `emits: ['action']`. See the [root README](../../README.md) for cards, plugins, and `buildSystemPrompt`.
