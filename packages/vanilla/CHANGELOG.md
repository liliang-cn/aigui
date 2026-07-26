# @ai-gui/vanilla

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

### Minor Changes

- 57d6aef: A plugin can declare that it built its own markup, and Vue and vanilla catch up with React.

  `RenderOutput` html takes `trusted: true`. Sanitizing a diagram strips the `foreignObject` that
  holds every label in it, so hosts bypassed their sanitizer by matching the mermaid plugin's
  internal id prefix with a regular expression — which broke whenever the plugin renamed its ids and
  let any model output wearing that prefix through unsanitized. The mermaid plugin now says so
  itself, and a host that disagrees sets `sanitize: { trustPlugins: false }`. The three framework
  bindings share one `sanitizeRenderedHtml` so they cannot drift apart on what sanitizing means.

  Vue and vanilla receive the host contract 0.5.0 gave React. Both take a theme and hand it to
  plugins — 0.5.0 put the theme in the `NodeRenderer` contract but only React passed it, so a Vue or
  vanilla app with plugin-chart still drew a light plot area on a dark page. Vue takes a `text` prop
  and emits `render`; vanilla gains `setText`, `setTheme` and an `onRender` option, so neither is
  back to keeping its own record of what it already pushed.

  `exportImages` is on the React handle, the Vue expose and the vanilla renderer. The element the
  drawings live in belongs to the renderer, so finding them was the host's problem.

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
