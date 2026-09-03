import type { EChartsCoreOption } from "echarts/core"
import { FONT } from "./options"
import { withAlpha, type Palette } from "./palette"
import type { TimelineItem, TimelinePanel } from "./types"

/**
 * A timeline of claims, one lane per source.
 *
 * The panel exists for the line nobody else draws: two outlets said things that cannot both be
 * true, and the red segment between their two points is the whole point of the picture. So the
 * lanes stay in the order they were given (a reader compares row against row, and a chart that
 * reorders them silently answers a different question), time runs across, and every claim is one
 * point that can be clicked back to the page it came from.
 *
 * Pure: the option is a function of the panel and the palette, so it can be tested without a
 * canvas and so the same claims draw the same picture on every screen.
 */

/** How many claims carry a written label; the rest are on the tooltip. */
export const TIMELINE_LABELS = 12

/** The default point, in pixels, for a claim with no `value`. */
const DEFAULT_SYMBOL = 12

const HOUR = 60 * 60 * 1000

/** How far into the window a claim has to be before its label is written on the other side. */
const LABEL_FLIPS_AT = 0.62

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/**
 * The window drawn, in epoch milliseconds.
 *
 * The panel's own `from` and `to` win where they are given. Otherwise it is the claims' own range
 * with 5% on each side, because a point exactly on the axis reads as clipped rather than as first.
 * A single claim has no range to take a fraction of, so it gets an hour either way — enough for
 * the point to sit somewhere rather than in the middle of nothing.
 */
export function timelineWindow(panel: TimelinePanel): [number, number] {
  const times = panel.items.map((item) => Date.parse(item.at))
  const low = panel.from === undefined ? undefined : Date.parse(panel.from)
  const high = panel.to === undefined ? undefined : Date.parse(panel.to)
  if (low !== undefined && high !== undefined) return [low, high]
  const min = Math.min(...times)
  const max = Math.max(...times)
  const pad = (max - min) * 0.05 || HOUR
  return [low ?? min - pad, high ?? max + pad]
}

/**
 * Which claims have room for a label, as indexes into `panel.items`.
 *
 * A label is drawn beside its point, on its own lane, so what decides whether it can be read is
 * the empty time on either side of it within that lane — not how important the claim is and not
 * what order it was written in. Twelve labels on a wall panel is about where a reader stops
 * reading them anyway, and the rest are one hover away.
 */
export function spacedItems(panel: TimelinePanel, max = TIMELINE_LABELS): Set<number> {
  const byLane = new Map<string, Array<{ index: number; at: number }>>()
  panel.items.forEach((item, index) => {
    const lane = byLane.get(item.lane) ?? []
    lane.push({ index, at: Date.parse(item.at) })
    byLane.set(item.lane, lane)
  })
  const room = new Map<number, number>()
  for (const lane of byLane.values()) {
    const sorted = [...lane].sort((a, b) => a.at - b.at)
    sorted.forEach((entry, i) => {
      const before = i > 0 ? entry.at - sorted[i - 1].at : Number.POSITIVE_INFINITY
      const after = i < sorted.length - 1 ? sorted[i + 1].at - entry.at : Number.POSITIVE_INFINITY
      room.set(entry.index, Math.min(before, after))
    })
  }
  return new Set(
    [...room.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, max)
      .map(([index]) => index),
  )
}

/**
 * How tall a timeline of this many lanes has to be.
 *
 * 320 is the default panel, and it holds a handful of lanes comfortably. Past that the lanes get
 * a floor of 28 pixels each: below that the points of two neighbouring outlets touch, and a
 * contradiction drawn between them stops being a line between two rows.
 */
export function timelineHeight(lanes: number): number {
  return Math.min(900, Math.max(320, 60 + lanes * 28))
}

/** How a link of each kind is drawn. `follows` is what an untyped link gets. */
const LINK_KINDS = {
  contradicts: { danger: true, dotted: false, arrow: false, width: 2, opacity: 0.95 },
  follows: { danger: false, dotted: false, arrow: true, width: 1.4, opacity: 0.6 },
  same: { danger: false, dotted: true, arrow: false, width: 1.4, opacity: 0.6 },
} as const

/** When a claim was made, written the way a wall is read: minutes, UTC, no locale surprises. */
function when(at: number): string {
  return `${new Date(at).toISOString().slice(0, 16).replace("T", " ")} UTC`
}

export function timelineOption(panel: TimelinePanel, c: Palette, animate: boolean): EChartsCoreOption {
  const [from, to] = timelineWindow(panel)
  const laneName = new Map(panel.lanes.map((lane) => [lane.id, lane.name]))
  const labelled = spacedItems(panel)
  const maxValue = Math.max(0, ...panel.items.map((item) => item.value ?? 0))
  // The size rides in a third slot because a scatter on a category axis has only two coordinates,
  // and `symbolSize` is handed the whole value array.
  const symbolSize = (value: unknown[]): number => {
    const raw = typeof value[2] === "number" ? value[2] : 0
    return raw > 0 && maxValue > 0 ? 8 + 12 * Math.sqrt(raw / maxValue) : DEFAULT_SYMBOL
  }

  const series: Array<Record<string, unknown>> = panel.lanes.map((lane, laneIndex) => {
    const colour = lane.color ?? c.series[laneIndex % c.series.length]
    const data = panel.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.lane === lane.id)
      .map(({ item, index }) => {
        const at = Date.parse(item.at)
        return {
          name: item.label,
          value: [at, lane.name, item.value ?? 0],
          // The claim itself, so a click can hand the host the thing the model wrote rather than
          // the coordinates ECharts turned it into.
          item,
          // A label to the right of a point in the last third of the window runs off the panel —
          // `containLabel` reserves room for axis labels, not for series ones — so those flip and
          // are written back into the chart instead.
          label: { show: labelled.has(index), position: (at - from) / (to - from) > LABEL_FLIPS_AT ? "left" : "right" },
        }
      })
    return {
      name: lane.name,
      type: "scatter",
      symbolSize,
      itemStyle: { color: colour, borderColor: withAlpha(colour, 0.35), borderWidth: 4 },
      label: { show: false, position: "right", distance: 8, color: c.text, fontSize: 11, fontFamily: FONT, formatter: "{b}" },
      emphasis: { scale: 1.35, label: { show: true } },
      animationDelay: (index: number) => index * 30,
      data,
    }
  })

  const byId = new Map(panel.items.filter((item) => item.id !== undefined).map((item) => [item.id as string, item]))
  const coord = (id: string): [number, string] | undefined => {
    const item = byId.get(id)
    const name = item && laneName.get(item.lane)
    return item && name !== undefined ? [Date.parse(item.at), name] : undefined
  }
  const links = (panel.links ?? []).flatMap((link) => {
    const a = coord(link.from)
    const b = coord(link.to)
    if (!a || !b) return []
    const kind = link.kind ?? "follows"
    const style = LINK_KINDS[kind]
    return [
      {
        coords: [a, b],
        name: kind,
        symbol: style.arrow ? ["none", "arrow"] : ["none", "none"],
        symbolSize: 7,
        lineStyle: {
          color: style.danger ? c.bad : c.muted,
          width: style.width,
          type: style.dotted ? "dotted" : "solid",
          opacity: style.opacity,
          curveness: 0.15,
        },
      },
    ]
  })
  if (links.length) {
    series.push({
      name: "links",
      type: "lines",
      coordinateSystem: "cartesian2d",
      // Under the points: a claim is the thing being read, the line is the relation between two.
      z: 1,
      polyline: false,
      animationDuration: 1400,
      data: links,
    })
  }

  const axisLine = { lineStyle: { color: c.gridLine } }
  return {
    backgroundColor: "transparent",
    textStyle: { color: c.text, fontFamily: FONT },
    animation: animate,
    animationDuration: 1200,
    animationEasing: "cubicOut",
    grid: { left: 8, right: 28, top: 18, bottom: 24, containLabel: true },
    tooltip: {
      trigger: "item",
      confine: true,
      // Escaped by hand: ECharts renders a formatter's return as HTML, and every string here was
      // written by a model.
      formatter: (params: { seriesName?: string; data?: unknown }) => {
        const data = params.data as { item?: TimelineItem; name?: string } | undefined
        const item = data?.item
        if (!item) return escapeHtml(String(params.seriesName ?? ""))
        const rows = [
          `<span style="opacity:.7">${escapeHtml(params.seriesName ?? "")} · ${when(Date.parse(item.at))}</span>`,
          `<b>${escapeHtml(item.label)}</b>`,
        ]
        if (item.detail) rows.push(`<span style="opacity:.85">${escapeHtml(item.detail)}</span>`)
        return rows.join("<br/>")
      },
    },
    xAxis: {
      type: "time",
      min: from,
      max: to,
      axisLine,
      axisTick: { show: false },
      axisLabel: { color: c.muted, fontFamily: FONT, fontSize: 10, hideOverlap: true },
      splitLine: { show: true, lineStyle: { color: c.gridLine, type: "dashed" } },
    },
    yAxis: {
      type: "category",
      data: panel.lanes.map((lane) => lane.name),
      // A category axis counts up from the bottom; the lanes were written top-down.
      inverse: true,
      axisLine,
      axisTick: { show: false },
      axisLabel: { color: c.text, fontFamily: FONT, fontSize: 11 },
      splitLine: { show: true, lineStyle: { color: c.gridLine } },
      splitArea: { show: true, areaStyle: { color: [withAlpha(c.muted, 0.06), "transparent"] } },
    },
    series,
  }
}
