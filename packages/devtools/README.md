# @ai-gui/devtools

Framework-agnostic AIGUI runtime timeline and deterministic stream simulator.

```ts
import { Renderer, createActionRuntime, CardStore } from "@ai-gui/core"
import { createDevTools, createStreamSimulator } from "@ai-gui/devtools"

const renderer = new Renderer({ debug: true })
const cards = new CardStore({ debug: true })
const actions = createActionRuntime({ registry, cardStore: cards, debug: true })
const devtools = createDevTools({ maxEvents: 500 })

devtools.attach(renderer, actions, cards)
devtools.subscribe(console.log)

const simulator = createStreamSimulator(markdown, { chunkSize: 4, delayMs: 20 })
await renderer.feed(simulator.stream)
```

`snapshot()` returns a bounded, globally ordered timeline. Core redacts credentials and text-level Bearer/query secrets before observers receive events and bounds payload construction. Debug may still contain application business data or form PII that cannot be recognized automatically, so use custom `redact` rules for those fields. Devtools also supports bounded event retention, `clear()`, and `destroy()`.
