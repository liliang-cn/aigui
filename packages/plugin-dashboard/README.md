# @ai-gui/plugin-dashboard

A BI dashboard as a first-class AIGUI fence: a grid of panels, each a table +
ECharts chart + provenance disclosure — or a per-panel refusal.

The division of labour is the point: the **model proposes the layout** (which
metrics by which dimensions), the **host writes every number** by running the
queries and serializing the fence. A model that can invent a panel's rows can
invent the dashboard that proves its own point.

```ts
import { dashboard, serializeDashboardFence } from "@ai-gui/plugin-dashboard"

const fence = serializeDashboardFence({
  title: "Store performance",
  panels: [{
    title: "Revenue by store",
    columns: ["store", { name: "revenue", align: "right" }],
    rows: [["East", "9,308,286.52"], ["West", "6,195,909.55"]],
    sql: "SELECT store, SUM(amount) FROM sales GROUP BY store",
    chart: { xAxis: {…}, yAxis: {…}, series: [{ type: "bar", data: […] }] },
  }, {
    title: "Gross margin",
    error: "role `viewer` may not read gross_margin_rate",
  }],
})

// render side
renderer.use(dashboard({ locale: "zh-CN", chartHeight: 240 }))
```

- Panels flow in a responsive `auto-fit` grid — one column on a phone.
- Charts are live ECharts instances sized to their panel and following it on
  resize.
- A refused panel renders the refusal where its numbers would have been: one
  role's restriction never blanks another role's board.
- `align: "right"` on a column keeps host-formatted strings ("9,308,286.52")
  right-aligned — declaration instead of number-detection.
