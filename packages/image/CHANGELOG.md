# @ai-gui/image

## 0.36.0

### Patch Changes

- Updated dependencies [312391d]
  - @ai-gui/core@0.36.0
  - @ai-gui/plugin-bigscreen@0.36.0
  - @ai-gui/plugin-chart@0.36.0
  - @ai-gui/plugin-dashboard@0.36.0
  - @ai-gui/plugin-gravity@0.36.0
  - @ai-gui/plugin-katex@0.36.0
  - @ai-gui/plugin-mermaid@0.36.0
  - @ai-gui/plugin-molecule@0.36.0
  - @ai-gui/plugin-scene@0.36.0
  - @ai-gui/vanilla@0.36.0

## 0.35.2

### Patch Changes

- @ai-gui/core@0.35.2
- @ai-gui/vanilla@0.35.2
- @ai-gui/plugin-katex@0.35.2
- @ai-gui/plugin-mermaid@0.35.2
- @ai-gui/plugin-chart@0.35.2
- @ai-gui/plugin-molecule@0.35.2
- @ai-gui/plugin-scene@0.35.2
- @ai-gui/plugin-gravity@0.35.2
- @ai-gui/plugin-dashboard@0.35.2
- @ai-gui/plugin-bigscreen@0.35.2

## 0.35.1

### Patch Changes

- @ai-gui/core@0.35.1
- @ai-gui/vanilla@0.35.1
- @ai-gui/plugin-katex@0.35.1
- @ai-gui/plugin-mermaid@0.35.1
- @ai-gui/plugin-chart@0.35.1
- @ai-gui/plugin-molecule@0.35.1
- @ai-gui/plugin-scene@0.35.1
- @ai-gui/plugin-gravity@0.35.1
- @ai-gui/plugin-dashboard@0.35.1
- @ai-gui/plugin-bigscreen@0.35.1

## 0.35.0

### Minor Changes

- e0c759a: `@ai-gui/image` now draws four more block families — ` ```scene `, ` ```gravity `, ` ```bigscreen ` and ` ```molecule ` — so a picture-only channel gets the 3D scene, the orbit, the data wall and the molecule as PNGs. The WebGL ones render through SwiftShader in headless Chromium (the launcher now passes the flags that enable it), the animated ones are drawn at their finished state, and the page waits for a canvas to paint before it screenshots. `@ai-gui/openclaw` accepts the four new names in `blocks` and draws them by default.

### Patch Changes

- @ai-gui/core@0.35.0
- @ai-gui/vanilla@0.35.0
- @ai-gui/plugin-katex@0.35.0
- @ai-gui/plugin-mermaid@0.35.0
- @ai-gui/plugin-chart@0.35.0
- @ai-gui/plugin-molecule@0.35.0
- @ai-gui/plugin-scene@0.35.0
- @ai-gui/plugin-gravity@0.35.0
- @ai-gui/plugin-dashboard@0.35.0
- @ai-gui/plugin-bigscreen@0.35.0

## 0.34.0

### Patch Changes

- @ai-gui/core@0.34.0
- @ai-gui/vanilla@0.34.0
- @ai-gui/plugin-katex@0.34.0
- @ai-gui/plugin-mermaid@0.34.0
- @ai-gui/plugin-chart@0.34.0
- @ai-gui/plugin-dashboard@0.34.0

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
