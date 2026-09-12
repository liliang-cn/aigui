// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { typeColour } from "./graph3d"
import { mountScreen, openTimelineItem } from "./mount"
import { palette } from "./palette"
import type { Graph3dPanel, ScreenDefinition, TimelineItem } from "./types"

const dark = palette({ theme: "dark" })

const ITEM: TimelineItem = { id: "c1", lane: "reuters", at: "2026-09-01T08:00:00Z", label: "Convoy crossed", url: "https://example.com/a" }

const GRAPH: Graph3dPanel = {
  kind: "graph3d",
  title: "Entities",
  nodes: [
    { id: "a", name: "Kyiv", type: "place" },
    { id: "b", name: "Reuters", type: "outlet" },
  ],
  edges: [{ from: "b", to: "a", type: "reported" }],
}

const screen = (panels: unknown[]): ScreenDefinition => ({ theme: "dark", columns: 12, panels: panels as ScreenDefinition["panels"] })

describe("openTimelineItem", () => {
  it("opens the claim's own page, with the opener cut off", () => {
    const open = vi.fn()
    vi.stubGlobal("open", open)
    openTimelineItem(ITEM)
    expect(open).toHaveBeenCalledWith("https://example.com/a", "_blank", "noopener,noreferrer")
    vi.unstubAllGlobals()
  })
  it("gives the click to the host instead, url and all", () => {
    // A host that has its own idea of what a claim is — a drawer, a route — must not also get a
    // tab it never asked for.
    const open = vi.fn()
    vi.stubGlobal("open", open)
    const onItemClick = vi.fn()
    openTimelineItem(ITEM, { onItemClick })
    expect(onItemClick).toHaveBeenCalledWith(ITEM)
    expect(open).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
  it("does nothing at all for an item with neither", () => {
    const open = vi.fn()
    vi.stubGlobal("open", open)
    openTimelineItem({ ...ITEM, url: undefined })
    expect(open).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe("a graph3d panel's legend", () => {
  it("names the types over the canvas, one row each, in their own colours", () => {
    const host = document.createElement("div")
    const destroy = mountScreen(host, screen([GRAPH]), false)
    const rows = host.querySelectorAll(".aigui-bs-graph-legend-row")
    expect(rows).toHaveLength(3)
    expect([...rows].map((r) => r.textContent)).toEqual(["place", "outlet", "reported"])
    // A dot for an entity type, a line for an edge type — which is also what keeps the panel
    // readable when a node type and an edge type hash onto the same colour.
    expect(host.querySelectorAll(".aigui-bs-graph-legend-dot")).toHaveLength(2)
    expect(host.querySelectorAll(".aigui-bs-graph-legend-line")).toHaveLength(1)
    // Through the same style property, because the DOM writes a hex back out as `rgb(...)`.
    const asSet = (hex: string): string => {
      const probe = document.createElement("i")
      probe.style.background = hex
      return probe.style.background
    }
    const colours = [...host.querySelectorAll<HTMLElement>(".aigui-bs-graph-legend-row i")].map((s) => s.style.background)
    expect(colours).toEqual([typeColour("place", dark), typeColour("outlet", dark), typeColour("reported", dark)].map(asSet))
    destroy()
  })
  it("draws no legend at all when nothing is typed", () => {
    const host = document.createElement("div")
    const destroy = mountScreen(host, screen([{ kind: "graph3d", nodes: [{ id: "a", name: "A" }], edges: [] }]), false)
    expect(host.querySelector(".aigui-bs-graph-legend")).toBeNull()
    destroy()
  })
})

describe("a timeline panel's height", () => {
  it("grows with the lanes rather than squeezing them", () => {
    const lanes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `l${i}`, name: `l${i}` }))
    // Torn down at once: ECharts initialises on the next frame, which lands after the test has
    // finished and the host is gone.
    const height = (count: number): string => {
      const host = document.createElement("div")
      const destroy = mountScreen(host, screen([{ kind: "timeline", lanes: lanes(count), items: [{ lane: "l0", at: "2026-09-01T08:00:00Z", label: "x" }] }]), false)
      const body = host.querySelector(".aigui-bs-panel-body") as HTMLElement
      const value = body.style.height
      destroy()
      return value
    }
    expect(height(3)).toBe("320px")
    expect(Number.parseInt(height(20), 10)).toBeGreaterThan(320)
  })
})

/**
 * A screen is sized for a wall by default, and that is the right default for the surface it was
 * built for. It is the wrong one for a panel embedded in a page: the fence says a globe is 560
 * pixels, the card it was put in is under 300, and the panel drew at full size straight over the
 * stories beside it. Nothing in the screen ever consulted the box.
 *
 * `fit` hands that decision to the host, and these pin the two halves of it.
 */
describe("a fitted screen", () => {
  // Read before tearing down: a destroyed screen has no body to ask, and the globe's renderer
  // initialises on a frame that lands after the test is over.
  const read = (fit: boolean, height?: number): { height: string; fitted: boolean } => {
    const host = document.createElement("div")
    const destroy = mountScreen(
      host,
      screen([{ kind: "globe", height, points: [{ lat: 1, lon: 2, label: "x" }] }]),
      false,
      undefined,
      undefined,
      fit,
    )
    const body = host.querySelector(".aigui-bs-panel-body") as HTMLElement
    const out = { height: body.style.height, fitted: host.classList.contains("aigui-bs-fit") }
    destroy()
    return out
  }

  it("sets no pixel height on a body, so the box it was given decides", () => {
    expect(read(true).height).toBe("")
  })

  it("still obeys the fence when the host does not ask to fit", () => {
    expect(read(false, 560).height).toBe("560px")
    expect(read(false).height).toBe("300px")
  })

  it("marks the host so the stylesheet can make it a column that fills", () => {
    expect(read(true).fitted).toBe(true)
    expect(read(false).fitted).toBe(false)
  })

  // An inline height beats a stylesheet, which is exactly how the fence's number used to win over
  // the card. The fix has to be not setting it, never overriding it.
  it("ignores a height the fence asked for", () => {
    expect(read(true, 900).height).toBe("")
  })
})
