/**
 * The blocks an agent can draw with this server, and what each one is for.
 *
 * A subset of `@ai-gui/cli`'s catalog: the plugins that draw something from the fence alone. The
 * ones left out need a host behind them — a form posts somewhere, a card needs its component, a
 * map needs a tile server — and a page opened from disk has none of that.
 *
 * `picture` is whether `aigui_render` can turn the block into a PNG. The rest draw only in the
 * browser page `aigui_open` writes.
 */
export interface BlockInfo {
  name: string
  fence: string
  picture: boolean
  what: string
}

export const BLOCKS: BlockInfo[] = [
  { name: "chart", fence: "```chart", picture: true, what: "any ECharts chart — bar, line, pie, scatter, heatmap, sankey, radar, 3D" },
  { name: "mermaid", fence: "```mermaid", picture: true, what: "flowcharts, sequence, class, state, ER, gantt diagrams" },
  { name: "katex", fence: "$…$ / $$…$$", picture: true, what: "maths, and chemistry with \\ce{}" },
  { name: "bigscreen", fence: "```bigscreen", picture: true, what: "a dashboard wall: KPIs, gauges, ranks, charts, 3D bars, a globe" },
  { name: "dashboard", fence: "```dashboard", picture: true, what: "a grid of table + chart panels" },
  { name: "scene", fence: "```scene", picture: true, what: "a 3D scene built from boxes, spheres, cylinders…" },
  { name: "gravity", fence: "```gravity", picture: true, what: "orbits and collisions, integrated from masses and speeds" },
  { name: "topology", fence: "```topology", picture: true, what: "infrastructure topology — nodes in hosts and racks, links, states — with steps that play a process like a write or a failover" },
  { name: "molecule", fence: "```molecule", picture: true, what: "a molecule from SMILES, in 2D or 3D" },
  { name: "graph", fence: "```graph", picture: false, what: "a network of nodes and edges" },
  { name: "solid", fence: "```solid", picture: false, what: "solid-geometry figures — cubes, pyramids, sections" },
  { name: "function", fence: "```function", picture: false, what: "a function plotted, with tangents and areas" },
  { name: "optics", fence: "```optics", picture: false, what: "lenses and mirrors with the ray diagram" },
  { name: "motion", fence: "```motion", picture: false, what: "projectiles, oscillation, 1D collisions" },
  { name: "physics", fence: "```physics", picture: false, what: "force and vector diagrams" },
  { name: "figure", fence: "```figure", picture: false, what: "a labelled figure with callouts" },
  { name: "quote", fence: "```quote", picture: false, what: "candlesticks with computed indicators" },
  { name: "primitives", fence: "```list / ```table / ```key-value", picture: false, what: "lists, tables and key-value blocks from JSON" },
  { name: "highlight", fence: "```<lang>", picture: false, what: "syntax-highlighted code" },
  { name: "progress", fence: "```progress", picture: false, what: "a step list with status" },
  { name: "citation", fence: "```sources", picture: false, what: "a list of cited sources" },
]

export const BLOCK_NAMES = BLOCKS.map((block) => block.name)
