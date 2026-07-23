# AGENTS.md — working with the AIGUI SDK

This guide has two independent parts. Read the one that matches your job:

- **Part A** — you are a coding agent **integrating** `@ai-gui` into a project.
- **Part B** — you are the **LLM generating content** that an AIGUI frontend will render.

For the human-facing overview see [README.md](./README.md); for the checklist form see [SKILL.md](./SKILL.md).

---

## Part A — Integrating the SDK

AIGUI renders a streaming LLM response as live UI. A headless core (`@ai-gui/core`) parses the stream into an AST; a thin adapter renders it in your framework; plugins add block types (math, charts, diagrams, …).

### 1. Pick the adapter and install

| Framework | Adapter | Install |
| --- | --- | --- |
| React | `@ai-gui/react` | `pnpm add @ai-gui/core @ai-gui/react` |
| Vue | `@ai-gui/vue` | `pnpm add @ai-gui/core @ai-gui/vue` |
| vanilla DOM | `@ai-gui/vanilla` | `pnpm add @ai-gui/core @ai-gui/vanilla` |

Add any plugins you need: `@ai-gui/plugin-katex`, `@ai-gui/plugin-highlight`, `@ai-gui/plugin-mermaid`, `@ai-gui/plugin-primitives`, `@ai-gui/plugin-chart`.

### 2. Register cards

A **card** is an app-defined widget. You own the schema and the render component; the LLM only fills in the data. Register each card type on a `CardRegistry`:

```ts
import { CardRegistry } from "@ai-gui/core"

const registry = new CardRegistry()
registry.register({
  type: "weather",                 // fence type → ```card:weather
  description: "Weather summary",   // shown to the model in the system prompt
  schema: { type: "object", properties: { city: { type: "string" }, tempC: { type: "number" } } },
  example: { city: "Tokyo", tempC: 24 },
  render: /* framework component (React/Vue) or (data, { onAction }) => HTMLElement (vanilla) */,
})
```

- React card render: a component receiving `{ data, onAction }`.
- Vue card render: a component with props `data`, `emits: ['action']`.
- Vanilla card render: `(data, { onAction }) => HTMLElement`.

### 3. Mount the renderer

React:

```tsx
import { AIRenderer } from "@ai-gui/react"
const ref = useRef(null)
<AIRenderer ref={ref} registry={registry} plugins={plugins} onCardAction={handle} />
// ref.current.push(chunk) / feed(source) / reset()
```

Vue:

```vue
<AIRenderer ref="r" :registry="registry" :plugins="plugins" @card-action="handle" />
<!-- r.value.push / feed / reset via the exposed template ref -->
```

Vanilla:

```ts
import { createRenderer } from "@ai-gui/vanilla"
const r = createRenderer(el, { registry, plugins, onCardAction: handle })
// r.push / r.feed / r.reset / r.destroy
```

### 4. Wire `onCardAction` to real APIs

Card buttons are **declarative**: they emit an action, they do not call anything. Your handler receives `{ type, params, cardType }` and makes the real request. **The LLM never issues the request** — it only names the action.

```ts
function handle({ type, params, cardType }) {
  if (cardType === "weather" && type === "refresh") {
    void refetchWeather(params.city)
  }
}
```

### 5. Add plugins

Pass plugin instances to the adapter. Each claims its block types and renders framework-neutral output; the core sanitizes all HTML.

```ts
import { katex } from "@ai-gui/plugin-katex"
import { highlight } from "@ai-gui/plugin-highlight"
import { mermaid } from "@ai-gui/plugin-mermaid"
import { primitives } from "@ai-gui/plugin-primitives"
import { chart } from "@ai-gui/plugin-chart"

const plugins = [katex(), highlight(), mermaid(), chart({ interactive: true }), primitives()]
```

### 6. Build the system prompt

Assemble the model's guidance from the **same** registry and plugins, then prepend it to your system prompt. This is what tells the model which cards and blocks exist.

```ts
import { buildSystemPrompt } from "@ai-gui/core"
const system = buildSystemPrompt({ base: "You are a helpful assistant.", registry, plugins })
```

The backend is language-agnostic: it just streams text with this prompt prepended. Nothing about AIGUI needs to live server-side.

### 7. Stream the response into the renderer

`feed` accepts an `AsyncIterable<string>` or a `ReadableStream` (e.g. `fetch().body`). Reset before a new turn.

```ts
const res = await fetch("/api/chat", { method: "POST", body: JSON.stringify({ system, prompt }) })
ref.current.reset()
await ref.current.feed(res.body)     // renders progressively as tokens arrive
```

Streaming behavior you get for free: markdown renders progressively with in-memory repair of half-typed syntax; blocks (cards, charts, math, mermaid) show a loading skeleton while they stream and then render complete. Charts/3D are complete-gated (skeleton → full), never partial-drawn.

---

## Part B — Generating content

You are the LLM. Your output is rendered by an AIGUI frontend. Write **normal markdown**. On top of markdown you may emit a few **fenced blocks** — but **only** the ones that are registered/enabled for this app (they are listed in your system prompt via `buildSystemPrompt`). If a block type is not listed, do not use it; write plain markdown instead.

### Cards — ` ```card:<type> `

A card is an app-defined widget. Emit a fenced block whose info string is `card:<type>` and whose body is JSON **data only** (match the fields/example given in your system prompt). Do not invent card types.

    ```card:weather
    { "city": "Tokyo", "tempC": 24 }
    ```

**Buttons are declarative.** Never claim you performed an action or made a request. A card's buttons carry an `action` name plus `params`; the app performs the real work when the user clicks. You only supply the data.

### Charts — ` ```chart `

A fenced block containing an ECharts option JSON:

    ```chart
    { "xAxis": { "type": "category", "data": ["A", "B"] },
      "yAxis": { "type": "value" },
      "series": [{ "type": "bar", "data": [1, 2] }] }
    ```

If the app enabled `gl` mode, 3D series are available (`bar3D`, `scatter3D`, `surface`, `line3D`, `globe`, `map3D`), e.g. `"series":[{"type":"surface", ...}]`.

### Primitive UI blocks

Data-driven blocks, each a fence + JSON:

    ```list {"items":["one","two","three"]}```
    ```table {"headers":["City","°C"],"rows":[["Tokyo",24],["Oslo",9]]}```
    ```key-value {"pairs":{"status":"ok","count":3}}```
    ```layout {"direction":"row","items":[...]}```

### Math — `$…$` / `$$…$$`

Inline `$E = mc^2$`, or a block:

    $$\int_0^1 x^2 \,dx = \tfrac{1}{3}$$

### Diagrams — ` ```mermaid `

    ```mermaid
    graph TD; A-->B; A-->C;
    ```

### The one rule

Only emit registered cards and enabled block types (per your system prompt). Everything else is plain markdown. Keep card/chart/primitive bodies as valid JSON.
