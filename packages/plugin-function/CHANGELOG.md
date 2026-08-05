# @ai-gui/plugin-function

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
