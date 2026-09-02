# @ai-gui/plugin-citation

## 0.36.0

### Patch Changes

- Updated dependencies [312391d]
  - @ai-gui/core@0.36.0

## 0.35.2

### Patch Changes

- @ai-gui/core@0.35.2

## 0.35.1

### Patch Changes

- @ai-gui/core@0.35.1

## 0.35.0

### Patch Changes

- @ai-gui/core@0.35.0

## 0.34.0

### Patch Changes

- @ai-gui/core@0.34.0

## 0.33.0

### Minor Changes

- Prompt specs teach the block shape that actually parses.

  Eleven specs demonstrated their block on a single line — ` ```list {"items":[…]}``` `
  — and a model that copies that exactly produces no block at all. A fence's
  info string may not contain backticks, so CommonMark reads the line as an
  inline code span: the reader gets raw JSON running through the middle of a
  sentence, and an empty code block where the list should have been. The
  mistake is invisible from the model's side, which emitted precisely what it
  was shown.

  Every spec now shows the multi-line form, `buildSystemPrompt` states the rule
  once before the specs it governs (new export: `fencingRule`), and a test lints
  every package's model-facing text so the shape cannot come back.

  Hosts that assemble guidance themselves rather than calling `buildSystemPrompt`
  should prepend `fencingRule(locale)`.

### Patch Changes

- Updated dependencies
  - @ai-gui/core@0.33.0

## 0.32.0

### Patch Changes

- @ai-gui/core@0.32.0

## 0.31.0

### Patch Changes

- @ai-gui/core@0.31.0

## 0.30.0

### Patch Changes

- Updated dependencies
  - @ai-gui/core@0.30.0

## 0.29.2

### Patch Changes

- @ai-gui/core@0.29.2

## 0.29.1

### Patch Changes

- @ai-gui/core@0.29.1

## 0.29.0

### Patch Changes

- Updated dependencies [893cb1e]
  - @ai-gui/core@0.29.0

## 0.28.0

### Patch Changes

- @ai-gui/core@0.28.0

## 0.27.0

### Patch Changes

- @ai-gui/core@0.27.0

## 0.26.0

### Patch Changes

- @ai-gui/core@0.26.0

## 0.25.0

### Patch Changes

- @ai-gui/core@0.25.0

## 0.24.0

### Patch Changes

- @ai-gui/core@0.24.0

## 0.23.1

### Patch Changes

- First release of `@ai-gui/plugin-resultset`: host-owned result tables. The
  application appends a ` ```resultset ` block from the rows it really returned,
  and the prompt spec tells the model not to retype figures into its prose.
  `plugin-evidence` proves which query ran; this proves the number in the sentence
  came from it.
- Updated dependencies
  - @ai-gui/core@0.23.1

## 0.23.0

### Patch Changes

- Updated dependencies [5e15f72]
  - @ai-gui/core@0.23.0

## 0.22.1

### Patch Changes

- Updated dependencies [d2945bc]
  - @ai-gui/core@0.22.1

## 0.22.0

### Patch Changes

- Updated dependencies [7633f85]
  - @ai-gui/core@0.22.0

## 0.21.1

### Patch Changes

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

### Minor Changes

- Add plugin authoring helpers, secure source citation blocks, revisioned artifacts, bounded declarative AI-generated UI trees, molecular structures, and interactive maps.

### Patch Changes

- Updated dependencies
  - @ai-gui/core@0.4.0

## 0.3.0

### Minor Changes

- Add a dependency-free `sources` fenced JSON plugin with strict validation, secure URL policy, synchronous framework-neutral rendering, prompt guidance, CSS, and serialization helpers.
