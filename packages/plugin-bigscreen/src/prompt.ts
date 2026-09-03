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

字数超了整个块就作废——一个太长的 label 会让整面墙消失，而不是那一句被截断。所有文字字段都短：unit 最多 16、prefix 最多 8、label 和排行项名字最多 40、面板 title 最多 80。它们是标签，不是句子。

只用对话里已有的数字。没有的数据就不要放这个面板，或者在块外说明缺什么。绝对不要编造一个看起来合理的数字来填空——大屏上的数字看起来像证据。

顶层字段：
- title、subtitle：大屏标题（最多 80 字符）、副标题（最多 120 字符）
- theme："dark"（默认）| "light"
- accent：主色，十六进制，如 "#22d3ee"
- columns：网格列数，默认 12
- panels（必填）：面板数组，最多 24 个

每个面板：kind（必填）、title（最多 80 字符）、span（占几列，默认 4）、height（像素）。按 kind 填：
- "kpi"：value（必填）、unit、prefix（如 "¥"）、decimals、delta（变化率，小数：0.12 就是 +12%）、upIsGood（默认 true）、trend（一列数，画成迷你折线）、label（数字下面的一行小字，**最多 40 字符**——写"较上月""同比"这种一眼看完的说明；明细放不下，要写明细就再开一个面板或者写在块外）
- "gauge"：value（必填）、max（默认 100）、unit、style "dial"（默认）| "ring"、thresholds [0.6, 0.85]（告警线：超过第一个变黄，超过第二个变红——只给"越高越危险"的指标用，如 CPU 占用、库存水位；完成率这类越高越好的不要给）
- "rank"：items（必填，[{"name","value"}]）、unit、top（默认 8）
- "chart"：option（必填）——完整的 ECharts option，颜色、字体、动画由大屏统一
- "chart3d"：type "bar3D" | "scatter3D" | "surface" | "line3D"、data（[[x, y, z], ...]）、xAxis / yAxis（类目名列表，给了的话 x、y 就是下标）、rotate（默认 true）
- "globe"：arcs（[{"from": [经度, 纬度], "to": [经度, 纬度], "label"}]）、points（[{"coord": [经度, 纬度], "label", "value"}]）、rotate（默认 true）。至少给一个。适合洲际、跨国的流向；同一个省内的线路在地球上只有几个像素，那种用普通图表
- "timeline"：一条泳道一个来源，一个点一条说法，说法之间可以连线。lanes（必填，1–24 条，[{"id", "name"（最多 40 字符）, "color"（十六进制）}]，从上到下就是你写的顺序）；items（必填，1–500 条，[{"id", "lane"（必须是上面某个 lane 的 id）, "at"（ISO 8601，如 "2026-09-01T08:00:00Z"）, "label"（最多 120 字符）, "detail"（最多 400 字符，只在悬停时出现）, "url"（只能是 http/https，点击打开）, "value"（点的大小）}]）；links（最多 500 条，[{"from", "to", "kind"}]，from 和 to 必须是上面写了 id 的 item，kind 是 "contradicts"（红线，两句话不可能同时为真）| "follows"（默认，带箭头）| "same"（点线，同一件事））；from、to（时间窗口，默认取所有 item 的范围再各留 5%）。lane 或 item 的 id 引用不到就整个块作废
- "graph3d"：实体和带类型的边组成的知识图谱。nodes（必填，1–2000 个，[{"id", "name"（最多 80 字符）, "type"（最多 32 字符，同名的 type 在整面墙上颜色一致）, "value"（大小，默认按度数）}]）；edges（必填，最多 5000 条，[{"from", "to", "type"（最多 32 字符）}]，两端必须是上面的 node id）；types（最多 32 项，把某个 type 指定成某个十六进制颜色）；focus（某个 node id，会高亮并且永远带标签）；mode（"orbit" 默认 | "flat"）；rotate（默认 true）。mode "orbit" 是真正的三维模型：实体在空间里由力导向布局散开，镜头绕着它转，rotate false 就直接给最终模型且不转；mode "flat" 是原来的 GPU 平面布局，一两千个节点以上、三维反而看不清时才用它。度数最高的 20 个带标签，其余悬停可见，右下角有类型图例

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

例子——一条时间线，三家媒体，四条说法，其中两条互相矛盾：

\`\`\`bigscreen
{
  "title": "边境车队",
  "panels": [
    {
      "kind": "timeline",
      "title": "各家说法",
      "span": 12,
      "lanes": [
        { "id": "reuters", "name": "路透社" },
        { "id": "tass", "name": "塔斯社" },
        { "id": "ap", "name": "美联社" }
      ],
      "items": [
        { "id": "c1", "lane": "reuters", "at": "2026-09-01T08:12:00Z", "label": "车队于清晨越境", "detail": "两名现场消息人士", "url": "https://example.com/reuters-1", "value": 3 },
        { "id": "c2", "lane": "tass", "at": "2026-09-01T09:30:00Z", "label": "没有任何车队越境" },
        { "id": "c3", "lane": "ap", "at": "2026-09-01T11:05:00Z", "label": "卫星影像确认越境" },
        { "id": "c4", "lane": "reuters", "at": "2026-09-01T14:40:00Z", "label": "第二支车队" }
      ],
      "links": [
        { "from": "c1", "to": "c2", "kind": "contradicts" },
        { "from": "c1", "to": "c4", "kind": "follows" },
        { "from": "c1", "to": "c3", "kind": "same" }
      ]
    }
  ]
}
\`\`\`

例子——一张知识图谱，六个实体三种类型，七条边：

\`\`\`bigscreen
{
  "title": "实体关系",
  "panels": [
    {
      "kind": "graph3d",
      "title": "谁报道了什么",
      "span": 12,
      "focus": "convoy",
      "nodes": [
        { "id": "kyiv", "name": "基辅", "type": "place" },
        { "id": "moscow", "name": "莫斯科", "type": "place" },
        { "id": "reuters", "name": "路透社", "type": "outlet" },
        { "id": "tass", "name": "塔斯社", "type": "outlet" },
        { "id": "convoy", "name": "车队越境", "type": "event" },
        { "id": "denial", "name": "否认越境", "type": "event" }
      ],
      "edges": [
        { "from": "reuters", "to": "convoy", "type": "reported" },
        { "from": "tass", "to": "denial", "type": "reported" },
        { "from": "convoy", "to": "kyiv", "type": "located" },
        { "from": "denial", "to": "moscow", "type": "located" },
        { "from": "convoy", "to": "denial", "type": "contradicts" },
        { "from": "reuters", "to": "kyiv", "type": "located" },
        { "from": "tass", "to": "moscow", "type": "located" }
      ]
    }
  ]
}
\`\`\`

这一版画不了的（遇到就退回普通图表或文字）：实时刷新、可交互筛选、表格、地图着色（省份热力图）、视频。需要宿主提供真实数据的 BI 看板用 dashboard 块，不用这个。`

const EN = `Data walls (fenced): \`\`\`bigscreen with a JSON object inside. Emit one when the user asks for a dashboard, an overview, a "big screen", or wants a set of metrics, rankings, trends and places shown together and shown well. It draws a dark, glowing wall: numbers count up, gauges sweep, rank bars grow, charts draw themselves, 3D charts and globes turn slowly. Keep the explanation itself outside the block.

Overrunning a length throws the whole block away — one label two characters too long loses the entire wall, rather than being trimmed. Every text field is short: unit at most 16, prefix 8, label and rank item names 40, panel title 80. They are labels, not sentences.

Use only numbers the conversation already contains. Leave out a panel whose data you do not have, or say outside the block what is missing. Never invent a plausible figure to fill a gap — a number on a wall looks like evidence.

Top level: title (at most 80 characters), subtitle (at most 120), theme ("dark" default or "light"), accent (hex), columns (default 12), panels (required, at most 24).

Each panel: kind (required), title (at most 80 characters), span (columns, default 4), height (px). By kind: "kpi" (value, unit, prefix, decimals, delta as a fraction, upIsGood, trend as a short number list, label — one short line under the number, **at most 40 characters**, for a caption like "vs last month"; detail does not fit there, so put it in its own panel or outside the block); "gauge" (value, max default 100, unit, style "dial" or "ring", thresholds [0.6, 0.85] as alarm levels — amber past the first, red past the second — only for metrics where higher is worse, never for a completion rate); "rank" (items as {name, value}, unit, top default 8); "chart" (option: a full ECharts option — colours, fonts and animation come from the wall); "chart3d" (type "bar3D" | "scatter3D" | "surface" | "line3D", data as [x, y, z] points, optional xAxis and yAxis category lists, rotate); "globe" (arcs as {from: [lng, lat], to: [lng, lat], label}, points as {coord: [lng, lat], label, value}, rotate; at least one of arcs or points; for intercontinental flows — a route within one region is a few pixels on a globe, so use an ordinary chart for those).

"timeline" — one swim-lane per source, one point per claim, lines between claims. lanes (required, 1 to 24, as {id, name at most 40 characters, color as hex}; drawn top-down in the order you write them); items (required, 1 to 500, as {id, lane — an id from lanes, at — ISO 8601 like "2026-09-01T08:00:00Z", label at most 120 characters, detail at most 400 and shown only on hover, url — http or https only, opened on click, value — how big the point is}); links (at most 500, as {from, to, kind}, where from and to are ids of items you gave an id to, and kind is "contradicts" (a red line: the two cannot both be true), "follows" (the default, with an arrow) or "same" (dotted, one thing said twice)); from and to for the window, which otherwise takes the claims' own range with 5% either side. A lane id or an item id that resolves to nothing voids the whole block.

"graph3d" — entities and typed edges as a knowledge graph. nodes (required, 1 to 2000, as {id, name at most 80 characters, type at most 32 characters — one type is one colour everywhere on the wall, value — how big, defaulting to its degree}); edges (required, at most 5000, as {from, to, type at most 32 characters}, both ends being node ids); types (at most 32 entries, pinning a type to a hex colour); focus (a node id, highlighted and always labelled); mode ("orbit", the default, or "flat"); rotate (default true). In "orbit" the graph is a real three-dimensional model: the entities settle into space in front of the reader and the camera turns around them, and rotate false hands over the settled model without turning it. "flat" is the older GPU layout on a plane — reach for it only when a graph is big enough that depth hides more than it shows. The twenty busiest entities carry a label, the rest are one hover away, and the types are keyed in the corner.

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

A timeline — three outlets, four claims, one of which contradicts another:

\`\`\`bigscreen
{
  "title": "Border convoy",
  "panels": [
    {
      "kind": "timeline",
      "title": "Who said what",
      "span": 12,
      "lanes": [
        { "id": "reuters", "name": "Reuters" },
        { "id": "tass", "name": "TASS" },
        { "id": "ap", "name": "AP" }
      ],
      "items": [
        { "id": "c1", "lane": "reuters", "at": "2026-09-01T08:12:00Z", "label": "Convoy crossed at dawn", "detail": "Two sources on the ground.", "url": "https://example.com/reuters-1", "value": 3 },
        { "id": "c2", "lane": "tass", "at": "2026-09-01T09:30:00Z", "label": "No convoy crossed" },
        { "id": "c3", "lane": "ap", "at": "2026-09-01T11:05:00Z", "label": "Crossing confirmed by satellite" },
        { "id": "c4", "lane": "reuters", "at": "2026-09-01T14:40:00Z", "label": "A second convoy" }
      ],
      "links": [
        { "from": "c1", "to": "c2", "kind": "contradicts" },
        { "from": "c1", "to": "c4", "kind": "follows" },
        { "from": "c1", "to": "c3", "kind": "same" }
      ]
    }
  ]
}
\`\`\`

A knowledge graph — six entities of three types, seven edges:

\`\`\`bigscreen
{
  "title": "Entities",
  "panels": [
    {
      "kind": "graph3d",
      "title": "Who reported what",
      "span": 12,
      "focus": "convoy",
      "nodes": [
        { "id": "kyiv", "name": "Kyiv", "type": "place" },
        { "id": "moscow", "name": "Moscow", "type": "place" },
        { "id": "reuters", "name": "Reuters", "type": "outlet" },
        { "id": "tass", "name": "TASS", "type": "outlet" },
        { "id": "convoy", "name": "Convoy crossing", "type": "event" },
        { "id": "denial", "name": "Denial of crossing", "type": "event" }
      ],
      "edges": [
        { "from": "reuters", "to": "convoy", "type": "reported" },
        { "from": "tass", "to": "denial", "type": "reported" },
        { "from": "convoy", "to": "kyiv", "type": "located" },
        { "from": "denial", "to": "moscow", "type": "located" },
        { "from": "convoy", "to": "denial", "type": "contradicts" },
        { "from": "reuters", "to": "kyiv", "type": "located" },
        { "from": "tass", "to": "moscow", "type": "located" }
      ]
    }
  ]
}
\`\`\`

Not supported — fall back to ordinary charts or prose: live refresh, interactive filters, tables, choropleth maps, video. A BI board whose numbers must come from the host's own queries is a dashboard block, not this.`

const PROMPT: MessageBundle = { en: { spec: EN }, "zh-CN": { spec: ZH } }
