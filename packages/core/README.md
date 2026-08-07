# @ai-gui/core

The core also exposes provider-neutral model stream primitives:

```ts
import { contentDeltas, mockModelStream, parseSSE } from "@ai-gui/core"

const events = mockModelStream([
  { type: "content", delta: "Hello" },
  { type: "usage", data: { outputTokens: 1 } },
])
await renderer.feed(contentDeltas(events))
```

`parseSSE`, `jsonLines`/`ndjson`, and `textLines` accept fetch responses, byte streams, and async byte iterables. They preserve split UTF-8 characters, support cancellation, release readers, and let callers reject or skip malformed records. `readableBytes` and `mockModelStream` are deterministic helpers for tests and examples.

The headless streaming engine behind [AIGUI](../../README.md) — framework-agnostic. It parses a streaming LLM response into an AST + patches, runs plugin node renderers, sanitizes HTML, and builds the system prompt. Use it directly, or via an adapter (`@ai-gui/react`, `@ai-gui/vue`, `@ai-gui/vanilla`).

## Install

```sh
pnpm add @ai-gui/core
```

## Usage

```ts
import { Renderer, CardRegistry, buildSystemPrompt } from "@ai-gui/core"

const registry = new CardRegistry()
registry.register({ type: "weather", description: "Weather summary", example: { city: "Tokyo" } })

const renderer = new Renderer({
  registry,
  sanitize: true,
  onPatch: (patches, nodes) => {
    // called as the stream grows; render `nodes` however you like
  },
})

// feed an AsyncIterable<string> or a ReadableStream, or push chunks manually
await renderer.feed(response.body!)
// renderer.push("more text"); renderer.reset()

// assemble the system-prompt guidance for the model
const system = buildSystemPrompt({ registry })
```

## Actions

```ts
import { ActionRegistry, createActionRuntime } from "@ai-gui/core"

const actions = new ActionRegistry()
actions.register<{ city: string }, unknown>({
  type: "weather.refresh",
  schema: {
    type: "object",
    required: ["city"],
    properties: { city: { type: "string" } },
  },
  run: async (params, { signal, actionId, cardType }) => {
    return fetch(`/api/weather?city=${encodeURIComponent(params.city)}`, { signal }).then((r) => r.json())
  },
})

const runtime = createActionRuntime({ registry: actions, timeoutMs: 10_000 })
const result = await runtime.dispatch({
  type: "weather.refresh",
  params: { city: "Tokyo" },
  cardType: "weather",
})
```

Use `runtime.subscribe()`, `runtime.getState(key)`, `runtime.cancel(key)`, `runtime.reset()` and `runtime.destroy()` to observe and control actions. Automatic dispatch errors are observed through runtime state or adapter hooks; `onCardAction` / `card-action` only observe action events. Pending duplicate dispatches from the same owner share one Promise; adapters provide isolated owners automatically.

## Stateful cards

```ts
import { ActionRegistry, CardStore, createActionRuntime } from "@ai-gui/core"

const cardStore = new CardStore({ registry })
cardStore.register({
  id: "weather-tokyo",
  type: "weather",
  data: { id: "weather-tokyo", city: "Tokyo", tempC: 24 },
})

cardStore.apply({
  op: "merge",
  cardId: "weather-tokyo",
  data: { tempC: 25 },
})

const snapshot = cardStore.snapshot()
cardStore.restore(JSON.parse(JSON.stringify(snapshot)))

const actions = new ActionRegistry()
actions.register({
  type: "weather.refresh",
  async run(_params, { cardId }) {
    return { op: "merge", cardId: cardId!, data: { tempC: 26 } }
  },
})

const runtime = createActionRuntime({ registry: actions, cardStore })
```

`CardStore` supports initialize-if-absent registration, immutable records, recursive object merge, replace, atomic patch batches, revision checks, subscriptions, delete/clear, and snapshot/restore. Action patch results use optimistic mutation epochs, so an older Action cannot overwrite a Card changed, deleted, recreated, or restored after that Action started.

## One stream, many channels

`Renderer` is a single-writer append-only buffer: `push` concatenates, and markdown block boundaries do not survive two sources interleaving into them. So anything arriving *alongside* the answer — progress, a background job, a tool that finished late — goes on its own channel and updates a Card by id, in any order, as many times as it likes.

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

The wire accepts either form, mixed freely in one stream:

```
{"ch":"content","delta":"Working"}
{"ch":"cards","data":{"op":"register","id":"job-7","type":"task","data":{"pct":0}}}
{"ch":"cards","data":{"op":"merge","cardId":"job-7","data":{"pct":60}}}
event: usage
data: {"in":120}
```

`cardChannel` accepts `register`, `merge`, `replace` and `batch`. Not `delete`: a card the reader is looking at should not vanish because a late frame said so — call `store.delete` from your own handler where you can decide.

Send `revision` on a patch when a late frame overwriting newer state would be wrong; the store rejects the stale one. Without it, last write wins.

Every failure is reported through `onError` rather than thrown, because the handler runs inside one long `feed` await — a throw there would not just drop the card, it would kill the content channel and stop the answer mid-sentence. Leave `onError` unset and failures go to `console.error`; a silently swallowed one is indistinguishable from a card the model never sent.

## Exports

- `Renderer` — `push(chunk)`, `feed(AsyncIterable | ReadableStream)`, `reset()`, `setPlugins(plugins)`; constructor `{ registry?, plugins?, sanitize?, rawHtml?, onPatch?(patches, nodes) }`.
  - `setPlugins` swaps the grammar and reparses the buffered source, so plugins deferred behind a dynamic import can arrive mid-answer without the host replaying what it pushed.
  - `rawHtml: false` escapes raw HTML the model wrote instead of interpreting it — a stray `<code>` in prose otherwise swallows the rest of the line.
  - Emphasis is parsed CJK-friendly, one deliberate deviation from CommonMark. CommonMark will not let `**` close when it follows punctuation and precedes a character that is neither whitespace nor punctuation, so `**严格单调（单射）**的函数` renders its asterisks literally. ASCII is unaffected: `a * b * c` and `snake_case_word` parse exactly as before.
- `StreamRouter` — demultiplex one stream into named channels: `.channel(name, sink)`, `.on(name, cb)`, `.feed(source)`.
- `cardChannel(store, { onError? })` — a `StreamRouter` handler that applies `register` / `merge` / `replace` / `batch` messages to a `CardStore`, reporting failures instead of throwing into the feed.
- `CardRegistry` — `register(def)`, `parse(type, rawJson)`, `getRender(type)`, `toPromptSpec()`, `toJSONSchema()`.
- `CardStore` — `register`, `get`, `list`, `subscribe`, `apply`, `applyAll`, `delete`, `clear`, `snapshot`, and `restore` for Cards with stable IDs.
- `ActionRegistry`, `ActionRuntime`, `createActionRuntime`, `getActionKey`, `getIdleActionState` — validated application-owned action execution and observable lifecycle state.
- `buildSystemPrompt({ base?, registry?, plugins?, locale? })` — collects the card specs and every plugin's `promptSpec`. Pass `plugins`: installing a plugin teaches the renderer to draw a block, not the model to ask for one.
- `loadPlugins(source)` / `samePlugins(a, b)` — normalize `AIGuiPlugin[] | (() => Promise<AIGuiPlugin[]>)` and compare two lists by members.
- Utilities: `parsePartialJSON`, `repairMarkdown`, `sanitizeHtml`, `createParser`, `diffAst`, `collectNodeRenderers`.
- Types: `ASTNode`, `Patch`, `RenderOutput` (`html | element | card | mount`), `CardDef`, `AIGuiPlugin`, `NodeRenderer`, `RendererOptions`, `JSONSchema`.

See the [root README](../../README.md) for the full picture.
