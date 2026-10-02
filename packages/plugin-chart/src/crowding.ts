const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined ? [] : [value])
const record = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {})

/**
 * Whether an ECharts option holds more than a `width` × `height` chart can show legibly.
 *
 * For charts drawn on a canvas, where a page check cannot read the labels: forty categories on a
 * 400px axis (ECharts silently drops most labels), a pie of slivers, a treemap of crumbs. A chart
 * drawn as SVG does not need this — its labels are in the DOM, and overlaps are measured there.
 */
export function chartCrowding(option: unknown, width: number, height: number): string | undefined {
  if (width <= 0 || height <= 0) return undefined
  const o = record(option)
  const yAxes = asArray(o.yAxis).map(record)
  for (const axis of [...asArray(o.xAxis).map(record), ...yAxes]) {
    const categories = asArray(axis.data).length
    if (categories === 0) continue
    const vertical = yAxes.includes(axis)
    const room = vertical ? height / 18 : width / 34
    if (categories > Math.max(6, room)) return `${categories} categories on a ${Math.round(vertical ? height : width)}px axis — most labels will be skipped; show fewer, or turn the chart so the categories run down`
  }
  for (const series of asArray(o.series).map(record)) {
    const points = asArray(series.data).length
    if (series.type === "pie" && points > 10) return `a pie of ${points} slices — the small ones are unreadable; use a bar chart`
    if (series.type === "treemap" && points > 0 && (width * height) / points < 900) return `${points} treemap tiles in ${Math.round(width)}×${Math.round(height)}px — too small to label; group them`
  }
  return undefined
}
