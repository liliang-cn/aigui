import { layoutTopology, lengthOf, pointAlong, type Layout, type Point } from "./layout"
import type { LinkState, NodeKind, NodeState, TopologyDefinition, TopologyMessage } from "./types"

export interface Palette {
  fg: string
  muted: string
  surface: string
  border: string
  group: string
  groupBorder: string
  link: string
  accent: string
  halo: string
}

export function palette(theme?: string): Palette {
  return theme === "dark"
    ? { fg: "#e5e7eb", muted: "#9ca3af", surface: "#1f2937", border: "#4b5563", group: "rgba(148,163,184,0.07)", groupBorder: "#475569", link: "#94a3b8", accent: "#38bdf8", halo: "#111827" }
    : { fg: "#111827", muted: "#6b7280", surface: "#ffffff", border: "#cbd5e1", group: "rgba(100,116,139,0.06)", groupBorder: "#94a3b8", link: "#64748b", accent: "#0284c7", halo: "#ffffff" }
}

/** The colour each state always has, so a reader learns it once. */
export const STATE_COLOURS: Record<NodeState, string> = {
  primary: "#16a34a",
  active: "#16a34a",
  ok: "#16a34a",
  secondary: "#2563eb",
  standby: "#2563eb",
  syncing: "#d97706",
  degraded: "#d97706",
  warning: "#d97706",
  failed: "#dc2626",
  down: "#dc2626",
  offline: "#6b7280",
  diskless: "#7c3aed",
  unknown: "#6b7280",
}

/** What the diagram looks like at one step: every state change up to it applied. */
export interface Frame {
  nodes: Map<string, NodeState | undefined>
  links: Array<LinkState | undefined>
  highlight: Set<string>
  /** Messages travelling now, or — drawn still — every step's messages, numbered by step. */
  messages: Array<TopologyMessage & { step: number }>
  caption?: string
}

/**
 * The diagram at step `index` (−1 before any step), or with `all` the finished picture: every
 * change applied and every message shown, numbered by the step it belongs to.
 */
export function frameAt(definition: TopologyDefinition, index: number | "all"): Frame {
  const steps = definition.steps ?? []
  const last = index === "all" ? steps.length - 1 : index
  const nodes = new Map(definition.nodes.map((n) => [n.id, n.state]))
  const links = (definition.links ?? []).map((l) => l.state)
  for (const step of steps.slice(0, last + 1)) {
    for (const [id, state] of Object.entries(step.states ?? {})) nodes.set(id, state)
    for (const [id, state] of Object.entries(step.links ?? {})) {
      const at = (definition.links ?? []).findIndex((l) => l.id === id)
      if (at >= 0) links[at] = state
    }
  }
  const current = last >= 0 ? steps[last] : undefined
  return {
    nodes,
    links,
    highlight: new Set(index === "all" ? [] : current?.highlight ?? []),
    messages:
      index === "all"
        ? steps.flatMap((s, i) => (s.messages ?? []).map((m) => ({ ...m, step: i + 1 })))
        : (current?.messages ?? []).map((m) => ({ ...m, step: last + 1 })),
    caption: index === "all" ? undefined : current?.caption,
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const f = (n: number) => Math.round(n * 10) / 10

/** A small glyph for each kind of node, drawn in a 16×16 box. */
function glyph(kind: NodeKind | undefined, colour: string): string {
  const s = `fill="none" stroke="${colour}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"`
  switch (kind) {
    case "disk":
      return `<ellipse cx="8" cy="4" rx="6" ry="2.2" ${s}/><path d="M2 4v8c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V4" ${s}/>`
    case "database":
      return `<ellipse cx="8" cy="3.5" rx="6" ry="2" ${s}/><path d="M2 3.5v9c0 1.1 2.7 2 6 2s6-.9 6-2v-9M2 8c0 1.1 2.7 2 6 2s6-.9 6-2" ${s}/>`
    case "network":
      return `<circle cx="8" cy="8" r="6" ${s}/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" ${s}/>`
    case "balancer":
      return `<circle cx="3" cy="8" r="1.6" ${s}/><path d="M4.6 8h3M7.6 8l5-4.5M7.6 8l5 4.5M7.6 8h5" ${s}/>`
    case "client":
      return `<rect x="2" y="3" width="12" height="8" rx="1" ${s}/><path d="M5.5 14h5M8 11v3" ${s}/>`
    case "service":
      return `<path d="M8 1.8l5.4 3.1v6.2L8 14.2l-5.4-3.1V4.9z" ${s}/>`
    case "process":
      return `<path d="M3 4l4 4-4 4M8.5 12H13" ${s}/>`
    case "queue":
      return `<rect x="1.5" y="5" width="3.5" height="6" rx=".6" ${s}/><rect x="6.25" y="5" width="3.5" height="6" rx=".6" ${s}/><rect x="11" y="5" width="3.5" height="6" rx=".6" ${s}/>`
    case "cloud":
      return `<path d="M4.5 12.5h7.2a3 3 0 0 0 .3-6 4 4 0 0 0-7.6-1A3.5 3.5 0 0 0 4.5 12.5z" ${s}/>`
    case "vm":
      return `<rect x="2" y="2" width="12" height="12" rx="2" ${s}/><rect x="5" y="5" width="6" height="6" rx="1" ${s}/>`
    case "container":
      return `<path d="M8 1.8l5.6 3v6.4L8 14.2l-5.6-3V4.8zM2.4 4.8L8 8l5.6-3.2M8 8v6.2" ${s}/>`
    default:
      return `<rect x="2" y="2" width="12" height="5" rx="1" ${s}/><rect x="2" y="9" width="12" height="5" rx="1" ${s}/><path d="M4.5 4.5h.01M4.5 11.5h.01" ${s}/>`
  }
}

/** A polyline as a smooth path: straight runs joined by short curves at the bends. */
export function pathFor(points: readonly Point[]): string {
  if (points.length < 3) return `M${points.map((p) => `${f(p.x)} ${f(p.y)}`).join("L")}`
  let d = `M${f(points[0].x)} ${f(points[0].y)}`
  for (let i = 1; i < points.length - 1; i++) {
    const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 }
    d += `Q${f(points[i].x)} ${f(points[i].y)} ${f(mid.x)} ${f(mid.y)}`
  }
  const end = points[points.length - 1]
  return `${d}L${f(end.x)} ${f(end.y)}`
}

/** The link a message travels along — either direction — or a straight line when there is none. */
export function routeFor(definition: TopologyDefinition, layout: Layout, message: TopologyMessage): Point[] {
  const links = definition.links ?? []
  const forward = links.findIndex((l) => l.from === message.from && l.to === message.to)
  if (forward >= 0) return layout.links[forward]
  const backward = links.findIndex((l) => l.from === message.to && l.to === message.from)
  if (backward >= 0) return [...layout.links[backward]].reverse()
  const centre = (id: string) => {
    const b = layout.nodes.get(id)!
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }
  return [centre(message.from), centre(message.to)]
}

/**
 * The diagram as SVG markup, at one frame.
 *
 * Moving parts — the message dots — are not in it: the page draws those on top and moves them.
 * Drawn still (`numbered`), each message is a numbered marker half-way along its route instead, so
 * a picture still says what happens in which order.
 */
export function svgFor(definition: TopologyDefinition, layout: Layout, frame: Frame, colours: Palette, numbered: boolean): string {
  const parts: string[] = []
  parts.push(
    `<defs><marker id="aigui-topo-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${colours.link}"/></marker>`,
    `<marker id="aigui-topo-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${colours.accent}"/></marker></defs>`,
  )

  for (const group of layout.groups) {
    const b = group.box
    parts.push(
      `<g data-topo-group="${esc(group.id)}"><rect x="${f(b.x)}" y="${f(b.y)}" width="${f(b.width)}" height="${f(b.height)}" rx="10" fill="${colours.group}" stroke="${colours.groupBorder}" stroke-dasharray="${group.depth > 0 ? "4 3" : "0"}" stroke-width="1"/>`,
      `<text x="${f(b.x + 12)}" y="${f(b.y + 16)}" font-size="12" font-weight="600" fill="${colours.muted}">${esc(group.label)}</text></g>`,
    )
  }

  for (const [index, link] of (definition.links ?? []).entries()) {
    const points = layout.links[index]
    const state = frame.links[index]
    const colour = state === "down" ? STATE_COLOURS.failed : state === "active" ? colours.accent : colours.link
    const dash = state === "down" || link.style === "dashed" ? ` stroke-dasharray="6 4"` : ""
    const marker = link.directed === false ? "" : ` marker-end="url(#aigui-topo-arrow${state === "active" ? "-active" : ""})"`
    parts.push(`<path data-topo-link="${index}" d="${pathFor(points)}" fill="none" stroke="${colour}" stroke-width="${state === "active" ? 2.4 : 1.5}"${dash}${marker}/>`)
    if (state === "down") {
      const mid = pointAlong(points, link.label ? 0.3 : 0.5)
      parts.push(`<path d="M${f(mid.x - 5)} ${f(mid.y - 5)}l10 10M${f(mid.x + 5)} ${f(mid.y - 5)}l-10 10" stroke="${STATE_COLOURS.failed}" stroke-width="2.2" stroke-linecap="round"/>`)
    }
    const at = layout.linkLabels[index]
    if (link.label && at) {
      // A solid block behind the words: a halo round the glyphs leaves the line showing between them.
      const w = [...link.label].reduce((sum, ch) => sum + (ch.charCodeAt(0) > 0x2e80 ? 11 : 6.2), 0) + 10
      parts.push(
        `<rect x="${f(at.x - w / 2)}" y="${f(at.y - 8)}" width="${f(w)}" height="16" rx="4" fill="${colours.halo}"/>`,
        `<text x="${f(at.x)}" y="${f(at.y + 4)}" text-anchor="middle" font-size="11" fill="${colours.muted}">${esc(link.label)}</text>`,
      )
    }
  }

  for (const node of definition.nodes) {
    const b = layout.nodes.get(node.id)!
    const state = frame.nodes.get(node.id)
    const colour = state ? STATE_COLOURS[state] : colours.border
    const lit = frame.highlight.has(node.id)
    const faded = state === "failed" || state === "down" || state === "offline"
    parts.push(`<g data-topo-node="${esc(node.id)}"${faded ? ` opacity="0.78"` : ""}>`)
    if (lit) parts.push(`<rect x="${f(b.x - 5)}" y="${f(b.y - 5)}" width="${f(b.width + 10)}" height="${f(b.height + 10)}" rx="12" fill="none" stroke="${colours.accent}" stroke-width="2" opacity="0.55"/>`)
    parts.push(
      `<rect x="${f(b.x)}" y="${f(b.y)}" width="${f(b.width)}" height="${f(b.height)}" rx="8" fill="${colours.surface}" stroke="${colour}" stroke-width="${state ? 2 : 1.2}"/>`,
      `<g transform="translate(${f(b.x + 12)} ${f(b.y + 15)})">${glyph(node.kind, state ? colour : colours.muted)}</g>`,
      `<text x="${f(b.x + 36)}" y="${f(b.y + 28)}" font-size="13" font-weight="600" fill="${colours.fg}">${esc(node.label ?? node.id)}</text>`,
    )
    if (node.note) parts.push(`<text x="${f(b.x + 36)}" y="${f(b.y + 44)}" font-size="11" fill="${colours.muted}">${esc(node.note)}</text>`)
    if (state) {
      // On the top edge, right of centre: a link coming in from above lands on the centre.
      const w = [...state].length * 6.2 + 12
      const x = Math.max(b.x + b.width / 2 + 10, b.x + b.width - w - 6)
      parts.push(
        `<rect x="${f(x)}" y="${f(b.y - 8)}" width="${f(w)}" height="16" rx="8" fill="${colour}"/>`,
        `<text x="${f(x + w / 2)}" y="${f(b.y + 3.5)}" text-anchor="middle" font-size="10" font-weight="600" fill="#ffffff">${esc(state)}</text>`,
      )
    }
    parts.push("</g>")
  }

  if (numbered) {
    // Still: each message as a numbered marker on its route, at the spot along it that is furthest
    // from the link's own label and from the markers already placed. What the message carries goes
    // in the step list under the picture, where it has room — on the line it collided with the rest.
    const taken: Point[] = layout.linkLabels.filter((p): p is Point => !!p)
    for (const message of frame.messages) {
      const route = routeFor(definition, layout, message)
      const spots = [0.5, 0.32, 0.68, 0.22, 0.78, 0.4, 0.6].map((t) => pointAlong(route, t))
      const room = (p: Point) => Math.min(Infinity, ...taken.map((u) => Math.hypot(u.x - p.x, (u.y - p.y) * 1.6)))
      const at = spots.reduce((best, p) => (room(p) > room(best) + 4 ? p : best), spots[0])
      taken.push(at)
      parts.push(`<g data-topo-message><circle cx="${f(at.x)}" cy="${f(at.y)}" r="9" fill="${colours.accent}" stroke="${colours.halo}" stroke-width="2"/><text x="${f(at.x)}" y="${f(at.y + 3.6)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#ffffff">${message.step}</text></g>`)
    }
  }
  return parts.join("")
}

/** The layout and an SVG element's opening tag for it, scaled to its container. */
export function svgShell(layout: Layout, label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" width="100%" style="max-width:${layout.width}px;display:block;margin-inline:auto;font-family:ui-sans-serif,system-ui,-apple-system,'PingFang SC','Noto Sans CJK SC',sans-serif" role="img" aria-label="${esc(label)}">`
}

export { layoutTopology, lengthOf, pointAlong }
