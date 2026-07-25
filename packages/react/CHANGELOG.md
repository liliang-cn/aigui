# @ai-gui/react

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
