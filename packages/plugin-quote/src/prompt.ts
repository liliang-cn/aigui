import { translate, type MessageBundle } from "@ai-gui/core"

/**
 * The model-facing rules for price charts.
 *
 * Measured before the plugin was written, and the measurement is why the rules read the way they
 * do. Twenty questions through a model: six of them asked for a chart of a stock with no data
 * supplied at all, and the model declined every one rather than inventing a series. Nine carried
 * real bars fetched through a market-data tool, and every figure it relayed matched the source
 * exactly, digit for digit.
 *
 * The one rule that earned its place by being broken is the last. Asked whether to buy, the model
 * answered with a target price and a stop — in the prose, where a reader knows whose opinion it is,
 * because the protocol gave it nowhere else to put it. That is the whole argument for not having a
 * `signal` field: it is not that a model will not offer a view, it is that a view rendered as a
 * mark on a chart reads as something the data supports.
 */
export function quotePromptSpec(locale?: string): string {
  return translate(PROMPT, locale, "spec")
}

const ZH = `行情图（围栏代码块）：\` \`\`\`quote \` 开头，块内是一个 JSON 对象。用来画 K 线图和技术指标。

**数据只能来自你真实拿到的行情**：工具返回的结果，或者用户在问题里给你的表格。

**手上没有数据时，不要输出这个块。** 写一句话说明需要行情数据即可。凭记忆写出来的价格看起来和真的一模一样，而读者没有任何办法分辨——这是这条规则存在的唯一原因。

**不要自己算指标。** 均线、MACD、RSI、布林带的**数值**由渲染器从 K 线算出来，你只需要写出想看哪些指标的**名字**。

**不要写结论字段。** 涨跌判断、买卖倾向、目标价，都写在块外的文字里，不要放进 JSON。

## 字段

- \`symbol\`（必填）：代码，如 \`"AAPL"\`、\`"GC=F"\`、\`"600519.SS"\`
- \`name\`：名称，可省略
- \`series\`（必填）：K 线数组，按日期从早到晚
  - \`{"date": "2026-07-23", "open": 321.73, "high": 323.3, "low": 319.35, "close": 321.66, "volume": 40840800}\`
  - 数字照抄你拿到的数据，不要四舍五入、不要补齐、不要插值
- \`indicators\`：想叠加的指标名，如 \`["ma5", "ma20", "ma60", "macd", "rsi14", "boll"]\`
- \`marks\`：要标注的区间，如 \`[{"from": "2026-07-28", "to": "2026-08-03", "label": "回调"}]\`
- \`caption\`：一句话说明这张图画的是什么

## 例子

\`\`\`quote
{
  "symbol": "AAPL",
  "name": "Apple Inc.",
  "series": [
    { "date": "2026-07-23", "open": 321.73, "high": 323.3, "low": 319.35, "close": 321.66, "volume": 40840800 },
    { "date": "2026-07-24", "open": 321.79, "high": 334.37, "low": 321.62, "close": 333.02, "volume": 47489400 }
  ],
  "indicators": ["ma5", "ma20"],
  "caption": "AAPL 日线与 5 日、20 日均线"
}
\`\`\``

const EN = `Price charts (fenced): \`\`\`quote with a JSON object inside, for candlesticks and indicators.

The prices may only come from market data you actually have — a tool result, or a table the user gave you.

**With no data in hand, do not emit this block.** Say that market data is needed. Prices written from memory look exactly like real ones and a reader has no way to tell the difference; that is the only reason this rule exists.

Do not compute indicators. The values of a moving average, MACD, RSI or Bollinger band are computed from the bars — you name the indicators you want.

Do not put a conclusion in a field. A view on direction, a recommendation or a target price goes in the prose outside the block.

Fields: \`symbol\` (required), \`name\`, \`series\` (required, oldest first, each bar \`{date, open, high, low, close, volume}\` with figures copied exactly as you received them), \`indicators\` (names such as \`ma5\`, \`ma20\`, \`ema12\`, \`macd\`, \`rsi14\`, \`boll\`), \`marks\` (\`{from, to, label}\` over dates in the series), and \`caption\`.

Example:

\`\`\`quote
{
  "symbol": "AAPL",
  "series": [
    { "date": "2026-07-23", "open": 321.73, "high": 323.3, "low": 319.35, "close": 321.66, "volume": 40840800 }
  ],
  "indicators": ["ma5", "ma20"],
  "caption": "AAPL daily with 5- and 20-day moving averages"
}
\`\`\`

Not supported — explain in markdown instead: price forecasts, buy or sell advice and target prices, option pricing, automatic candlestick-pattern recognition, and correlation with macroeconomic series.`

const PROMPT: MessageBundle = { en: { spec: EN }, "zh-CN": { spec: ZH } }
