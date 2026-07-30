# @ai-gui/plugin-katex

## 0.22.0

### Minor Changes

- 7633f85: Deferred plugin loading, node-level clicks, and raw-HTML escaping.

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

### Patch Changes

- Updated dependencies [7633f85]
  - @ai-gui/core@0.22.0

## 0.21.1

### Patch Changes

- Ship the `./style.css` export

  0.21.0 documented `import "@ai-gui/plugin-katex/style.css"` and the file was in
  the repository, but the `exports` and `files` entries never made it into the
  published package, so the import failed to resolve.

  - @ai-gui/core@0.21.1

## 0.21.0

### Minor Changes

- Host node renderers, automatic plugin styles, and locales

  **`nodeRenderers` on every adapter.** The renderers were collected from the plugins and never
  exposed, so a host that wanted its own code block — with its copy button — had to drop the plugin
  that claimed `code` and reimplement everything else it rendered. React, Vue and vanilla now accept
  a `nodeRenderers` map that merges over the plugin-collected one, host wins.

  **Plugin CSS is installed by the renderer.** `AIGuiPlugin.css` was declared by ten plugins and read
  by nobody, leaving every host to work out which of its plugins shipped styles and import each by
  hand. Each adapter now injects them, once per plugin name, and `collectPluginStyles` /
  `injectPluginStyles` are exported for hosts that manage their own document.

  **Blocks stay inside the viewport.** A base stylesheet ships with that injection: tables and code
  scroll within their own box, images and widgets are capped at the column width, and long URLs wrap
  — so an answer written without knowledge of the screen no longer pushes a phone page sideways.

  `@ai-gui/plugin-katex` now exposes `./style.css`, matching `@ai-gui/plugin-map`. Its `css` field is
  a bare-specifier `@import` that only a bundler can resolve, so it is skipped by the injector; import
  `@ai-gui/plugin-katex/style.css` instead.

  **Locales.** `buildSystemPrompt({ locale })` threads a BCP-47 tag through each plugin's
  `promptSpec`, and `locale` on the renderers reaches every plugin through `NodeRenderContext` — a
  product whose persona says "always answer in Chinese" no longer appends English rules to it, and the
  chrome plugins draw follows the page. `zh-CN` ships for the primitives, mermaid, chart and citation
  prompt specs and for the artifact workspace's labels; everything else falls back to English, which
  is also what an untranslated locale resolves to.

  `promptSpec` may now be `(locale?: string) => string`. Plugins that ignore the argument, and plain
  string specs, are unaffected.

  Also: `@ai-gui/plugin-evidence` joins the fixed version group it was missing from, so every public
  package shares one version again, and coverage is measured over package sources only — the
  playground's built vendor bundles were being counted, reporting 22% where the packages are at 95%.

### Patch Changes

- Updated dependencies
  - @ai-gui/core@0.21.0

## 0.20.2

### Patch Changes

- First release of `@ai-gui/plugin-evidence`: host-owned query provenance. The
  application appends an ` ```evidence ` fence from the statements it actually
  executed, and `evidencePromptSpec()` tells the model never to write one — a
  model that can invent a number can invent the query said to have produced it.
- Updated dependencies
  - @ai-gui/core@0.20.2

## 0.20.1

### Patch Changes

- @ai-gui/core@0.20.1

## 0.20.0

### Patch Changes

- Updated dependencies [b487b4d]
  - @ai-gui/core@0.20.0

## 0.19.0

### Patch Changes

- @ai-gui/core@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [a22ba20]
  - @ai-gui/core@0.18.0

## 0.17.1

### Patch Changes

- @ai-gui/core@0.17.1

## 0.17.0

### Patch Changes

- @ai-gui/core@0.17.0

## 0.16.0

### Patch Changes

- @ai-gui/core@0.16.0

## 0.15.0

### Patch Changes

- @ai-gui/core@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [8539013]
  - @ai-gui/core@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [e21640a]
  - @ai-gui/core@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [32f827c]
  - @ai-gui/core@0.12.0

## 0.11.1

### Patch Changes

- Updated dependencies [f84cb1d]
  - @ai-gui/core@0.11.1

## 0.11.0

### Patch Changes

- Updated dependencies [58d1b6c]
  - @ai-gui/core@0.11.0

## 0.10.0

### Patch Changes

- @ai-gui/core@0.10.0

## 0.9.0

### Minor Changes

- `katex({ chemistry: true })` renders chemical equations.

  `\ce{2H2 + O2 -> 2H2O}` is how a reaction is written in every chemistry lesson, and KaTeX rejects
  `\ce` as an undefined control sequence until its mhchem extension is loaded — which the plugin had
  no way to ask for, since it took no options at all.

  Off by default: mhchem is a body of grammar a maths or physics lesson never touches. Loaded through
  a dynamic import, so a lesson that does not ask for chemistry does not pay for it, and a bundler
  that cannot resolve the extension leaves `\ce` rendering as before rather than failing the lesson.

### Patch Changes

- @ai-gui/core@0.9.0

## 0.8.0

### Patch Changes

- @ai-gui/core@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies
  - @ai-gui/core@0.7.0

## 0.6.2

### Patch Changes

- @ai-gui/core@0.6.2

## 0.6.1

### Patch Changes

- @ai-gui/core@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [57d6aef]
  - @ai-gui/core@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [401fce1]
  - @ai-gui/core@0.5.0

## 0.4.4

### Patch Changes

- @ai-gui/core@0.4.4

## 0.4.3

### Patch Changes

- @ai-gui/core@0.4.3

## 0.4.2

### Patch Changes

- @ai-gui/core@0.4.2

## 0.4.1

### Patch Changes

- @ai-gui/core@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies
  - @ai-gui/core@0.4.0

## 0.3.0

### Minor Changes

- Add the v0.3 generative UI runtime with registered action execution, stateful cards, declarative forms, model stream adapters, debug instrumentation, and DevTools simulation support.

### Patch Changes

- Updated dependencies [43cb2a4]
- Updated dependencies [c309584]
- Updated dependencies
- Updated dependencies [d637f4d]
  - @ai-gui/core@0.3.0

## 0.2.0

### Minor Changes

- Improve streaming correctness, cancellation, incremental parsing, adapter lifecycles, plugin loading, chart coverage, sanitization, and release validation.

### Patch Changes

- Updated dependencies
  - @ai-gui/core@0.2.0
