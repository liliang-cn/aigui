# @ai-gui/image

## 0.33.0

### Patch Changes

- Updated dependencies
  - @ai-gui/core@0.33.0
  - @ai-gui/plugin-chart@0.33.0
  - @ai-gui/plugin-mermaid@0.33.0
  - @ai-gui/plugin-dashboard@0.33.0
  - @ai-gui/plugin-katex@0.33.0
  - @ai-gui/vanilla@0.33.0

## 0.32.0

### Patch Changes

- @ai-gui/core@0.32.0
- @ai-gui/vanilla@0.32.0
- @ai-gui/plugin-katex@0.32.0
- @ai-gui/plugin-mermaid@0.32.0
- @ai-gui/plugin-chart@0.32.0
- @ai-gui/plugin-dashboard@0.32.0

## 0.31.0

### Minor Changes

- ab9dfba: Render AIGUI blocks as images for channels that only carry pictures.

  `@ai-gui/image` runs the real vanilla renderer in a headless Chromium and screenshots each chart, Mermaid diagram, KaTeX formula, table, card, or dashboard. `@ai-gui/openclaw` is an OpenClaw plugin that uses it to rewrite outbound replies, so a chart reaches WeChat as a chart rather than as ECharts JSON. A block that fails to render is left as text; the answer is never lost to a failed drawing.

### Patch Changes

- @ai-gui/core@0.31.0
- @ai-gui/vanilla@0.31.0
- @ai-gui/plugin-katex@0.31.0
- @ai-gui/plugin-mermaid@0.31.0
- @ai-gui/plugin-chart@0.31.0
- @ai-gui/plugin-dashboard@0.31.0
