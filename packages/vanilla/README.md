# @ai-gui/vanilla

Vanilla-DOM adapter for [AIGUI](../../README.md) — renders a streaming LLM response into a plain DOM element, no framework required.

## Install

```sh
pnpm add @ai-gui/core @ai-gui/vanilla
```

## Usage

```ts
import { CardRegistry } from "@ai-gui/core"
import { createRenderer } from "@ai-gui/vanilla"

const registry = new CardRegistry()
registry.register({
  type: "weather",
  description: "Weather summary",
  // card render = (data, { onAction }) => HTMLElement
  render: (data: any, { onAction }: any) => {
    const el = document.createElement("div")
    el.textContent = `${data.city} — ${data.tempC}°C`
    return el
  },
})

const r = createRenderer(document.getElementById("out")!, {
  registry,
  onCardAction: ({ type, params, cardType }) => {/* app makes the real request */},
})

await r.feed(response.body!) // r.push(chunk) / r.reset() / r.destroy()
```

## Exports

- `createRenderer(el, { registry?, plugins?, sanitize?, onCardAction? })` → `{ push, feed, reset, destroy }`.

`destroy()` tears down the host and cleans up any mounted interactive widgets. See the [root README](../../README.md) for cards, plugins, and `buildSystemPrompt`.
