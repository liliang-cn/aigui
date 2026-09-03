# @ai-gui/plugin-bigscreen

## 0.37.0

### Minor Changes

- 8f3663c: A `graph3d` panel is a 3D model now, not a flat hairball.

  The new default, `mode: "orbit"`, lays the entities out in space with a spring–electrical
  simulation written for this — repulsion between every pair, springs along the edges, a weak pull
  to the origin so a disconnected component cannot leave the panel, and a falling temperature that
  cools the graph into a shape. It is drawn as a `scatter3D` of entities and a `lines3D` of edges
  inside an invisible cube, lit from both sides so the far half is still readable, with the camera
  turning slowly around it. The layout is deterministic — the starting positions are a hash of the
  node ids — and it is stepped a few steps per animation frame rather than run to convergence, so
  the reader watches the clusters arrive instead of being handed a settled picture. Node colours,
  the type legend, the tooltip and `events.onNodeClick` are unchanged.

  A graph re-rendered from a growing fence resumes rather than reshuffles: the positions each graph
  settled into are remembered by node id, so the twenty entities already on screen stay where they
  are and only the three that just arrived have to find a place.

  `mode: "flat"` keeps the previous `graphGL` picture, byte for byte and pinned by a test, for
  graphs big enough that depth hides more than it shows. `rotate: false`, and a host's
  `animate: false`, hand over the settled model without turning it.

- ae86ea6: A globe panel can now be drawn on a real earth. `bigscreen({ globe })` takes the host's planet: a
  `baseTexture` (an equirectangular photograph the host serves itself), or a `countries` GeoJSON
  FeatureCollection rasterised onto a 2:1 canvas in the screen's palette, plus `shading`,
  `heightTexture`, `atmosphere` and a `light.time` that puts the terminator where the sun actually
  is. With a host earth the points carry labels only for the largest few and the rest move to a
  tooltip. The fence is unchanged — it still says only where the points and arcs are — and a host
  that sets nothing gets the painted graticule it always got.
- 84a9e1b: Two panels for provenance: `timeline` and `graph3d`.

  `timeline` gives every source its own swim-lane and every claim its own point, with a line drawn
  between claims that are related — `contradicts` in the palette's danger red, which is the picture
  the panel exists for: two outlets said things that cannot both be true, and the red segment runs
  between their two rows. Lanes stay in the order they were written, time runs across, the twelve
  claims with the most empty space around them carry a label and the rest are one hover away, and a
  claim with a `url` opens it on click. Up to 24 lanes, 500 claims and 500 links; `at` is ISO 8601;
  `url` must be `http` or `https`, because that string reaches `window.open`.

  `graph3d` draws entities and typed edges as a knowledge graph, laid out by force-atlas2 on the GPU
  through `echarts-gl`'s `graphGL`. A type's colour is a hash of its name, so `outlet` is the same
  colour in every panel on the wall whatever order the types appear in, and `types` pins any of them
  to a colour of its own. Nodes are sized by degree or by `value`, the twenty busiest carry a label
  along with `focus`, the types are keyed in the panel's corner in HTML over the canvas, and
  `rotate` says whether the layout settles in front of the reader or arrives settled. Up to 2000
  nodes and 5000 edges — a graph near that size also needs the host to raise `maxSourceBytes`.
  Without the optional `echarts-gl` peer the panel shows the same one-line note the globe does.

  New `bigscreen({ events })`: `onItemClick` takes a timeline click, `url` and all, and `onNodeClick`
  gives a host something to do with an entity — a node is not a link, so there is no default.

### Patch Changes

- @ai-gui/core@0.37.0

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
