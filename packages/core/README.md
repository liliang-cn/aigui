# @aigui/core

The headless streaming engine behind [AIGUI](../../README.md) — framework-agnostic. It parses a streaming LLM response into an AST + patches, runs plugin node renderers, sanitizes HTML, and builds the system prompt. Use it directly, or via an adapter (`@aigui/react`, `@aigui/vue`, `@aigui/vanilla`).

## Install

```sh
pnpm add @aigui/core
```

## Usage

```ts
import { Renderer, CardRegistry, buildSystemPrompt } from "@aigui/core"

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

## Exports

- `Renderer` — `push(chunk)`, `feed(AsyncIterable | ReadableStream)`, `reset()`; constructor `{ registry?, plugins?, sanitize?, onPatch?(patches, nodes) }`.
- `StreamRouter` — demultiplex one stream into named channels: `.channel(name, sink)`, `.on(name, cb)`, `.feed(source)`.
- `CardRegistry` — `register(def)`, `parse(type, rawJson)`, `getRender(type)`, `toPromptSpec()`, `toJSONSchema()`.
- `buildSystemPrompt({ base?, registry?, plugins? })`.
- Utilities: `parsePartialJSON`, `repairMarkdown`, `sanitizeHtml`, `createParser`, `diffAst`, `collectNodeRenderers`.
- Types: `ASTNode`, `Patch`, `RenderOutput` (`html | element | card | mount`), `CardDef`, `AIGuiPlugin`, `NodeRenderer`, `RendererOptions`, `JSONSchema`.

See the [root README](../../README.md) for the full picture.
