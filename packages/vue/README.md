# @aigui/vue

Vue adapter for [AIGUI](../../README.md) — renders a streaming LLM response into Vue, with app-defined cards and plugins.

## Install

```sh
pnpm add @aigui/core @aigui/vue
```

## Usage

```vue
<script setup lang="ts">
import { ref } from "vue"
import { CardRegistry } from "@aigui/core"
import { AIRenderer } from "@aigui/vue"

const registry = new CardRegistry()
// A card render component receives props `data` and emits `action`.
registry.register({ type: "weather", description: "Weather summary", render: WeatherCard })

const r = ref<InstanceType<typeof AIRenderer>>()

async function ask() {
  const res = await fetch("/api/chat")
  r.value?.reset()
  await r.value?.feed(res.body!) // also: r.value?.push(chunk)
}
</script>

<template>
  <AIRenderer ref="r" :registry="registry" @card-action="(a) => {/* app makes the real request */}" />
</template>
```

## Exports

- `<AIRenderer :registry :plugins :sanitize @card-action />` — a render-function component; imperative `push` / `feed` / `reset` via a template ref (exposed).
- `useAIRenderer()` — composable returning `{ nodes, push, feed, reset }`.

Card component contract: props `data`, `emits: ['action']`. See the [root README](../../README.md) for cards, plugins, and `buildSystemPrompt`.
