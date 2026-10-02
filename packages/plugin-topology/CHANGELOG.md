# @ai-gui/plugin-topology

## 0.44.1

### Patch Changes

- 5cc3c4d: Pages default to English with a `locale` option on `aigui_open` / `aigui_edit`. A KPI without `decimals` keeps the value's own precision, and the gauge reading no longer sits on its scale. A topology without a direction picks the one that draws larger; state badges and link labels no longer collide with the links. Examples use generic names.
  - @ai-gui/core@0.45.0

## 0.44.0

### Minor Changes

- 486b26c: New `topology` block: infrastructure diagrams laid out automatically, with steps that play a process — messages travelling, states changing — in the page, and are numbered on one picture in a PNG. The page check no longer waits forever on a page that animates, and flags labels drawn on top of each other.

### Patch Changes

- @ai-gui/core@0.44.0
