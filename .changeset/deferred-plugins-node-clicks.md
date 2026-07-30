---
"@ai-gui/core": minor
"@ai-gui/vanilla": minor
"@ai-gui/react": minor
"@ai-gui/vue": minor
"@ai-gui/plugin-katex": minor
"@ai-gui/plugin-highlight": minor
---

Deferred plugin loading, node-level clicks, and raw-HTML escaping.

- `plugins` now takes a loader as well as an array in every adapter:
  `plugins: () => import("@ai-gui/plugin-mermaid").then((m) => [m.mermaid()])`. The answer renders
  as plain markdown until the import resolves; `Renderer.setPlugins` then swaps the grammar and
  reparses the buffered source, so the host neither holds the stream back nor replays what it
  pushed. A failed import leaves the answer as markdown and emits a `plugins-load-failed` debug
  event. Changing plugins no longer rebuilds the React/Vue session, so it no longer clears the
  answer or aborts an in-flight card action.
- `onNodeClick(node, event)` reports which parsed block a click landed in, so a path in inline
  code or a citation can be actionable without reading the DOM the renderer rebuilds as it streams.
- `rawHtml: false` escapes raw HTML the model wrote rather than interpreting it: a stray `<code>`
  in a sentence about code otherwise swallows the rest of the line into an element, which
  sanitizing cannot fix.
- `plugin-katex` and `plugin-highlight` now carry a `promptSpec`, so `buildSystemPrompt({ plugins })`
  tells the model it may write TeX and must tag its code fences. `katex()` takes a `css` override,
  and the new `@ai-gui/plugin-katex/inline-css` entry supplies KaTeX's stylesheet as a string with
  a configurable `fontBase` for hosts that cannot import CSS.
