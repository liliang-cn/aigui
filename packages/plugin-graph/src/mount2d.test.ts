// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { mount2d } from "./mount2d"
import { palette } from "./palette"
import { parseGraph } from "./parse"
import type { GraphDefinition } from "./types"

const def = (raw: unknown): GraphDefinition => {
  const parsed = parseGraph(JSON.stringify(raw))
  if (!parsed.ok) throw new Error(parsed.error.message)
  return parsed.value
}

const ZOO = def({
  classes: [{ id: "Animal" }, { id: "Dog", subClassOf: "Animal", description: "man's best friend" }, { id: "Food" }],
  properties: [{ id: "eats", name: "eats", domain: "Animal", range: "Food" }],
  entities: [{ id: "rex", name: "Rex", type: "Dog", attrs: { age: 3, city: "Wien" } }, { id: "bone", name: "Bone", type: "Food" }, { id: "rock", description: "just a rock" }],
  relations: [{ from: "rex", to: "bone", type: "eats" }, { from: "bone", to: "rex", type: "eats" }, { from: "rock", to: "rex" }],
})

const mount = (d = ZOO, options: Partial<Parameters<typeof mount2d>[3]> = {}) => {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const handle = mount2d(host, d, d.layer, { palette: palette("light"), width: 600, height: 400, labelBudget: 20, ...options })
  return { host, handle }
}
const node = (host: HTMLElement, id: string) => host.querySelector<SVGElement>(`[data-graph-item="${id}"]`)!
const fire = (el: Element, type: string, init: Record<string, unknown> = {}) => el.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), init))

describe("mount2d", () => {
  it("draws the svg into the host", () => {
    const { host, handle } = mount()
    expect(host.querySelector("svg[data-graph-layer='instances']")).not.toBeNull()
    expect(host.querySelectorAll("[data-graph-node]")).toHaveLength(3)
    handle.destroy()
    expect(host.querySelector("svg")).toBeNull()
  })

  it("highlights an entity and its neighbours on hover, and shows a tooltip with its facts", () => {
    const { host } = mount()
    fire(node(host, "rex"), "pointerover")
    expect(host.querySelector("svg")!.getAttribute("data-graph-active")).toBe("rex")
    expect(node(host, "rex").hasAttribute("data-active")).toBe(true)
    expect(node(host, "bone").hasAttribute("data-neighbour")).toBe(true)
    expect(node(host, "rock").hasAttribute("data-neighbour")).toBe(true)
    const tip = host.querySelector<HTMLElement>("[data-aigui-graph-tip]")!
    expect(tip.hidden).toBe(false)
    expect(tip.textContent).toContain("Rex")
    expect(tip.textContent).toContain("Dog")
    expect(tip.textContent).toContain("age")
    expect(tip.textContent).toContain("3")
    expect(tip.textContent).toContain("Wien")
    expect(tip.textContent).toContain("man's best friend")
    fire(node(host, "rex"), "pointerout")
    expect(tip.hidden).toBe(true)
    expect(host.querySelector("svg")!.hasAttribute("data-graph-active")).toBe(false)
    expect(node(host, "bone").hasAttribute("data-neighbour")).toBe(false)
  })

  it("dims edges that do not touch the hovered entity and names the ones that do", () => {
    const { host } = mount()
    fire(node(host, "rock"), "pointerover")
    const edges = host.querySelectorAll<SVGElement>("[data-graph-edge]")
    expect(edges[2].hasAttribute("data-neighbour")).toBe(true)
    expect(edges[0].hasAttribute("data-neighbour")).toBe(false)
  })

  it("shows a class's description and its parents on the ontology layer", () => {
    const host = document.createElement("div")
    const handle = mount2d(host, ZOO, "ontology", { palette: palette("light"), width: 600, height: 400, labelBudget: 20 })
    fire(host.querySelector('[data-graph-item="Dog"]')!, "pointerover")
    const tip = host.querySelector<HTMLElement>("[data-aigui-graph-tip]")!
    expect(tip.textContent).toContain("man's best friend")
    expect(tip.textContent).toContain("Animal")
    handle.destroy()
  })

  it("zooms with the wheel and pans with a drag, and comes back on double click", () => {
    const { host } = mount()
    const svg = host.querySelector("svg")!
    expect(svg.getAttribute("viewBox")).toBe("0 0 600 400")
    fire(svg, "wheel", { deltaY: -100, clientX: 0, clientY: 0 })
    const zoomed = svg.getAttribute("viewBox")!.split(" ").map(Number)
    expect(zoomed[2]).toBeLessThan(600)
    fire(svg, "pointerdown", { clientX: 10, clientY: 10, button: 0 })
    fire(svg, "pointermove", { clientX: 40, clientY: 30 })
    fire(svg, "pointerup", { clientX: 40, clientY: 30 })
    const panned = svg.getAttribute("viewBox")!.split(" ").map(Number)
    expect(panned[0]).not.toBe(zoomed[0])
    fire(svg, "dblclick")
    expect(svg.getAttribute("viewBox")).toBe("0 0 600 400")
  })

  it("reports a click on an entity to the host, but not a click that was a drag", () => {
    const onEntityClick = vi.fn()
    const { host } = mount(ZOO, { onEntityClick })
    fire(node(host, "rex"), "pointerdown", { clientX: 5, clientY: 5, button: 0 })
    fire(node(host, "rex"), "pointerup", { clientX: 5, clientY: 5 })
    fire(node(host, "rex"), "click")
    expect(onEntityClick).toHaveBeenCalledWith(expect.objectContaining({ id: "rex", name: "Rex" }))
    const svg = host.querySelector("svg")!
    fire(svg, "pointerdown", { clientX: 0, clientY: 0, button: 0 })
    fire(svg, "pointermove", { clientX: 50, clientY: 50 })
    fire(svg, "pointerup", { clientX: 50, clientY: 50 })
    fire(node(host, "bone"), "click")
    expect(onEntityClick).toHaveBeenCalledTimes(1)
  })

  it("stops listening once destroyed", () => {
    const { host, handle } = mount()
    const rex = node(host, "rex")
    handle.destroy()
    handle.destroy()
    fire(rex, "pointerover")
    expect(host.querySelector("[data-aigui-graph-tip]")).toBeNull()
  })
})
