# @ai-gui/react

## 0.5.0

### Minor Changes

- 401fce1: Let the host describe what it wants rendered instead of driving the renderer by hand.

  `AIRenderer` takes a `text` prop and works out the delta itself. Streaming an answer meant every
  host kept its own record of what it had already pushed, diffed against it, noticed when the new
  text was not a continuation, and reset — and then had to undo that record when StrictMode's
  remount emptied the renderer underneath it.

  `onRender` reports the nodes on screen. Knowing whether an answer produced a chart previously
  meant watching the DOM for whatever elements a plugin happened to create.

  `theme` reaches plugins through a second argument to `NodeRenderer`, so a diagram or a chart can
  follow the page it is embedded in. Mermaid re-initialises when the theme changes rather than
  freezing on whichever diagram rendered first, and charts pass the scheme to ECharts.

  `exportSVGToImage`, `exportRenderedImages` and `downloadImage` save what a plugin drew. Every host
  was rewriting the serialize-load-canvas dance, and getting the background and the pixel ratio
  wrong in its own way.

  The renderer session is now keyed on the plugins themselves rather than the array holding them.
  `plugins={[chart, katex]}` is a new array on every render, and rebuilding the session for it threw
  away the answer mid-stream.

### Patch Changes

- Updated dependencies [401fce1]
  - @ai-gui/core@0.5.0

## 0.4.4

### Patch Changes

- Keep the React renderer alive across effect remounts. `useAIRenderer` only armed its patch
  token while creating a session, so once the mount effect had been torn down and re-run on the
  same session — which React StrictMode does on every mount in development, and Fast Refresh does
  on edit — `push` and `feed` became silent no-ops and the rendered output stayed blank. The mount
  effect now re-arms the active session token.
  - @ai-gui/core@0.4.4

## 0.4.3

### Patch Changes

- @ai-gui/core@0.4.3

## 0.4.2

### Patch Changes

- @ai-gui/core@0.4.2

## 0.4.1

### Patch Changes

- Keep async plugin renderer promises stable across parent rerenders while refreshing them when node content or renderer identity changes.
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
