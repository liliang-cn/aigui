import { translate, type MessageBundle } from "@ai-gui/core"

/**
 * The model-facing rules for a data wall.
 *
 * The rule that must survive editing is "只用对话里已有的数字": a screen full of counting
 * numbers looks like evidence, and a model that fills gaps with plausible figures produces a
 * convincing lie. The examples show every panel kind once, because that is what a model copies,
 * and the numbers in them are obviously placeholders.
 *
 * You rarely want this directly: `buildSystemPrompt({ registry, plugins, locale })` from
 * `@ai-gui/core` collects the card specs and every enabled plugin's spec in one call, in the
 * product's language. Reach for this only to inspect or override one plugin's rules.
 */
export function bigscreenPromptSpec(locale?: string): string {
  return translate(PROMPT, locale, "spec")
}

const ZH = `数据大屏（围栏代码块）：\`\`\`bigscreen 开头，块内是一个 JSON 对象。当用户要一个"大屏 / 看板 / dashboard / 总览"，或者要把一组指标、排行、趋势、地域分布放在一起漂亮地展示时，输出一个 bigscreen 块。它会画成深色发光的数据墙：数字滚动增长、仪表盘扫过、排行条生长、图表逐步绘出、3D 图和地球缓慢旋转。文字说明照常写在块外。

只用对话里已有的数字。没有的数据就不要放这个面板，或者在块外说明缺什么。绝对不要编造一个看起来合理的数字来填空——大屏上的数字看起来像证据。

顶层字段：
- title、subtitle：大屏标题、副标题
- theme："dark"（默认）| "light"
- accent：主色，十六进制，如 "#22d3ee"
- columns：网格列数，默认 12
- panels（必填）：面板数组，最多 24 个

每个面板：kind（必填）、title、span（占几列，默认 4）、height（像素）。按 kind 填：
- "kpi"：value（必填）、unit、prefix（如 "¥"）、decimals、delta（变化率，小数：0.12 就是 +12%）、upIsGood（默认 true）、trend（一列数，画成迷你折线）、label
- "gauge"：value（必填）、max（默认 100）、unit、style "dial"（默认）| "ring"、thresholds [0.6, 0.85]（告警线：超过第一个变黄，超过第二个变红——只给"越高越危险"的指标用，如 CPU 占用、库存水位；完成率这类越高越好的不要给）
- "rank"：items（必填，[{"name","value"}]）、unit、top（默认 8）
- "chart"：option（必填）——完整的 ECharts option，颜色、字体、动画由大屏统一
- "chart3d"：type "bar3D" | "scatter3D" | "surface" | "line3D"、data（[[x, y, z], ...]）、xAxis / yAxis（类目名列表，给了的话 x、y 就是下标）、rotate（默认 true）
- "globe"：arcs（[{"from": [经度, 纬度], "to": [经度, 纬度], "label"}]）、points（[{"coord": [经度, 纬度], "label", "value"}]）、rotate（默认 true）。至少给一个。适合洲际、跨国的流向；同一个省内的线路在地球上只有几个像素，那种用普通图表

布局建议：第一行放 3–4 个 kpi（各 span 3），然后大图 span 8 配一个 rank 或 gauge span 4，3D 和地球 span 6。

例子——销售大屏：

\`\`\`bigscreen
{
  "title": "华东区销售大屏",
  "subtitle": "2026 年 8 月",
  "panels": [
    { "kind": "kpi", "title": "本月营收", "value": 12843000, "prefix": "¥", "delta": 0.124, "trend": [8.1, 8.6, 9.2, 9.0, 10.4, 11.9, 12.8], "span": 3 },
    { "kind": "kpi", "title": "订单数", "value": 48210, "unit": "单", "delta": 0.051, "span": 3 },
    { "kind": "kpi", "title": "客单价", "value": 266.4, "prefix": "¥", "decimals": 1, "delta": -0.018, "span": 3 },
    { "kind": "gauge", "title": "目标完成率", "value": 82, "unit": "%", "span": 3 },
    { "kind": "chart", "title": "月度趋势", "span": 8, "option": { "xAxis": { "type": "category", "data": ["3月", "4月", "5月", "6月", "7月", "8月"] }, "yAxis": { "type": "value" }, "series": [{ "type": "line", "smooth": true, "areaStyle": {}, "data": [820, 932, 901, 934, 1290, 1330] }] } },
    { "kind": "rank", "title": "门店排行", "span": 4, "unit": "万", "items": [{ "name": "上海", "value": 320 }, { "name": "杭州", "value": 245 }, { "name": "南京", "value": 198 }, { "name": "苏州", "value": 176 }, { "name": "宁波", "value": 121 }] },
    { "kind": "chart3d", "title": "品类 × 月份", "span": 6, "type": "bar3D", "xAxis": ["6月", "7月", "8月"], "yAxis": ["家电", "服饰", "食品"], "data": [[0, 0, 120], [1, 0, 150], [2, 0, 180], [0, 1, 90], [1, 1, 110], [2, 1, 140], [0, 2, 60], [1, 2, 75], [2, 2, 95]] },
    { "kind": "globe", "title": "出口流向", "span": 6, "arcs": [{ "from": [121.47, 31.23], "to": [8.68, 50.11], "label": "上海→法兰克福" }, { "from": [121.47, 31.23], "to": [-74.01, 40.71], "label": "上海→纽约" }, { "from": [121.47, 31.23], "to": [151.21, -33.87], "label": "上海→悉尼" }], "points": [{ "coord": [121.47, 31.23], "label": "上海", "value": 320 }, { "coord": [-74.01, 40.71], "label": "纽约", "value": 120 }] }
  ]
}
\`\`\`

这一版画不了的（遇到就退回普通图表或文字）：实时刷新、可交互筛选、表格、地图着色（省份热力图）、视频。需要宿主提供真实数据的 BI 看板用 dashboard 块，不用这个。`

const EN = `Data walls (fenced): \`\`\`bigscreen with a JSON object inside. Emit one when the user asks for a dashboard, an overview, a "big screen", or wants a set of metrics, rankings, trends and places shown together and shown well. It draws a dark, glowing wall: numbers count up, gauges sweep, rank bars grow, charts draw themselves, 3D charts and globes turn slowly. Keep the explanation itself outside the block.

Use only numbers the conversation already contains. Leave out a panel whose data you do not have, or say outside the block what is missing. Never invent a plausible figure to fill a gap — a number on a wall looks like evidence.

Top level: title, subtitle, theme ("dark" default or "light"), accent (hex), columns (default 12), panels (required, at most 24).

Each panel: kind (required), title, span (columns, default 4), height (px). By kind: "kpi" (value, unit, prefix, decimals, delta as a fraction, upIsGood, trend as a short number list, label); "gauge" (value, max default 100, unit, style "dial" or "ring", thresholds [0.6, 0.85] as alarm levels — amber past the first, red past the second — only for metrics where higher is worse, never for a completion rate); "rank" (items as {name, value}, unit, top default 8); "chart" (option: a full ECharts option — colours, fonts and animation come from the wall); "chart3d" (type "bar3D" | "scatter3D" | "surface" | "line3D", data as [x, y, z] points, optional xAxis and yAxis category lists, rotate); "globe" (arcs as {from: [lng, lat], to: [lng, lat], label}, points as {coord: [lng, lat], label, value}, rotate; at least one of arcs or points; for intercontinental flows — a route within one region is a few pixels on a globe, so use an ordinary chart for those).

Layout: a first row of three or four kpi panels at span 3, then a wide chart at span 8 beside a rank or gauge at span 4, and 3D or globe panels at span 6.

Example:

\`\`\`bigscreen
{
  "title": "East region sales",
  "subtitle": "August 2026",
  "panels": [
    { "kind": "kpi", "title": "Revenue", "value": 12843000, "prefix": "$", "delta": 0.124, "trend": [8.1, 8.6, 9.2, 9.0, 10.4, 11.9, 12.8], "span": 4 },
    { "kind": "gauge", "title": "Target", "value": 82, "unit": "%", "span": 4 },
    { "kind": "rank", "title": "Stores", "span": 4, "items": [{ "name": "Shanghai", "value": 320 }, { "name": "Hangzhou", "value": 245 }, { "name": "Nanjing", "value": 198 }] },
    { "kind": "chart", "title": "Trend", "span": 6, "option": { "xAxis": { "type": "category", "data": ["Mar", "Apr", "May", "Jun", "Jul", "Aug"] }, "yAxis": { "type": "value" }, "series": [{ "type": "line", "smooth": true, "areaStyle": {}, "data": [820, 932, 901, 934, 1290, 1330] }] } },
    { "kind": "chart3d", "title": "Category × month", "span": 6, "type": "bar3D", "xAxis": ["Jun", "Jul", "Aug"], "yAxis": ["Appliances", "Apparel", "Food"], "data": [[0, 0, 120], [1, 0, 150], [2, 0, 180], [0, 1, 90], [1, 1, 110], [2, 1, 140], [0, 2, 60], [1, 2, 75], [2, 2, 95]] }
  ]
}
\`\`\`

Not supported — fall back to ordinary charts or prose: live refresh, interactive filters, tables, choropleth maps, video. A BI board whose numbers must come from the host's own queries is a dashboard block, not this.`

const PROMPT: MessageBundle = { en: { spec: EN }, "zh-CN": { spec: ZH } }
