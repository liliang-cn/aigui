import { describe, expect, it } from "vitest"
import { palette } from "./palette"
import { spacedItems, timelineHeight, timelineOption, timelineWindow, TIMELINE_LABELS } from "./timeline"
import type { TimelinePanel } from "./types"

const dark = palette({ theme: "dark" })

const PANEL: TimelinePanel = {
  kind: "timeline",
  lanes: [
    { id: "reuters", name: "Reuters" },
    { id: "tass", name: "TASS" },
    { id: "ap", name: "AP", color: "#ff00ff" },
  ],
  items: [
    { id: "c1", lane: "reuters", at: "2026-09-01T08:00:00Z", label: "Convoy crossed at dawn", detail: "Two sources on the ground.", url: "https://example.com/a", value: 3 },
    { id: "c2", lane: "tass", at: "2026-09-01T09:30:00Z", label: "No convoy crossed" },
    { id: "c3", lane: "ap", at: "2026-09-01T11:00:00Z", label: "Crossing confirmed by satellite" },
    { id: "c4", lane: "reuters", at: "2026-09-01T14:00:00Z", label: "Second convoy" },
  ],
  links: [
    { from: "c1", to: "c2", kind: "contradicts" },
    { from: "c1", to: "c4", kind: "follows" },
    { from: "c1", to: "c3", kind: "same" },
  ],
}

const at = (iso: string) => Date.parse(iso)

describe("timelineWindow", () => {
  it("takes the items' own range with 5% on each side", () => {
    const [from, to] = timelineWindow(PANEL)
    const span = at("2026-09-01T14:00:00Z") - at("2026-09-01T08:00:00Z")
    expect(from).toBe(at("2026-09-01T08:00:00Z") - span * 0.05)
    expect(to).toBe(at("2026-09-01T14:00:00Z") + span * 0.05)
  })
  it("uses the panel's own window when it has one", () => {
    const [from, to] = timelineWindow({ ...PANEL, from: "2026-08-31T00:00:00Z", to: "2026-09-02T00:00:00Z" })
    expect(from).toBe(at("2026-08-31T00:00:00Z"))
    expect(to).toBe(at("2026-09-02T00:00:00Z"))
  })
  it("still gives a single item a window with width", () => {
    const [from, to] = timelineWindow({ ...PANEL, items: [PANEL.items[0]] })
    expect(to).toBeGreaterThan(from)
  })
})

describe("spacedItems", () => {
  it("labels the ones with room around them, not the first ones written", () => {
    // Four claims in one lane: three crowded into a minute, the fourth an hour away. The one with
    // an hour of empty space around it is the one whose label can be read; the three in the pile
    // are equally cramped, so the first of them wins the tie and the other two go to the tooltip.
    const crowded: TimelinePanel = {
      ...PANEL,
      items: [
        { id: "a", lane: "reuters", at: "2026-09-01T08:00:00Z", label: "a" },
        { id: "b", lane: "reuters", at: "2026-09-01T08:00:20Z", label: "b" },
        { id: "c", lane: "reuters", at: "2026-09-01T08:00:40Z", label: "c" },
        { id: "d", lane: "reuters", at: "2026-09-01T09:00:00Z", label: "d" },
      ],
      links: [],
    }
    expect([...spacedItems(crowded, 2)].sort()).toEqual([0, 3])
  })
  it("never writes more than it was asked for, and defaults to twelve", () => {
    const many: TimelinePanel = {
      ...PANEL,
      links: [],
      items: Array.from({ length: 40 }, (_, i) => ({ lane: "reuters", at: new Date(Date.UTC(2026, 8, 1, i)).toISOString(), label: `item ${i}` })),
    }
    expect(spacedItems(many, TIMELINE_LABELS).size).toBe(12)
    expect(TIMELINE_LABELS).toBe(12)
  })
})

describe("timelineHeight", () => {
  it("is 320 until the lanes need more, then 28 pixels a lane", () => {
    expect(timelineHeight(3)).toBe(320)
    expect(timelineHeight(24)).toBeGreaterThanOrEqual(24 * 28)
    expect(timelineHeight(24)).toBeGreaterThan(timelineHeight(12))
  })
})

describe("timelineOption", () => {
  const option = timelineOption(PANEL, dark, true) as Record<string, any>

  it("puts time across and the lanes down the side, in the order they were given", () => {
    expect(option.xAxis.type).toBe("time")
    expect(option.yAxis.type).toBe("category")
    expect(option.yAxis.data).toEqual(["Reuters", "TASS", "AP"])
    // A category axis counts up from the bottom; a reader counts down from the top.
    expect(option.yAxis.inverse).toBe(true)
    const [from, to] = timelineWindow(PANEL)
    expect(option.xAxis.min).toBe(from)
    expect(option.xAxis.max).toBe(to)
  })

  it("draws one scatter series per lane plus one series of links", () => {
    expect(option.series).toHaveLength(4)
    expect(option.series.slice(0, 3).map((s: any) => s.type)).toEqual(["scatter", "scatter", "scatter"])
    expect(option.series.map((s: any) => s.name)).toEqual(["Reuters", "TASS", "AP", "links"])
    expect(option.series[3].type).toBe("lines")
    expect(option.series[3].coordinateSystem).toBe("cartesian2d")
  })

  it("colours a lane from the palette unless the lane named its own", () => {
    expect(option.series[0].itemStyle.color).toBe(dark.series[0])
    expect(option.series[1].itemStyle.color).toBe(dark.series[1])
    expect(option.series[2].itemStyle.color).toBe("#ff00ff")
  })

  it("places each point at its time on its lane and keeps the item for the click", () => {
    expect(option.series[0].data).toHaveLength(2)
    expect(option.series[0].data[0].value.slice(0, 2)).toEqual([at("2026-09-01T08:00:00Z"), "Reuters"])
    expect(option.series[0].data[0].item).toBe(PANEL.items[0])
    expect(option.series[1].data[0].value[1]).toBe("TASS")
  })

  it("sizes a point by its value and gives the rest the default", () => {
    const size = option.series[0].symbolSize as (v: unknown[]) => number
    expect(size([0, "Reuters", 0])).toBe(12)
    expect(size([0, "Reuters", 3])).toBeGreaterThan(12)
  })

  it("writes a label beside the points with room and leaves the rest to the tooltip", () => {
    const shown = option.series.slice(0, 3).flatMap((s: any) => s.data).filter((d: any) => d.label?.show)
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.length).toBeLessThanOrEqual(TIMELINE_LABELS)
    expect(option.tooltip.trigger).toBe("item")
  })

  it("draws a contradiction in danger red, a follow in muted with an arrow, and a same as dots", () => {
    const links = option.series[3].data as any[]
    expect(links).toHaveLength(3)
    expect(links[0].coords).toEqual([
      [at("2026-09-01T08:00:00Z"), "Reuters"],
      [at("2026-09-01T09:30:00Z"), "TASS"],
    ])
    expect(links[0].lineStyle.color).toBe(dark.bad)
    expect(links[0].symbol).toEqual(["none", "none"])
    expect(links[1].lineStyle.color).toBe(dark.muted)
    expect(links[1].symbol).toEqual(["none", "arrow"])
    expect(links[2].lineStyle.type).toBe("dotted")
  })

  it("treats an untyped link as a follow", () => {
    const untyped = timelineOption({ ...PANEL, links: [{ from: "c1", to: "c4" }] }, dark, true) as Record<string, any>
    expect(untyped.series[3].data[0].symbol).toEqual(["none", "arrow"])
  })

  it("leaves the links series out when there are none, and still draws every lane", () => {
    const bare = timelineOption({ ...PANEL, links: [] }, dark, true) as Record<string, any>
    expect(bare.series).toHaveLength(3)
  })

  it("draws the final state when the host turned animation off", () => {
    const still = timelineOption(PANEL, dark, false) as Record<string, any>
    expect(still.animation).toBe(false)
    expect(option.animation).toBe(true)
  })
})

describe("a label that would run off the panel", () => {
  it("is written back into the chart instead of over the edge", () => {
    // `containLabel` reserves room for axis labels, not for series ones, so a claim near the end
    // of the window had its label clipped by the panel border.
    const option = timelineOption(PANEL, dark, false) as Record<string, any>
    const sides = option.series
      .slice(0, 3)
      .flatMap((s: any) => s.data)
      .map((d: any) => [d.name, d.label.position])
    expect(Object.fromEntries(sides)).toMatchObject({
      "Convoy crossed at dawn": "right",
      "Second convoy": "left",
    })
  })
})
