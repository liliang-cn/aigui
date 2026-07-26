# @ai-gui/plugin-katex

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
