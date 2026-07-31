---
"@ai-gui/core": minor
"@ai-gui/vanilla": minor
"@ai-gui/plugin-katex": minor
---

Reject a plugin factory passed instead of a plugin, instead of silently rendering nothing.

`plugins: [katex]` instead of `plugins: [katex()]` is the easiest mistake to make against this API
and it used to be the quietest one. A function carries a `name` of its own — `"katex"` — so the
renderer accepted it, found no `extendParser` and no `nodeRenderers`, and did nothing: no error, no
warning, markdown still rendering, only the maths and the diagrams missing. A product can ship that
way and nobody notices until someone asks why an equation is plain text.

`Renderer`, `Renderer.setPlugins`, `collectNodeRenderers` and `createRenderer` now throw a
`TypeError` naming the position and the fix — `plugins[0] is a factory function, not a plugin. Call
it: katex()` — and the same check rejects `null`, non-objects, and plugins with no `name`. The
exported `assertPlugins` runs it directly.

**This turns a silent no-op into a thrown error.** An application that has been passing factories
has not been getting those plugins at all; it will now fail at construction instead of rendering
without them.

Also: `katexCss` is renamed to `katexCssImport` (the old name is kept as a deprecated alias). The
value is an `@import` statement, not a stylesheet — the old name invited hosts to inject it into a
`<style>`, where the browser resolves it against the page, 404s, and leaves every formula as a heap
of overlapping spans. And every exported `*PromptSpec` function now says in its doc comment that
`buildSystemPrompt({ registry, plugins, locale })` is the thing to call instead: assembling the
guidance by hand loses the localized wording and silently omits any plugin added later.
