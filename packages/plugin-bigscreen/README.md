# @ai-gui/plugin-bigscreen

Animated data walls for [AIGUI](../../README.md): KPIs that count up, gauges that sweep, rank
bars that grow, charts that draw themselves, and 3D bars and globes that turn — on a grid the
model lays out.

## Install

```sh
pnpm add @ai-gui/plugin-bigscreen echarts
# for the chart3d and globe panels
pnpm add echarts-gl
```

`echarts-gl` is an optional peer: without it the 3D and globe panels show a one-line note and the
rest of the wall is unaffected. It is imported lazily, once, the first time such a panel mounts.

## Usage

```tsx
import { bigscreen } from "@ai-gui/plugin-bigscreen"
import { buildSystemPrompt } from "@ai-gui/core"

<AIRenderer plugins={[bigscreen()]} />

const system = buildSystemPrompt({ registry, plugins: [bigscreen()], locale: "zh-CN" })
```

The model then emits:

````markdown
```bigscreen
{
  "title": "华东区销售大屏",
  "subtitle": "2026 年 8 月",
  "panels": [
    { "kind": "kpi", "title": "本月营收", "value": 12843000, "prefix": "¥", "delta": 0.124, "trend": [8.1, 8.6, 9.2, 9.0, 10.4, 11.9, 12.8], "span": 3 },
    { "kind": "gauge", "title": "目标完成率", "value": 82, "unit": "%", "span": 3 },
    { "kind": "rank", "title": "门店排行", "span": 6, "unit": "万", "items": [{ "name": "上海", "value": 320 }, { "name": "杭州", "value": 245 }] },
    { "kind": "chart3d", "title": "品类 × 月份", "span": 6, "type": "bar3D", "xAxis": ["6月", "7月", "8月"], "yAxis": ["家电", "服饰"], "data": [[0, 0, 120], [1, 0, 150], [2, 0, 180], [0, 1, 90], [1, 1, 110], [2, 1, 140]] },
    { "kind": "globe", "title": "出口流向", "span": 6, "arcs": [{ "from": [121.47, 31.23], "to": [8.68, 50.11], "label": "上海→法兰克福" }, { "from": [121.47, 31.23], "to": [-74.01, 40.71], "label": "上海→纽约" }] }
  ]
}
```
````

## Panels

| kind | what it draws | fields |
| --- | --- | --- |
| `kpi` | one number counted up from zero, a coloured delta, a sparkline | `value`, `unit`, `prefix`, `decimals`, `delta` (a fraction), `upIsGood`, `trend`, `label` |
| `gauge` | a dial or a ring sweeping to the value; with `thresholds`, amber past the first and red past the second, for metrics where higher is worse | `value`, `max`, `unit`, `style` (`dial` / `ring`), `thresholds` |
| `rank` | horizontal bars, longest first, growing in | `items`, `unit`, `top` |
| `chart` | any ECharts option in the wall's palette, with entrance animation | `option` |
| `chart3d` | `bar3D`, `scatter3D`, `surface` or `line3D`, slowly turning | `type`, `data`, `xAxis`, `yAxis`, `rotate` |
| `globe` | a globe with arcing routes and sized points | `arcs`, `points`, `rotate` |

Every panel takes `title`, `span` (columns of the grid, default 4 of 12) and `height`. The screen
takes `title`, `subtitle`, `theme` (`dark` by default, or `light`), `accent` (hex) and `columns`.

## Why the protocol looks like this

**Presentation, not evidence.** [`@ai-gui/plugin-dashboard`](../plugin-dashboard/README.md) is the
block for a BI board over real queries: the host writes every number and the model may only
propose the layout. This block lets the model lay out numbers it was given — a summary, a demo,
a briefing — and its prompt spec says, in the first paragraph, never to invent one. A wall of
counting numbers looks like evidence, which is exactly why the rule is there.

**Nothing fetched.** ECharts' globe wants a texture and the usual one is a photograph loaded from a
URL. Here the texture is painted on a canvas in the page and handed over as a data URL — a deep
sphere with a graticule, the look a data wall's globe has anyway — so a fence can never make the
page load anything.

**One palette.** Charts get the wall's colours, font, transparent background and animation laid
under whatever the model wrote; the model's own settings win wherever they overlap. Series colours
start from the accent, so a screen reads as one thing.

**Unknown fields are refused.** A model that wrote `sparkline` or `refresh` wanted something on
the screen, and a panel quietly missing it is the wrong screen.

## Options

- `maxPanels?: number` — refuse a screen with more panels than this, default 24.
- `maxSourceBytes?: number` — refuse a fence larger than this before parsing it, default 64 KiB.
- `animate?: boolean` — `false` draws every panel at its final state: no count-ups, no sweeps, no
  rotation. Default `true`.
- `theme?: "dark" | "light"` — the host's palette; a `theme` in the fence wins. Absent both, the
  renderer's `theme` context decides, and `dark` is the fallback.

Charts are drawn on canvas (WebGL needs it, and the animations are smoother there) and follow
their panel on resize. Everything is disposed on unmount.

Not in this version, and the prompt spec tells the model to fall back to plain charts or prose:
live refresh, interactive filters, tables, choropleth maps, video.

See the [root README](../../README.md) for the full plugin list.
