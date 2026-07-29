# @ai-gui/plugin-evidence

## 0.20.1

### Minor Changes

- First release. Host-owned query-provenance fences: the application appends an
  ` ```evidence ` block from the statements it actually executed, and the prompt
  spec tells the model never to write one. A model that can invent a number can
  invent the query said to have produced it, so provenance is only worth showing
  when the host wrote it.
