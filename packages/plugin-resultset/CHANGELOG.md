# @ai-gui/plugin-resultset

## 0.36.2

### Patch Changes

- @ai-gui/core@0.36.2

## 0.36.1

### Patch Changes

- @ai-gui/core@0.36.1

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

### Minor Changes

- BI dashboards as a first-class fence, and three fixes the first BI host hit in production use.

  - **New plugin `@ai-gui/plugin-dashboard`**: a ```dashboard fence renders a responsive grid of panels — table + live ECharts chart + provenance disclosure, or a per-panel refusal. The model decides the layout (title, panels, metric × dimension, chart type — the prompt spec says so explicitly); the host writes every row and SQL. One refused panel never blanks the rest of the board.
  - **`plugin-chart`**: `width: "container"` sizes a live chart to its mount element and follows it on resize (implies `interactive`). Hosts no longer hand-roll ResizeObservers.
  - **`plugin-resultset`**: columns may declare `{ name, align: "right" }`, so host-formatted strings ("9,308,286.52", "23.2%") still right-align; `meta: false` drops the meta line; `locale: "zh-CN"` localizes renderer-authored strings.
  - **`core`**: `baseCss` no longer forces `display:block` on tables inside `[data-aigui-resultset]` / `[data-aigui-dashboard]` — at equal specificity it silently defeated those plugins' `width:100%`, shrinking rows to a sliver inside a full-width shell.

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

## 0.23.1

### Minor Changes

- First release. Host-owned result tables: the application appends a
  ` ```resultset ` block from the rows it really returned, and the prompt spec
  tells the model not to retype figures into its prose. Provenance proves which
  query ran; this proves the number in the sentence came from it.
