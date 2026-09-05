import { ancestors, ontologyGraph } from "./ontology"
import type { Palette } from "./palette"
import { renderGraphSVG } from "./render2d"
import type { EntityDef, GraphDefinition, GraphLayer } from "./types"

/**
 * The interaction on top of the 2D figure.
 *
 * The SVG is drawn once, as a string; everything here is attributes toggled on the elements it
 * already contains and one tooltip beside them. Hovering an item names it and its neighbours
 * (`data-active`, `data-neighbour`) and the stylesheet fades the rest; the wheel zooms and a drag
 * pans by rewriting the `viewBox`, so nothing is re-laid-out and nothing is re-rendered.
 */

export interface Mount2dOptions {
  palette: Palette
  width: number
  height: number
  labelBudget: number
  onEntityClick?: (entity: EntityDef) => void
}

export interface Mounted2d {
  destroy(): void
}

const DRAG_THRESHOLD = 3
const ZOOM_STEP = 0.9
const MIN_ZOOM = 0.2
const MAX_ZOOM = 6

const text = (tag: string, content: string, attrs: Record<string, string> = {}): HTMLElement => {
  const el = document.createElement(tag)
  el.textContent = content
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value)
  return el
}

/** What the tooltip says about an entity: its class, its description, its facts, its edges. */
function describeEntity(def: GraphDefinition, id: string): HTMLElement[] {
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

/** What the tooltip says about a class: its parents, its description, its properties, its instances. */
function describeClass(def: GraphDefinition, id: string): HTMLElement[] {
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

/** Neighbours by id and the edges touching each id, for the layer being shown. */
function adjacency(def: GraphDefinition, layer: GraphLayer): { neighbours: Map<string, Set<string>>; edges: Map<string, Set<number>> } {
  const links = layer === "ontology" ? ontologyGraph(def).links : def.relations
  const neighbours = new Map<string, Set<string>>()
  const edges = new Map<string, Set<number>>()
  links.forEach((link, index) => {
    for (const [a, b] of [[link.from, link.to], [link.to, link.from]]) {
      if (!neighbours.has(a)) neighbours.set(a, new Set())
      neighbours.get(a)!.add(b)
      if (!edges.has(a)) edges.set(a, new Set())
      edges.get(a)!.add(index)
    }
  })
  return { neighbours, edges }
}

/** Draw one layer into `host` and wire the hover, zoom, pan and click on top of it. */
export function mount2d(host: HTMLElement, def: GraphDefinition, layer: GraphLayer, options: Mount2dOptions): Mounted2d {
  const rendered = renderGraphSVG(def, layer, options.palette, { width: options.width, height: options.height, labelBudget: options.labelBudget })
  const holder = document.createElement("div")
  holder.setAttribute("data-aigui-graph-canvas", "")
  holder.innerHTML = rendered.svg
  const svg = holder.querySelector("svg")!
  const tip = document.createElement("div")
  tip.setAttribute("data-aigui-graph-tip", "")
  tip.setAttribute("role", "tooltip")
  tip.hidden = true
  holder.appendChild(tip)
  host.appendChild(holder)

  const { neighbours, edges } = adjacency(def, layer)
  const items = new Map<string, Element>()
  for (const item of svg.querySelectorAll("[data-graph-item]")) items.set(item.getAttribute("data-graph-item")!, item)
  const edgeElements = Array.from(svg.querySelectorAll("[data-graph-edge]"))
  const entities = new Map(def.entities.map((entity) => [entity.id, entity]))

  const itemOf = (event: Event): string | undefined => {
    const target = event.target as Element | null
    return target?.closest?.("[data-graph-item]")?.getAttribute("data-graph-item") ?? undefined
  }

  const clear = (): void => {
    svg.removeAttribute("data-graph-active")
    for (const item of items.values()) {
      item.removeAttribute("data-active")
      item.removeAttribute("data-neighbour")
    }
    for (const edge of edgeElements) edge.removeAttribute("data-neighbour")
    tip.hidden = true
  }

  const activate = (id: string, event: Event): void => {
    clear()
    svg.setAttribute("data-graph-active", id)
    items.get(id)?.setAttribute("data-active", "")
    for (const other of neighbours.get(id) ?? []) items.get(other)?.setAttribute("data-neighbour", "")
    for (const index of edges.get(id) ?? []) edgeElements[index]?.setAttribute("data-neighbour", "")
    tip.replaceChildren(...(layer === "ontology" ? describeClass(def, id) : describeEntity(def, id)))
    tip.hidden = false
    const pointer = event as PointerEvent
    const box = holder.getBoundingClientRect()
    const x = (pointer.clientX ?? 0) - box.left
    const y = (pointer.clientY ?? 0) - box.top
    // To the right of the pointer unless that would run off the figure, then to the left.
    tip.style.left = x + 220 > box.width && x > 220 ? `${x - 212}px` : `${x + 12}px`
    tip.style.top = `${y + 12}px`
  }

  const onOver = (event: Event): void => {
    const id = itemOf(event)
    if (id !== undefined) activate(id, event)
  }
  const onOut = (event: Event): void => {
    if (itemOf(event) !== undefined) clear()
  }

  // Zoom and pan rewrite the viewBox; the drawing itself never changes.
  const base = [0, 0, rendered.width, rendered.height] as const
  let view: [number, number, number, number] = [...base]
  const apply = (): void => svg.setAttribute("viewBox", view.map((v) => Number(v.toFixed(2))).join(" "))
  const onWheel = (event: Event): void => {
    const wheel = event as WheelEvent
    event.preventDefault()
    const factor = (wheel.deltaY ?? 0) < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
    const zoom = view[2] / base[2]
    if ((factor < 1 && zoom <= MIN_ZOOM) || (factor > 1 && zoom >= MAX_ZOOM)) return
    const box = svg.getBoundingClientRect()
    // Keep the point under the pointer where it is.
    const fx = box.width > 0 ? ((wheel.clientX ?? 0) - box.left) / box.width : 0.5
    const fy = box.height > 0 ? ((wheel.clientY ?? 0) - box.top) / box.height : 0.5
    const width = view[2] * factor
    const height = view[3] * factor
    view = [view[0] + (view[2] - width) * fx, view[1] + (view[3] - height) * fy, width, height]
    apply()
  }

  let drag: { x: number; y: number; view: [number, number, number, number] } | undefined
  let dragged = false
  const onDown = (event: Event): void => {
    const pointer = event as PointerEvent
    if ((pointer.button ?? 0) !== 0) return
    dragged = false
    drag = { x: pointer.clientX ?? 0, y: pointer.clientY ?? 0, view: [...view] }
  }
  const onMove = (event: Event): void => {
    if (!drag) return
    const pointer = event as PointerEvent
    const dx = (pointer.clientX ?? 0) - drag.x
    const dy = (pointer.clientY ?? 0) - drag.y
    if (!dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    dragged = true
    const box = svg.getBoundingClientRect()
    const scaleX = box.width > 0 ? view[2] / box.width : 1
    const scaleY = box.height > 0 ? view[3] / box.height : 1
    view = [drag.view[0] - dx * scaleX, drag.view[1] - dy * scaleY, drag.view[2], drag.view[3]]
    apply()
  }
  const onUp = (): void => {
    drag = undefined
  }
  const onDoubleClick = (): void => {
    view = [...base]
    apply()
  }
  const onClick = (event: Event): void => {
    if (dragged || layer === "ontology") return
    const id = itemOf(event)
    const entity = id !== undefined ? entities.get(id) : undefined
    if (entity) options.onEntityClick?.(entity)
  }

  svg.addEventListener("pointerover", onOver)
  svg.addEventListener("pointerout", onOut)
  svg.addEventListener("wheel", onWheel, { passive: false })
  svg.addEventListener("pointerdown", onDown)
  svg.addEventListener("pointermove", onMove)
  svg.addEventListener("pointerup", onUp)
  svg.addEventListener("pointercancel", onUp)
  svg.addEventListener("dblclick", onDoubleClick)
  svg.addEventListener("click", onClick)

  let destroyed = false
  return {
    destroy() {
      if (destroyed) return
      destroyed = true
      svg.removeEventListener("pointerover", onOver)
      svg.removeEventListener("pointerout", onOut)
      svg.removeEventListener("wheel", onWheel)
      svg.removeEventListener("pointerdown", onDown)
      svg.removeEventListener("pointermove", onMove)
      svg.removeEventListener("pointerup", onUp)
      svg.removeEventListener("pointercancel", onUp)
      svg.removeEventListener("dblclick", onDoubleClick)
      svg.removeEventListener("click", onClick)
      holder.remove()
    },
  }
}
