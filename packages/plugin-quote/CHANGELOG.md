# @ai-gui/plugin-quote

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
