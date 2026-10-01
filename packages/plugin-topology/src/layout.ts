import dagre from "@dagrejs/dagre"
import type { TopologyDefinition, TopologyNode } from "./types"

export interface Point {
  x: number
  y: number
}

/** A box by its top-left corner. */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface Layout {
  width: number
  height: number
  nodes: Map<string, Box>
  /** Group boxes, outermost first, so drawing in order puts inner groups on top. */
  groups: Array<{ id: string; label: string; box: Box; depth: number }>
  /** One polyline per link, in the definition's order, from `from` to `to`. */
  links: Point[][]
  /** Where each link's label goes, when it has one. */
  linkLabels: Array<Point | undefined>
}

export const NODE_HEIGHT = 46
const NOTE_HEIGHT = 14
const GROUP_PAD = 14
const GROUP_TITLE = 22
const MARGIN = 16

/** Wide enough for the name or the note, whichever is longer, plus the glyph. */
export function nodeWidth(node: TopologyNode): number {
  const chars = (s: string) => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 13 : 7.4), 0)
  return Math.max(112, Math.ceil(Math.max(chars(node.label ?? node.id), chars(node.note ?? "") * 0.85) + 54))
}

export const nodeHeight = (node: TopologyNode) => NODE_HEIGHT + (node.note ? NOTE_HEIGHT : 0)

/**
 * Lay a topology out in layers, with groups drawn round their members.
 *
 * Dagre does the layering and the edge routing; what it does not do is leave room for a group's
 * title, so every group is grown by a title band and padding afterwards, innermost first, and the
 * whole drawing is shifted to keep the outermost boxes on the canvas.
 */
export function layoutTopology(definition: TopologyDefinition): Layout {
  const graph = new dagre.graphlib.Graph({ compound: true, multigraph: true })
  graph.setGraph({ rankdir: definition.direction ?? "LR", nodesep: 34, ranksep: 78, edgesep: 18, marginx: MARGIN, marginy: MARGIN })
  graph.setDefaultEdgeLabel(() => ({}))
  for (const group of definition.groups ?? []) graph.setNode(group.id, {})
  for (const group of definition.groups ?? []) if (group.group) graph.setParent(group.id, group.group)
  for (const node of definition.nodes) {
    graph.setNode(node.id, { width: nodeWidth(node), height: nodeHeight(node) })
    if (node.group) graph.setParent(node.id, node.group)
  }
  for (const [index, link] of (definition.links ?? []).entries()) {
    const label = link.label ? { width: [...link.label].length * 7 + 10, height: 16, labelpos: "c" } : {}
    graph.setEdge(link.from, link.to, label, String(index))
  }
  dagre.layout(graph)

  const nodes = new Map<string, Box>()
  for (const node of definition.nodes) {
    const n = graph.node(node.id)
    nodes.set(node.id, { x: n.x - n.width / 2, y: n.y - n.height / 2, width: n.width, height: n.height })
  }

  // Groups from their members, innermost first, so a parent's box includes its children's grown boxes.
  const groups = definition.groups ?? []
  const depth = (id: string): number => {
    let d = 0
    for (let up = groups.find((g) => g.id === id)?.group; up; up = groups.find((g) => g.id === up)?.group) d++
    return d
  }
  const boxes = new Map<string, Box>()
  for (const group of [...groups].sort((a, b) => depth(b.id) - depth(a.id))) {
    const members: Box[] = [
      ...definition.nodes.filter((n) => n.group === group.id).map((n) => nodes.get(n.id)!),
      ...groups.filter((g) => g.group === group.id).map((g) => boxes.get(g.id)!).filter(Boolean),
    ]
    if (members.length === 0) continue
    const left = Math.min(...members.map((m) => m.x)) - GROUP_PAD
    const top = Math.min(...members.map((m) => m.y)) - GROUP_PAD - GROUP_TITLE
    const right = Math.max(...members.map((m) => m.x + m.width)) + GROUP_PAD
    const bottom = Math.max(...members.map((m) => m.y + m.height)) + GROUP_PAD
    boxes.set(group.id, { x: left, y: top, width: right - left, height: bottom - top })
  }

  const links: Point[][] = []
  const linkLabels: Array<Point | undefined> = []
  for (const [index, link] of (definition.links ?? []).entries()) {
    const edge = graph.edge(link.from, link.to, String(index)) as { points: Point[]; x?: number; y?: number }
    links.push(edge.points.map((p) => ({ x: p.x, y: p.y })))
    linkLabels.push(link.label && edge.x !== undefined && edge.y !== undefined ? { x: edge.x, y: edge.y } : undefined)
  }

  // Everything onto the canvas: groups grew past dagre's margins.
  const all: Box[] = [...nodes.values(), ...boxes.values()]
  const points = [...links.flat(), ...linkLabels.filter((p): p is Point => !!p)]
  const minX = Math.min(...all.map((b) => b.x), ...points.map((p) => p.x)) - MARGIN
  const minY = Math.min(...all.map((b) => b.y), ...points.map((p) => p.y)) - MARGIN
  const maxX = Math.max(...all.map((b) => b.x + b.width), ...points.map((p) => p.x)) + MARGIN
  const maxY = Math.max(...all.map((b) => b.y + b.height), ...points.map((p) => p.y)) + MARGIN
  const shift = (b: Box): Box => ({ ...b, x: b.x - minX, y: b.y - minY })
  const move = (p: Point): Point => ({ x: p.x - minX, y: p.y - minY })
  return {
    width: Math.ceil(maxX - minX),
    height: Math.ceil(maxY - minY),
    nodes: new Map([...nodes].map(([id, b]) => [id, shift(b)])),
    groups: [...groups]
      .filter((g) => boxes.has(g.id))
      .sort((a, b) => depth(a.id) - depth(b.id))
      .map((g) => ({ id: g.id, label: g.label ?? g.id, box: shift(boxes.get(g.id)!), depth: depth(g.id) })),
    links: links.map((line) => line.map(move)),
    linkLabels: linkLabels.map((p) => (p ? move(p) : undefined)),
  }
}

/** Total length of a polyline. */
export const lengthOf = (line: readonly Point[]): number => line.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - line[i].x, p.y - line[i].y), 0)

/** The point `t` (0–1) of the way along a polyline. */
export function pointAlong(line: readonly Point[], t: number): Point {
  const total = lengthOf(line)
  let left = Math.max(0, Math.min(1, t)) * total
  for (let i = 1; i < line.length; i++) {
    const step = Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y)
    if (left <= step || i === line.length - 1) {
      const k = step > 0 ? Math.min(1, left / step) : 0
      return { x: line[i - 1].x + (line[i].x - line[i - 1].x) * k, y: line[i - 1].y + (line[i].y - line[i - 1].y) * k }
    }
    left -= step
  }
  return line[line.length - 1]
}
