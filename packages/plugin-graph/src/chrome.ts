import { translate, type MessageBundle } from "@ai-gui/core"
import { mount2d, type Mounted2d } from "./mount2d"
import { checkRelations } from "./ontology"
import { palette } from "./palette"
import { escape } from "./render2d"
import type { EntityDef, GraphDefinition, GraphLayer, GraphView } from "./types"

/**
 * The frame around the figure: the toggles, the violation list, the caption, and the switching
 * between the four (view, layer) pictures a block can show.
 *
 * Framework-free DOM, because the plugin renders into every adapter through one `mount` output.
 * The 3D renderer is imported only when a reader (or the block) asks for it, so a page of 2D
 * graphs never downloads three.js; if that import fails, or the page has no WebGL, the figure
 * says so in one line and stays in 2D rather than going blank.
 */

const MESSAGES: MessageBundle = {
  en: {
    view2d: "2D",
    view3d: "3D",
    instances: "Instances",
    ontology: "Ontology",
    violations: "{n} relation(s) break the ontology",
    domain: "domain",
    range: "range",
    expected: "expected",
    got: "got",
    untyped: "untyped",
    no3d: "The 3D view needs WebGL and could not be started; showing the 2D figure.",
    view: "View",
    layer: "Layer",
  },
  "zh-CN": {
    view2d: "2D",
    view3d: "3D",
    instances: "实例",
    ontology: "本体",
    violations: "{n} 条关系不符合本体约束",
    domain: "定义域",
    range: "值域",
    expected: "应为",
    got: "实为",
    untyped: "无类型",
    no3d: "3D 视图需要 WebGL，未能启动；已改为 2D 图。",
    view: "视图",
    layer: "图层",
  },
}

export interface ChromeOptions {
  height: number
  labelBudget: number
  three: boolean
  theme?: string
  locale?: string
  onEntityClick?: (entity: EntityDef) => void
}

/** One line per violation, in the reader's language: `Alice —worksAt→ Bob: range expected Organization, got Person`. */
export function violationLines(def: GraphDefinition, locale?: string): string[] {
  const t = (key: string) => translate(MESSAGES, locale, key)
  const entities = new Map(def.entities.map((entity) => [entity.id, entity]))
  const classes = new Map(def.classes.map((cls) => [cls.id, cls]))
  const properties = new Map(def.properties.map((property) => [property.id, property]))
  const className = (id: string | undefined) => (id === undefined ? t("untyped") : classes.get(id)?.name ?? id)
  return checkRelations(def).map((violation) => {
    const relation = def.relations[violation.relation]
    const from = entities.get(relation.from)?.name ?? relation.from
    const to = entities.get(relation.to)?.name ?? relation.to
    const property = relation.type !== undefined ? properties.get(relation.type)?.name ?? relation.type : ""
    return `${from} —${property}→ ${to}: ${t(violation.side)} ${t("expected")} ${className(violation.expected)}, ${t("got")} ${className(violation.actual)}`
  })
}

/** The violation list and the caption as HTML — what the static figure and the mounted one share. */
export function footerHtml(def: GraphDefinition, locale?: string): string {
  const lines = violationLines(def, locale)
  const violations =
    lines.length === 0
      ? ""
      : `<div data-aigui-graph-violations=""><div data-aigui-graph-violations-title="">${escape(translate(MESSAGES, locale, "violations").replace("{n}", String(lines.length)))}</div><ul>${lines.map((line) => `<li>${escape(line)}</li>`).join("")}</ul></div>`
  const caption = def.caption ? `<figcaption data-aigui-graph-caption="">${escape(def.caption)}</figcaption>` : ""
  return violations + caption
}

function button(label: string, attrs: Record<string, string>): HTMLButtonElement {
  const el = document.createElement("button")
  el.type = "button"
  el.textContent = label
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value)
  return el
}

/** Mount the whole figure into `el` and return its teardown. */
export function mountGraph(el: HTMLElement, def: GraphDefinition, options: ChromeOptions): () => void {
  const t = (key: string) => translate(MESSAGES, options.locale, key)
  const colours = palette(options.theme)
  const root = document.createElement("figure")
  root.setAttribute("data-aigui-graph", "")
  el.appendChild(root)

  const hasOntology = def.classes.length > 0
  let view: GraphView = options.three ? def.view : "2d"
  let layer: GraphLayer = hasOntology ? def.layer : "instances"

  const toolbar = document.createElement("div")
  toolbar.setAttribute("data-aigui-graph-toolbar", "")
  const viewGroup = document.createElement("div")
  viewGroup.setAttribute("role", "group")
  viewGroup.setAttribute("aria-label", t("view"))
  const view2d = button(t("view2d"), { "data-graph-view": "2d" })
  viewGroup.appendChild(view2d)
  const view3d = options.three ? button(t("view3d"), { "data-graph-view": "3d" }) : undefined
  if (view3d) viewGroup.appendChild(view3d)
  toolbar.appendChild(viewGroup)
  let layerButtons: HTMLButtonElement[] = []
  if (hasOntology) {
    const layerGroup = document.createElement("div")
    layerGroup.setAttribute("role", "group")
    layerGroup.setAttribute("aria-label", t("layer"))
    layerButtons = [button(t("instances"), { "data-graph-layer-toggle": "instances" }), button(t("ontology"), { "data-graph-layer-toggle": "ontology" })]
    for (const b of layerButtons) layerGroup.appendChild(b)
    toolbar.appendChild(layerGroup)
  }
  root.appendChild(toolbar)

  const stage = document.createElement("div")
  stage.setAttribute("data-aigui-graph-stage", "")
  stage.style.height = `${options.height}px`
  root.appendChild(stage)
  const note = document.createElement("div")
  note.setAttribute("data-aigui-graph-note", "")
  note.hidden = true
  root.appendChild(note)
  const footer = document.createElement("div")
  footer.innerHTML = footerHtml(def, options.locale)
  while (footer.firstChild) root.appendChild(footer.firstChild)

  const pressed = (): void => {
    view2d.setAttribute("aria-pressed", String(view === "2d"))
    view3d?.setAttribute("aria-pressed", String(view === "3d"))
    for (const b of layerButtons) b.setAttribute("aria-pressed", String(b.getAttribute("data-graph-layer-toggle") === layer))
  }

  let current: Mounted2d | undefined
  let pending = 0
  let disposed = false
  let drawnAt = 0
  const width = () => stage.clientWidth || 640

  const show2d = (): void => {
    drawnAt = width()
    current = mount2d(stage, def, layer, { palette: colours, width: drawnAt, height: options.height, labelBudget: options.labelBudget, onEntityClick: options.onEntityClick })
  }

  // The figure is usually mounted before it is in the document, when the stage has no width and
  // the fallback is used; the first real measurement redraws it to fit. Later changes redraw only
  // when they are large — a resize that keeps the layout legible should not throw away the
  // reader's zoom.
  const onResize = (): void => {
    if (disposed || view !== "2d" || !current) return
    const now = stage.clientWidth
    if (now === 0 || Math.abs(now - drawnAt) / drawnAt < 0.2) return
    current.destroy()
    show2d()
  }
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(onResize)
  observer?.observe(stage)

  const show = (): void => {
    current?.destroy()
    current = undefined
    stage.replaceChildren()
    note.hidden = true
    pressed()
    if (view === "2d") {
      show2d()
      return
    }
    // Only the most recent request may land: a reader who flips to 3D and straight back must not
    // have the 3D renderer arrive on top of the 2D figure a moment later.
    const ticket = ++pending
    void import("./render3d")
      .then(({ mount3d }) => mount3d(stage, def, layer, { palette: colours, height: options.height, labelBudget: options.labelBudget, rotate: def.rotate, onEntityClick: options.onEntityClick }))
      .then((handle) => {
        if (disposed || ticket !== pending) {
          handle.destroy()
          return
        }
        current = handle
      })
      .catch(() => {
        if (disposed || ticket !== pending) return
        view = "2d"
        pressed()
        note.textContent = t("no3d")
        note.hidden = false
        stage.replaceChildren()
        show2d()
      })
  }

  const onView = (next: GraphView) => () => {
    if (view === next) return
    view = next
    show()
  }
  const onLayer = (next: GraphLayer) => () => {
    if (layer === next) return
    layer = next
    show()
  }
  view2d.addEventListener("click", onView("2d"))
  view3d?.addEventListener("click", onView("3d"))
  for (const b of layerButtons) b.addEventListener("click", onLayer(b.getAttribute("data-graph-layer-toggle") as GraphLayer))

  show()

  return () => {
    if (disposed) return
    disposed = true
    pending++
    observer?.disconnect()
    current?.destroy()
    current = undefined
    root.remove()
  }
}
