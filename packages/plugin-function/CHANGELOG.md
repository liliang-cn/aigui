# @ai-gui/plugin-function

## 0.36.2

### Patch Changes

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

### Minor Changes

- e6724d7: A figure may declare parameters the reader can drag.

  ```json
  {
    "params": [{ "id": "a", "from": -3, "to": 3, "value": 1, "step": 0.1 }],
    "plot": [{ "id": "f", "expr": "a*x^2", "domain": [-3, 3] }]
  }
  ```

  A slider is looking, not authoring — the same category as turning a solid around in
  `plugin-solid` — so it stays inside the line this SDK draws: the conditions are still the model's
  and every number on screen is still computed here.

  Determinism survives it. A figure with no `params` renders exactly as before, as a plain string,
  which is what keeps it server-renderable, exportable and byte-identical between runs. Only a figure
  that asks for a slider mounts a live element, and even then each frame is `render(definition,
values)` — a pure function of the definition and one number per parameter, so any slider position is
  reproducible from that number alone.

  The expression grammar now takes named parameters alongside `x`, and so do interval endpoints and
  marks: `"domain": [0, "b"]`, `{"tangent": {"of": "f", "at": "b"}}`. A name that was never declared
  still fails at parse time rather than evaluating to NaN on every frame, so a typo surfaces once
  rather than silently emptying the figure.

### Patch Changes

- @ai-gui/core@0.28.0

## 0.27.0

### Patch Changes

- @ai-gui/core@0.27.0

## 0.26.0

### Patch Changes

- @ai-gui/core@0.26.0

## 0.25.0

### Minor Changes

- 3a10131: New package: function and calculus figures.

  The model writes `y = f(x)` and an interval; the curve, its tangents, the area under it, its Riemann
  rectangles and its derivative are computed here. Output is a plain SVG string — no plotting library,
  no canvas, no runtime dependency beyond core, and a pure function of the definition, so the same
  fence renders identically on a server, in a test and in a browser.

  The division of labour is the design. Today a model asked to plot `y = x·sin(x)` has to sample the
  curve itself and hand a hundred points to a chart, which puts its arithmetic into the picture where
  a wrong point looks exactly like a right one. This block takes the expression instead, and refuses
  a definition containing `points`, `data`, `values` or `samples`. The slope of a tangent is measured
  by central difference rather than taken from the model, so an answer that mis-differentiates in its
  prose still draws the right line — and the `k = …` label comes from the same measurement, so the
  figure cannot contradict itself.

  The expression grammar is a recursive-descent parser over a fixed table, with no `eval` anywhere and
  `Object.hasOwn` lookups so an expression cannot reach `Object.prototype`. Implicit multiplication is
  rejected rather than guessed at, because `x(x+1)` is otherwise ambiguous with a function call. A
  sign binds looser than a power, so `-x^2` is negative.

  The prompt spec was measured, not guessed: twenty textbook questions through a model, one
  conversation each, two rounds, with every expression run through this package's own evaluator rather
  than eyeballed. The strictest rule — explicit `*` and brackets on every function — looked most
  likely to fail and did not fail once in forty figures. `src/fixtures/` keeps all twenty figures the
  final round produced, and they are part of the test suite.

### Patch Changes

- @ai-gui/core@0.25.0
