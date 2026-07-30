# @ai-gui/vanilla

Vanilla-DOM adapter for [AIGUI](../../README.md) — renders a streaming LLM response into a plain DOM element, no framework required.

## Install

```sh
pnpm add @ai-gui/core @ai-gui/vanilla
```

## Usage

```ts
import { ActionRegistry, CardRegistry, CardStore, createActionRuntime } from "@ai-gui/core"
import { createRenderer } from "@ai-gui/vanilla"

const registry = new CardRegistry()
registry.register({
  type: "weather",
  description: "Weather summary",
  // HTMLElement remains supported. Return a VanillaCardInstance for stateful cards.
  render: (data: any, { state, onAction }: any) => {
    const el = document.createElement("div")
    el.textContent = `${data.city} — ${data.tempC}°C`
    return {
      element: el,
      update(next: any, context: any) {
        el.textContent = `${next.city} — ${next.tempC}°C (${context.state.status})`
      },
      destroy() {},
    }
  },
})

const actions = new ActionRegistry()
actions.register({ type: "refresh", run: async (params, { signal }) => fetch("/api/weather", { signal }) })
const cardStore = new CardStore({ registry })
const actionRuntime = createActionRuntime({ registry: actions, cardStore })

const r = createRenderer(document.getElementById("out")!, {
  registry,
  cardStore,
  actionRuntime,
  onCardAction: (action) => console.log("observed", action),
})

await r.feed(response.body!) // r.push(chunk) / r.reset() / r.destroy()
```

## Exports

- `createRenderer(el, { registry?, cardStore?, plugins?, sanitize?, rawHtml?, actionRuntime?, onCardAction?, onNodeClick? })` → `{ push, setText, feed, reset, destroy, setTheme, setPlugins, exportImages }`.
  - `plugins` also takes a loader — `() => import("@ai-gui/plugin-mermaid").then(m => [m.mermaid()])` — and the renderer reparses what it buffered when the chunk lands.
  - `onNodeClick(node, event)` reports which parsed block a click landed in; `event.target` is the exact element clicked inside it.
- `VanillaCardInstance` is `{ element, update(data, { state, onAction }), destroy? }`. Its host and `element` stay mounted while AST data, store data, or action state changes.
- Legacy factories returning an `HTMLElement` remain supported. For cards with an `id` and a `cardStore`, the adapter may rebuild that child element after store updates so it displays current data.
- Cards with a valid top-level `id` register their initial data in the supplied external `CardStore`. The adapter subscribes but never clears that store; a shared store updates every renderer displaying the same card id.

`destroy()` tears down the host and cleans up any mounted interactive widgets. See the [root README](../../README.md) for cards, plugins, and `buildSystemPrompt`.
