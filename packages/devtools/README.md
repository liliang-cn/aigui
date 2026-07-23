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

`snapshot()` returns a bounded, globally ordered timeline. Common credential fields are redacted in core before observers receive events; devtools also supports custom `redact`, string/depth/node limits, `clear()`, and `destroy()`.
