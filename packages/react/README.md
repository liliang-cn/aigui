# @ai-gui/react

React adapter for [AIGUI](../../README.md) — renders a streaming LLM response into React, with app-defined cards and plugins.

## Install

```sh
pnpm add @ai-gui/core @ai-gui/react
```

## Usage

```tsx
import { CardRegistry } from "@ai-gui/core"
import { AIRenderer } from "@ai-gui/react"
import { useRef } from "react"

const registry = new CardRegistry()
registry.register({
  type: "weather",
  description: "Weather summary",
  // card render = a React component receiving { data, onAction }
  render: ({ data, onAction }: { data: any; onAction: (a: any) => void }) => (
    <div>
      {data.city} — {data.tempC}°C
      <button onClick={() => onAction({ type: "refresh", params: { city: data.city } })}>Refresh</button>
    </div>
  ),
})

function Chat() {
  const ref = useRef<React.ComponentRef<typeof AIRenderer>>(null)
  // ref.current?.push(chunk) / feed(source) / reset()
  return (
    <AIRenderer
      ref={ref}
      registry={registry}
      onCardAction={({ type, params, cardType }) => {/* app makes the real request */}}
    />
  )
}
```

## Exports

- `<AIRenderer ref registry plugins sanitize onCardAction />` — imperative `ref.current.push/feed/reset`.
- `useAIRenderer(options)` → `{ nodes, push, feed, reset }` — the hook form when you want to render `nodes` yourself.

See the [root README](../../README.md) for cards, plugins, and `buildSystemPrompt`.
