import type { EChartsCoreOption } from "echarts/core"
import { FONT } from "./options"
import type { Palette } from "./palette"
import type { Graph3dNode, Graph3dPanel } from "./types"

/**
 * A knowledge graph of entities and typed edges, laid out by force-atlas2 on the GPU.
 *
 * `graphGL` rather than a plain `graph` series: a graph of a few hundred entities is a smear in
 * SVG and a slideshow in canvas, and the WebGL series draws thousands of nodes while the layout
 * is still moving. The layout it runs is force-atlas2, the same one Gephi made the default reading
 * of "what is near what" in a citation graph.
 *
 * Pure: the option is a function of the panel and the palette.
 */

/** How many entities carry a written label. The rest are one hover away. */
export const GRAPH_LABELS = 20

/**
 * How the layout is run.
 *
 * `steps` is iterations per frame and `maxSteps` is where the layout stops. Settling takes
 * `maxSteps / steps` frames — 125 of them, a shade over two seconds at sixty frames a second,
 * which is long enough to watch a graph of five hundred entities pull itself apart and short
 * enough that nobody waits for it. When nothing is meant to move, the same thousand iterations
 * are spent four frames deep and the reader gets the settled graph instead of the settling.
 *
 * (echarts-gl 2.x bounds the layout with `maxSteps`; there is no convergence threshold to set.)
 */
export const GRAPH_SETTLE_STEPS = 8
export const GRAPH_INSTANT_STEPS = 250
export const GRAPH_MAX_STEPS = 1000

/** How many types the corner legend lists before it would start covering the graph. */
export const GRAPH_LEGEND_ROWS = 12

/** How many of the palette's series colours a type may be hashed onto. */
const GRAPH_COLOURS = 7

/**
 * Where the graph starts, and where it is pulled to.
 *
 * echarts-gl scatters the first positions at random inside the panel and fits the camera to them
 * once — `_updateCamera` refits only when the graph has left the frame entirely — so a random
 * start is why a settled graph sits wherever its first throw of the dice happened to land. Seeding
 * the nodes on a ring instead fixes the frame, and makes the same entities draw the same picture
 * twice running.
 *
 * The frame it fits is not centred on that ring: it pads the left by a fifth of the padded width,
 * which leaves the ring's own centre 0.16 of a radius right of the middle. So the layout's
 * `gravityCenter` is moved the same distance the other way, and the settled graph comes out in
 * the middle of the panel.
 */
const SEED_RADIUS = 45
const SEED_OFFSET = 0.16

const FNV_OFFSET = 2166136261
const FNV_PRIME = 16777619

/** FNV-1a, for a colour that depends on the name of a type and on nothing else. */
function hash(value: string): number {
  let h = FNV_OFFSET
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, FNV_PRIME)
  }
  return h >>> 0
}

/**
 * The colour of a type.
 *
 * Hashed rather than handed out in order of appearance, because two graph panels on one wall must
 * colour `outlet` the same way, and the order the types happen to appear in is different in each
 * of them. A hash means two types can land on the same colour, which is what the legend in the
 * corner is for; a panel that cares says so in `types`.
 *
 * Only the first seven series colours are in the ring. The eighth is a second cyan a shade off
 * the accent, and two types a reader cannot tell apart is worse than two types sharing a colour
 * the legend admits to sharing.
 *
 * A node with no type gets the muted colour: it is not a category, so it does not get one of the
 * colours the categories are being told apart by.
 */
export function typeColour(type: string | undefined, c: Palette, overrides?: Record<string, string>): string {
  if (type === undefined) return c.muted
  const ring = c.series.slice(0, GRAPH_COLOURS)
  return overrides?.[type] ?? ring[hash(type) % ring.length]
}

/** How many edges touch each node. Both ends count, so a self-edge counts twice. */
export function degrees(panel: Graph3dPanel): Map<string, number> {
  const count = new Map<string, number>(panel.nodes.map((node) => [node.id, 0]))
  for (const edge of panel.edges) {
    for (const id of [edge.from, edge.to]) {
      const current = count.get(id)
      if (current !== undefined) count.set(id, current + 1)
    }
  }
  return count
}

export interface GraphLegendEntry {
  label: string
  colour: string
  shape: "node" | "edge"
}

/**
 * The key drawn in the panel's corner: every type that appears, once, in its own colour.
 *
 * Nodes first, then edges, each in the order it first appears — which is the order the model
 * wrote them in, and therefore the order it was thinking in. An untyped graph gets no legend at
 * all rather than an empty box.
 */
export function graphLegend(panel: Graph3dPanel, c: Palette): GraphLegendEntry[] {
  const entries: GraphLegendEntry[] = []
  const seen = new Set<string>()
  const add = (shape: "node" | "edge", type: string | undefined): void => {
    if (type === undefined) return
    const key = `${shape}:${type}`
    if (seen.has(key)) return
    seen.add(key)
    entries.push({ label: type, colour: typeColour(type, c, panel.types), shape })
  }
  for (const node of panel.nodes) add("node", node.type)
  for (const edge of panel.edges) add("edge", edge.type)
  return entries.slice(0, GRAPH_LEGEND_ROWS)
}

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export function graph3dOption(panel: Graph3dPanel, c: Palette, animate: boolean): EChartsCoreOption {
  const degree = degrees(panel)
  const weight = (node: Graph3dNode): number => node.value ?? degree.get(node.id) ?? 0
  const maxWeight = Math.max(1, ...panel.nodes.map(weight))
  // The busiest entities, plus the one the panel was drawn to point at — which is labelled
  // whether or not anything is connected to it, because that is the whole reason it was named.
  const named = new Set(
    [...panel.nodes]
      .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
      .slice(0, GRAPH_LABELS)
      .map((node) => node.id),
  )
  if (panel.focus !== undefined) named.add(panel.focus)

  // Constant density: a ring that grows with the square root of the count, so twenty entities
  // and two thousand start equally crowded.
  const radius = SEED_RADIUS * Math.sqrt(panel.nodes.length) + 60
  const nodes = panel.nodes.map((node, index) => {
    const focused = node.id === panel.focus
    const symbolSize = (focused ? 6 : 0) + 6 + 16 * Math.sqrt(weight(node) / maxWeight)
    const angle = (index / panel.nodes.length) * Math.PI * 2
    return {
      id: node.id,
      name: node.name,
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
      // Carried alongside for the tooltip and the host's click; `type` is taken by ECharts.
      nodeType: node.type,
      degree: degree.get(node.id) ?? 0,
      node,
      symbolSize,
      itemStyle: { color: focused ? c.accent : typeColour(node.type, c, panel.types), opacity: 0.95 },
      label: focused ? { show: true, fontSize: 13, fontWeight: "bold", color: c.accent } : { show: named.has(node.id) },
    }
  })

  const edges = panel.edges.map((edge) => ({
    source: edge.from,
    target: edge.to,
    edgeType: edge.type,
    lineStyle: { color: typeColour(edge.type, c, panel.types), opacity: 0.55, width: 1.5 },
  }))

  const settling = animate && panel.rotate !== false
  return {
    backgroundColor: "transparent",
    textStyle: { color: c.text, fontFamily: FONT },
    tooltip: {
      trigger: "item",
      confine: true,
      // Escaped by hand: ECharts renders a formatter's return as HTML and every name here was
      // written by a model.
      formatter: (params: { dataType?: string; data?: unknown }) => {
        const data = (params.data ?? {}) as { name?: string; nodeType?: string; degree?: number; edgeType?: string }
        if (params.dataType === "edge") return escapeHtml(data.edgeType ?? "linked to")
        const rows = [`<b>${escapeHtml(data.name ?? "")}</b>`]
        if (data.nodeType) rows.push(`<span style="opacity:.7">${escapeHtml(data.nodeType)}</span>`)
        rows.push(`<span style="opacity:.7">${data.degree ?? 0} connections</span>`)
        return rows.join("<br/>")
      },
    },
    series: [
      {
        type: "graphGL",
        layout: "forceAtlas2",
        forceAtlas2: {
          GPU: true,
          steps: settling ? GRAPH_SETTLE_STEPS : GRAPH_INSTANT_STEPS,
          maxSteps: GRAPH_MAX_STEPS,
          // Repulsion turned well up and gravity down: the default settles a small graph into a
          // ball a fifth of the panel wide, where the labels sit on top of each other and the
          // edges are hidden behind the nodes. A knowledge graph is read by its shape.
          gravity: 0.6,
          scaling: 5,
          gravityCenter: [-SEED_OFFSET * radius, 0],
          // A knowledge graph's edges carry a type, not a weight, so every edge pulls equally.
          edgeWeightInfluence: 0,
          repulsionByDegree: true,
          preventOverlap: true,
        },
        roam: true,
        // Hovering an entity dims everything it is not connected to, which is the one thing a
        // reader always wants from a graph this size.
        focusNodeAdjacency: true,
        zoom: 1,
        label: { show: false, position: "right", distance: 4, color: c.text, fontSize: 11, fontFamily: FONT, formatter: "{b}" },
        emphasis: { label: { show: true } },
        lineStyle: { color: c.gridLine, width: 1, opacity: 0.35 },
        nodes,
        edges,
      },
    ],
  }
}
