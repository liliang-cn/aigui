# @ai-gui/plugin-quote

Candlestick charts for [AIGUI](../../README.md). The prices come from the host or a market-data
tool; every indicator is computed here.

## Install

```sh
pnpm add @ai-gui/plugin-quote
```

No runtime dependency beyond `@ai-gui/core`. The output is an SVG string.

```tsx
import { quote } from "@ai-gui/plugin-quote"
<AIRenderer plugins={[quote()]} />
buildSystemPrompt({ registry, plugins: [quote()], locale: "zh-CN" })
```

````markdown
```quote
{
  "symbol": "AAPL",
  "series": [
    { "date": "2026-07-23", "open": 321.73, "high": 323.3, "low": 319.35, "close": 321.66, "volume": 40840800 }
  ],
  "indicators": ["ma5", "ma20"],
  "marks": [{ "from": "2026-07-28", "to": "2026-08-03", "label": "回调" }]
}
```
````

## This one runs the other way round

Every other figure plugin here takes conditions and derives the answer, because the answer follows
from the conditions. **A price follows from nothing** — it is an outside fact. So the model's job is
to relay, not to derive, and the protocol's job is to make relaying the only thing it can do.

Three guards, none of which needs to know what the price really was:

**A bar that could not have happened is refused.** `high` below the open or close, `low` above them,
dates that do not move forward. No check can prove figures are real; this one proves they are
impossible, it costs nothing, and it catches the careless kind of invention.

**Indicators are named, never valued.** `"indicators": ["ma20"]`, not `"ma20": [...]`. A twenty-day
average is twenty additions and a division done twenty times over; a model asked for the numbers
produces something plausible, and an indicator line is the last place anyone would check.

**There is no field for a view.** No `signal`, no `target`, no `rating`. The model may hold an
opinion and say so in the prose beside the chart, where a reader knows whose opinion it is. Rendered
as a mark on the chart, the same sentence reads as something the data supports.

## What was measured

Twenty questions through a model before any of this was written. Six asked for a chart of a stock
with **no data supplied at all** — it declined every one rather than inventing a series. Nine
carried real bars fetched through a market-data tool, and every figure it relayed matched the source
**exactly, digit for digit**. Asked whether to buy, it answered with a target and a stop in the
prose, because the protocol gave it nowhere else to put one.

`src/fixtures/` keeps those charts and the real data they came from; the tests compare every relayed
figure against it.

## Indicators

`ma<n>`, `ema<n>`, `rsi<n>`, `macd`, `boll`. MACD uses the 12/26/9 convention with the histogram at
twice DIF − DEA, as a Chinese terminal draws it; RSI uses Wilder's smoothing rather than a plain
average, which moves the line across the 70 and 30 levels a reader is looking at.

An indicator without enough history says so on the chart — `MACD (12, 26, 9) · 数据不足，至少需要 34 根K线`
— rather than drawing an empty panel.

## Colours

Rising is **red** for a `zh` locale and **green** otherwise. Red is up in Shanghai and down in New
York, and a chart drawn with the wrong convention reads as exactly its own opposite.

See the [root README](../../README.md) for the full plugin list.
