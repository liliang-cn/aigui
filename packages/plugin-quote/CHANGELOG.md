# @ai-gui/plugin-quote

## 0.38.0

### Patch Changes

- @ai-gui/core@0.38.0

## 0.37.1

### Patch Changes

- @ai-gui/core@0.37.1

## 0.37.0

### Patch Changes

- @ai-gui/core@0.37.0

## 0.36.3

### Patch Changes

- @ai-gui/core@0.36.3

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

- 5cdfcff: New package: candlestick charts with computed indicators.

  The bars come from the host or a market-data tool; MA, EMA, MACD, RSI and Bollinger bands are
  computed from them. Plain SVG, no runtime dependency beyond core.

  This plugin runs the other way round from the teaching ones. There the model states conditions and
  the renderer derives the answer, because the answer follows from the conditions. A price follows
  from nothing — it is an outside fact — so the model's job is to relay and the protocol's job is to
  make relaying the only thing it can do.

  Three guards, none of which needs to know the real price. A bar whose high is below its close is
  impossible whatever the truth was, so it is refused; the check is free and catches careless
  invention. Indicators are named rather than valued, so a hand-computed moving average cannot reach
  the chart. And there is no field for a view on the market: the model may say what it thinks in the
  prose beside the figure, where a reader knows whose opinion it is, but a view rendered as a mark
  reads as something the data supports.

  Measured before it was written. Twenty questions through a model: six asked for a chart of a stock
  with no data supplied and it declined every one rather than inventing a series; nine carried real
  bars fetched through a market-data tool and every figure it relayed matched the source digit for
  digit. Asked whether to buy, it put the target and the stop in the prose, because the protocol gave
  it nowhere else. Those charts and the real data behind them are in `src/fixtures/`, and the tests
  compare the two.

  Rising is red for a `zh` locale and green otherwise, because red is up in Shanghai and down in New
  York and the wrong convention reads as its own opposite.

### Patch Changes

- @ai-gui/core@0.28.0
