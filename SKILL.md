---
name: aigui
description: Use when integrating the @ai-gui SDK to render streaming LLM output (markdown, cards, charts, math, diagrams) in React/Vue/vanilla, or when generating content for an @ai-gui frontend (card/chart/primitive/math/mermaid fences).
---

# AIGUI

AIGUI is a framework-agnostic TypeScript SDK that renders **streaming** LLM output as live UI. A headless core parses the stream into an AST; adapters render it in React / Vue / vanilla; plugins add block types. Full detail: [AGENTS.md](./AGENTS.md) and [README.md](./README.md).

## When to use

- **Integrating**: adding `@ai-gui` to an app to render a streaming model response (markdown + cards + charts + math + diagrams).
- **Generating**: you are the LLM producing content that an AIGUI frontend will render.

## Integration checklist

1. **Pick an adapter** and install: `@ai-gui/core` + one of `@ai-gui/react` / `@ai-gui/vue` / `@ai-gui/vanilla`. Add plugins as needed.
2. **Register cards** on a `CardRegistry` — `register({ type, description, schema?, example?, render })`. The app owns the render component; the LLM only fills data.
   - React render: component gets `{ data, onAction }`. Vue: props `data`, emits `action`. Vanilla: `(data, { onAction }) => HTMLElement`.
3. **Mount the renderer**: `<AIRenderer ref registry plugins onCardAction />` (React/Vue) or `createRenderer(el, { registry, plugins, onCardAction })` (vanilla). Imperative API: `push` / `feed` / `reset` (+ `destroy` in vanilla).
4. **Wire `onCardAction({ type, params, cardType })`** to your real APIs. Buttons are declarative — the app makes the request, never the LLM.
5. **Add plugins**: create a stable array outside render, then pass `plugins={plugins}`.
6. **Build the system prompt** from the same registry + plugins: `buildSystemPrompt({ base, registry, plugins })`; prepend it to your system prompt. Backend just streams text.
7. **Feed the stream**: `reset()` then `feed(response.body)` — accepts a `ReadableStream` or `AsyncIterable<string>`. Renders progressively.

## Generation fence cheat-sheet

Write normal markdown. Add fenced blocks **only** for card/block types listed in your system prompt.

| Block | Syntax |
| --- | --- |
| Card | ` ```card:<type> ` + JSON data only |
| Chart | ` ```chart ` + ECharts option JSON (3D series if `gl` enabled) |
| List | ` ```list {"items":[...]} ` |
| Table | ` ```table {"headers":[...],"rows":[[...]]} ` |
| Key-value | ` ```key-value {"pairs":{...}} ` |
| Layout | ` ```layout {"direction":"row\|column","items":[...]} ` |
| Math | `$…$` inline, `$$…$$` block |
| Diagram | ` ```mermaid ` |

Card example:

    ```card:weather
    { "city": "Tokyo", "tempC": 24 }
    ```

## Key rules

- **Cards are app-defined** — only emit registered card types, filling data that matches the given schema/example. Do not invent types.
- **Buttons are declarative** — cards carry an `action` + `params`; the app performs the real request. Never claim you did it.
- **Blocks are complete-gated** — cards/charts/math/mermaid show a skeleton while streaming, then render complete (charts/3D never partial-drawn). Plain markdown renders progressively.
- **Call `buildSystemPrompt`** — don't hand-write generation rules; it assembles card specs + each plugin's prompt spec.
- **Only emit enabled block types** — everything else is plain markdown.

See [AGENTS.md](./AGENTS.md) for full examples.
