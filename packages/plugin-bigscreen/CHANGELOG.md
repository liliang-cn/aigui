# @ai-gui/plugin-bigscreen

## 0.36.3

### Patch Changes

- @ai-gui/core@0.36.3

## 0.36.2

### Patch Changes

- c57eae2: A data wall now folds on its own width, not the window's.

  The wall laid out twelve columns and fell back to one at `@media
(max-width: 640px)` — a query about the _viewport_. Put the same wall in a
  330px side panel of a 1900px window and the query never fires: four KPI cards
  share three hundred pixels and the numbers wrap one character per line.

  The wall is now a container (`container-type: inline-size`) and the fallbacks
  are `@container` queries, so what decides the layout is the only thing that was
  ever relevant — how wide the wall is. That also covers the case the old query
  was written for, since a full-width wall in a small window has a small
  container.

  Two steps rather than one. At 900px it folds to two columns; at 520px to one.
  And a panel the model gave more than half the grid to keeps both columns in the
  two-column state — a chart is wide because it needs to be, and collapsing it to
  the width of a KPI card is how a readable chart becomes a smear.

  - @ai-gui/core@0.36.2

## 0.36.1

### Patch Changes

- 6183537: A refused block now says why, and bigscreen says how long its strings may be.

  Two faults, found by asking a real agent for a real dashboard — a portfolio
  wall — and getting a grey bar.

  **The wall was refused for a caption.** `parseKpi` allows a `label` of 40
  characters and the prompt spec listed the field with no hint of that, or of
  what the field is for. Asked for holdings, the model wrote

      "持仓 14股 | 成本 $699.19 | 现价 $703.41 | 盈亏 +$59.07 (+0.60%)"

  — 54 characters, and lost the whole screen. It did it again on the next
  generation, so this is not luck; it is a limit that was enforced and never
  stated. The spec now gives every length (unit 16, prefix 8, label and rank
  names 40, panel title 80, screen title 80, subtitle 120), says what `label` is
  for, and says the part that makes lengths matter: overrunning one throws the
  whole block away rather than trimming the string.

  The parser's messages carry the numbers too. "must be a short string" is true
  and useless — it tells neither a model rewriting its block nor a person reading
  the message whether they are two characters over or twenty. It now reads
  `panels[0].label must be at most 40 characters (got 54)`.

  **And the reason was invisible.** Seven plugins shipped

      [data-aigui-<name>-error] { …; opacity: .8; background: currentColor }

  which paints the box in the very colour its text is written in. The message
  reached the DOM and the `aria-label`, and on screen it was an unexplained slab —
  indistinguishable from a renderer that had broken. It is now a tint of the host's
  own colour with the text readable over it, in the shape `@ai-gui/plugin-dashboard`
  already used. Wrapped in `:where()` so a host restyling it wins without a
  specificity fight, since plugin CSS is injected at runtime and takes every tie.

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

### Minor Changes

- 63c320f: New package: `@ai-gui/plugin-bigscreen` renders ` ```bigscreen ` blocks as animated data walls — KPIs that count up with deltas and sparklines, dial and ring gauges that sweep, rank bars that grow, ECharts charts drawn in the wall's palette, and, with the optional `echarts-gl` peer, 3D bars, scatter, surfaces and lines that turn, plus a globe with arcing routes over a texture painted in-page rather than fetched. Dark and light themes, an accent colour, and a 12-column grid the model lays out.

### Patch Changes

- @ai-gui/core@0.34.0
