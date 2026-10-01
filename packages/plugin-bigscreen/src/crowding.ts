import type { Panel } from "./types"

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined ? [] : [value])
const record = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {})

/** Great-circle distance between two [lon, lat] points, in kilometres. */
function kilometres([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const rad = Math.PI / 180
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * Whether a panel holds more than its box can show legibly, and what to do instead.
 *
 * These are the failures that render without an error: forty category labels on a 300px axis
 * (ECharts quietly skips most of them), a pie of twenty slivers, a knowledge graph of eighty dots
 * in a card, an arc between two cities so close it is a speck on the globe. The panel draws; the
 * reader cannot read it. The message names the number and the fix, because it is read by whoever
 * wrote the fence — usually a model, about to try again.
 */
export function crowding(panel: Panel, width: number, height: number): string | undefined {
  if (width <= 0 || height <= 0) return undefined
  switch (panel.kind) {
    case "chart": {
      const option = record(panel.option)
      for (const axis of [...asArray(option.xAxis), ...asArray(option.yAxis)].map(record)) {
        const categories = asArray(axis.data).length
        const vertical = asArray(option.yAxis).map(record).includes(axis)
        const room = vertical ? height / 18 : width / 34
        if (axis.type === "category" || categories > 0) {
          if (categories > Math.max(6, room)) return `${categories} categories on a ${Math.round(vertical ? height : width)}px axis — most labels will be skipped; widen the panel or show the top ones in a rank panel`
        }
      }
      for (const series of asArray(option.series).map(record)) {
        const points = asArray(series.data).length
        if (series.type === "pie" && points > 10) return `a pie of ${points} slices — the small ones are unreadable; use a rank panel or a bar chart`
        if (series.type === "treemap" && points > 0 && (width * height) / points < 900) return `${points} treemap tiles in ${Math.round(width)}×${Math.round(height)}px — too small to label; group them or give the panel more room`
      }
      return undefined
    }
    case "graph3d": {
      const perNode = (width * height) / Math.max(1, panel.nodes.length)
      if (panel.nodes.length > 60 || perNode < 2500) return `${panel.nodes.length} nodes in ${Math.round(width)}×${Math.round(height)}px — too dense to read; show fewer, or use a rank/treemap for counts`
      return undefined
    }
    case "chart3d":
      if (panel.data.length > 400) return `${panel.data.length} points in a 3D chart — they will blur together; aggregate them or use a 2D chart`
      return undefined
    case "globe": {
      const short = (panel.arcs ?? []).filter((arc) => kilometres(arc.from, arc.to) < 1500).length
      if (short > 0) return `${short} arc${short === 1 ? "" : "s"} shorter than 1500 km — too short to see on a globe; use a map for regional routes`
      return undefined
    }
    case "rank":
      if (width < 200 && panel.items.length > 5) return `${Math.min(panel.items.length, panel.top ?? 8)} ranked bars in ${Math.round(width)}px — names will be cut off; widen the panel`
      return undefined
    default:
      return undefined
  }
}
