# @ai-gui/plugin-dashboard

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
