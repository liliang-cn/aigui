import { ancestors } from "./ontology"
import type { Palette } from "./palette"
import type { GraphDefinition, GraphLayer } from "./types"

/**
 * The one tooltip both views share: what an entity or a class is, in a few lines of DOM.
 *
 * Built from `textContent` only, never from markup, so nothing a model wrote is interpreted.
 */

const text = (tag: string, content: string, attrs: Record<string, string> = {}): HTMLElement => {
  const el = document.createElement(tag)
  el.textContent = content
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value)
  return el
}

/** An entity: its class chain, what its class is, its own description, its facts, its edges. */
export function describeEntity(def: GraphDefinition, id: string): HTMLElement[] {
  const entity = def.entities.find((e) => e.id === id)
  if (!entity) return []
  const classes = new Map(def.classes.map((cls) => [cls.id, cls]))
  const properties = new Map(def.properties.map((p) => [p.id, p]))
  const out: HTMLElement[] = [text("strong", entity.name)]
  if (entity.type !== undefined) {
    const chain = [entity.type, ...ancestors(def, entity.type)].map((c) => classes.get(c)?.name ?? c)
    out.push(text("div", chain.join(" ⊂ "), { "data-graph-tip-class": "" }))
    // The class's own description is often the only sentence anyone wrote about what this is.
    const about = classes.get(entity.type)?.description
    if (about) out.push(text("div", about, { "data-graph-tip-description": "" }))
  }
  if (entity.description) out.push(text("div", entity.description, { "data-graph-tip-description": "" }))
  if (entity.attrs) {
    const table = document.createElement("dl")
    for (const [key, value] of Object.entries(entity.attrs)) {
      table.appendChild(text("dt", key))
      table.appendChild(text("dd", String(value)))
    }
    out.push(table)
  }
  const edges: string[] = []
  for (const relation of def.relations) {
    if (relation.from !== id && relation.to !== id) continue
    const other = relation.from === id ? relation.to : relation.from
    const otherName = def.entities.find((e) => e.id === other)?.name ?? other
    const label = relation.name ?? (relation.type !== undefined ? properties.get(relation.type)?.name ?? relation.type : "—")
    edges.push(relation.from === id ? `→ ${label} ${otherName}` : `← ${label} ${otherName}`)
    if (edges.length >= 8) break
  }
  if (edges.length > 0) {
    const list = document.createElement("ul")
    for (const edge of edges) list.appendChild(text("li", edge))
    out.push(list)
  }
  return out
}

/** A class: its parents, its description, the properties it takes part in, how many instances. */
export function describeClass(def: GraphDefinition, id: string): HTMLElement[] {
  const cls = def.classes.find((c) => c.id === id)
  if (!cls) return []
  const classes = new Map(def.classes.map((c) => [c.id, c]))
  const out: HTMLElement[] = [text("strong", cls.name)]
  const chain = ancestors(def, id).map((c) => classes.get(c)?.name ?? c)
  if (chain.length > 0) out.push(text("div", `⊂ ${chain.join(" ⊂ ")}`, { "data-graph-tip-class": "" }))
  if (cls.description) out.push(text("div", cls.description, { "data-graph-tip-description": "" }))
  const lines: string[] = []
  for (const property of def.properties) {
    if (property.domain === id) lines.push(`${property.name} → ${property.range !== undefined ? classes.get(property.range)?.name ?? property.range : "*"}`)
    if (property.range === id && property.domain !== id) lines.push(`${property.domain !== undefined ? classes.get(property.domain)?.name ?? property.domain : "*"} → ${property.name}`)
  }
  if (lines.length > 0) {
    const list = document.createElement("ul")
    for (const line of lines.slice(0, 8)) list.appendChild(text("li", line))
    out.push(list)
  }
  const instances = def.entities.filter((e) => e.type === id).length
  if (instances > 0) out.push(text("div", `× ${instances}`, { "data-graph-tip-count": "" }))
  return out
}

export interface Tooltip {
  el: HTMLElement
  /** Fill the tooltip for `id` and place it beside the pointer, in `holder`'s coordinates. */
  show(id: string, clientX: number, clientY: number): void
  hide(): void
}

/** A tooltip inside `holder`, which must be positioned. Coloured from the palette, not the page. */
export function createTooltip(holder: HTMLElement, def: GraphDefinition, layer: GraphLayer, c: Palette): Tooltip {
  const el = document.createElement("div")
  el.setAttribute("data-aigui-graph-tip", "")
  el.setAttribute("role", "tooltip")
  el.style.background = c.surface
  el.style.color = c.text
  el.style.borderColor = c.border
  el.hidden = true
  holder.appendChild(el)
  return {
    el,
    show(id, clientX, clientY) {
      el.replaceChildren(...(layer === "ontology" ? describeClass(def, id) : describeEntity(def, id)))
      el.hidden = false
      const box = holder.getBoundingClientRect()
      const x = clientX - box.left
      const y = clientY - box.top
      // To the right of the pointer unless that would run off the figure, then to the left.
      el.style.left = x + 220 > box.width && x > 220 ? `${x - 212}px` : `${x + 12}px`
      el.style.top = `${y + 12}px`
    },
    hide() {
      el.hidden = true
    },
  }
}
