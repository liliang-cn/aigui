# @ai-gui/plugin-evidence

## 0.21.1

### Patch Changes

- @ai-gui/core@0.21.1

## 0.21.0

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

### Minor Changes

- First release. Host-owned query-provenance fences: the application appends an
  ` ```evidence ` block from the statements it actually executed, and the prompt
  spec tells the model never to write one. A model that can invent a number can
  invent the query said to have produced it, so provenance is only worth showing
  when the host wrote it.
