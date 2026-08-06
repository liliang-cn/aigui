import { autoView, compileCurves, derivativeCurve, initialScope, polylines, riemann, sample, tangent, at, type Curve } from "./plot"
import type { FunctionDefinition, FunctionOptions, Viewport } from "./types"

/**
 * Colours for a figure that has to read on whichever page it lands on.
 *
 * A figure drawn for a light page is close to invisible on a dark one, and a plot is mostly thin
 * lines — there is nothing else for the eye to fall back on.
 */
function palette(theme?: string) {
  return theme === "dark"
    ? { axis: "#52525b", grid: "#3f3f46", text: "#d4d4d8", curves: ["#38bdf8", "#f472b6", "#a3e635", "#fbbf24"], accent: "#f59e0b", fill: "#38bdf8" }
    : { axis: "#a1a1aa", grid: "#e4e4e7", text: "#3f3f46", curves: ["#0369a1", "#be185d", "#4d7c0f", "#b45309"], accent: "#b45309", fill: "#0369a1" }
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const round = (n: number): number => Math.round(n * 100) / 100

/** Nice round tick positions covering a range, at most `count` of them. */
function ticks(from: number, to: number, count: number): number[] {
  const raw = (to - from) / count
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10
  const out: number[] = []
  for (let value = Math.ceil(from / step) * step; value <= to + step / 1000; value += step) {
    out.push(Math.abs(value) < step / 1000 ? 0 : value)
  }
  return out
}

const label = (value: number): string => {
  const text = Math.abs(value) < 1e-9 ? "0" : String(Math.round(value * 1000) / 1000)
  return text
}

interface Frame {
  width: number
  height: number
  pad: { left: number; right: number; top: number; bottom: number }
  view: Viewport
}

const toX = (frame: Frame, x: number): number =>
  frame.pad.left + ((x - frame.view.x[0]) / (frame.view.x[1] - frame.view.x[0])) * (frame.width - frame.pad.left - frame.pad.right)

const toY = (frame: Frame, y: number): number =>
  frame.height - frame.pad.bottom - ((y - frame.view.y[0]) / (frame.view.y[1] - frame.view.y[0])) * (frame.height - frame.pad.top - frame.pad.bottom)

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value))

/** Render one definition to a standalone SVG string. */
export function renderFunctionSVG(definition: FunctionDefinition, options: FunctionOptions = {}, theme?: string, scope?: Record<string, number>): string {
  const width = options.width ?? 640
  const height = options.height ?? 380
  const samples = options.samples ?? 480
  const colours = palette(theme)

  const names = (definition.params ?? []).map((p) => p.id)
  const values = scope ?? initialScope(definition)
  const fallbackX: [number, number] = definition.view?.x
    ? [at(definition.view.x[0], 0, names, values), at(definition.view.x[1], 0, names, values)]
    : [-5, 5]
  const curves = compileCurves(definition, fallbackX, values)
  // The window is fixed by the figure's own view when it has one, so a curve does not jump around
  // as a parameter is dragged; only the curve moves.
  const view = autoView(curves, definition, 200, values)
  const frame: Frame = { width, height, pad: { left: 44, right: 16, top: 16, bottom: 32 }, view }
  const byId = new Map(curves.map((curve) => [curve.id, curve]))

  const parts: string[] = []
  const plotLeft = frame.pad.left
  const plotRight = width - frame.pad.right
  const plotTop = frame.pad.top
  const plotBottom = height - frame.pad.bottom

  // Grid and axes first, so every curve is drawn over them.
  for (const x of ticks(view.x[0], view.x[1], 8)) {
    const px = round(toX(frame, x))
    parts.push(`<line x1="${px}" y1="${plotTop}" x2="${px}" y2="${plotBottom}" stroke="${colours.grid}" stroke-width="1"/>`)
    parts.push(`<text x="${px}" y="${plotBottom + 16}" fill="${colours.text}" font-size="11" text-anchor="middle">${label(x)}</text>`)
  }
  for (const y of ticks(view.y[0], view.y[1], 6)) {
    const py = round(toY(frame, y))
    parts.push(`<line x1="${plotLeft}" y1="${py}" x2="${plotRight}" y2="${py}" stroke="${colours.grid}" stroke-width="1"/>`)
    parts.push(`<text x="${plotLeft - 6}" y="${py + 4}" fill="${colours.text}" font-size="11" text-anchor="end">${label(y)}</text>`)
  }
  if (view.y[0] < 0 && view.y[1] > 0) {
    const py = round(toY(frame, 0))
    parts.push(`<line x1="${plotLeft}" y1="${py}" x2="${plotRight}" y2="${py}" stroke="${colours.axis}" stroke-width="1.5"/>`)
  }
  if (view.x[0] < 0 && view.x[1] > 0) {
    const px = round(toX(frame, 0))
    parts.push(`<line x1="${px}" y1="${plotTop}" x2="${px}" y2="${plotBottom}" stroke="${colours.axis}" stroke-width="1.5"/>`)
  }

  const drawCurve = (curve: Curve, colour: string, dashed = false): void => {
    for (const line of polylines(sample(curve, samples), view)) {
      const points = line
        .filter((point) => point.y > view.y[0] - (view.y[1] - view.y[0]) && point.y < view.y[1] + (view.y[1] - view.y[0]))
        .map((point) => `${round(toX(frame, point.x))},${round(clamp(toY(frame, point.y), plotTop - 40, plotBottom + 40))}`)
      if (points.length > 1) {
        parts.push(`<polyline points="${points.join(" ")}" fill="none" stroke="${colour}" stroke-width="2" stroke-linejoin="round"${dashed ? ' stroke-dasharray="6 4"' : ""}/>`)
      }
    }
  }

  // Areas and rectangles go under the curves, so a filled region never hides the graph bounding it.
  for (const mark of definition.marks ?? []) {
    if ("area" in mark) {
      const from = at(mark.area.from, 0, names, values)
      const to = at(mark.area.to, 0, names, values)
      const upper = mark.area.between ? byId.get(mark.area.between[0]) : byId.get(mark.area.of!)
      const lower = mark.area.between ? byId.get(mark.area.between[1]) : undefined
      if (!upper) continue
      const steps = 160
      const top: string[] = []
      const bottom: string[] = []
      for (let i = 0; i <= steps; i++) {
        const x = from + ((to - from) * i) / steps
        const yTop = upper.fn(x)
        const yBottom = lower ? lower.fn(x) : 0
        if (!Number.isFinite(yTop) || !Number.isFinite(yBottom)) continue
        top.push(`${round(toX(frame, x))},${round(toY(frame, yTop))}`)
        bottom.unshift(`${round(toX(frame, x))},${round(toY(frame, yBottom))}`)
      }
      if (top.length > 1) {
        parts.push(`<polygon points="${[...top, ...bottom].join(" ")}" fill="${colours.fill}" fill-opacity="0.18" stroke="none"/>`)
      }
    } else if ("riemann" in mark) {
      const curve = byId.get(mark.riemann.of)
      if (!curve) continue
      const { rects } = riemann(curve, at(mark.riemann.from, 0, names, values), at(mark.riemann.to, 0, names, values), mark.riemann.n, mark.riemann.rule ?? "left")
      for (const rect of rects) {
        const x1 = toX(frame, rect.x)
        const x2 = toX(frame, rect.x + rect.width)
        const yTop = toY(frame, Math.max(rect.y, 0))
        const yZero = toY(frame, Math.min(rect.y, 0))
        parts.push(
          `<rect x="${round(Math.min(x1, x2))}" y="${round(yTop)}" width="${round(Math.abs(x2 - x1))}" height="${round(Math.abs(yZero - yTop))}" fill="${colours.fill}" fill-opacity="0.16" stroke="${colours.fill}" stroke-width="1"/>`,
        )
      }
    } else if ("asymptote" in mark) {
      if (typeof mark.asymptote.x === "number") {
        const px = round(toX(frame, mark.asymptote.x))
        parts.push(`<line x1="${px}" y1="${plotTop}" x2="${px}" y2="${plotBottom}" stroke="${colours.accent}" stroke-width="1.5" stroke-dasharray="5 5"/>`)
      } else if (typeof mark.asymptote.y === "number") {
        const py = round(toY(frame, mark.asymptote.y))
        parts.push(`<line x1="${plotLeft}" y1="${py}" x2="${plotRight}" y2="${py}" stroke="${colours.accent}" stroke-width="1.5" stroke-dasharray="5 5"/>`)
      }
    }
  }

  curves.forEach((curve, index) => drawCurve(curve, colours.curves[index % colours.curves.length]))

  // Derivatives and tangents last: they are the point of the figure when present.
  const legend: Array<{ text: string; colour: string; dashed: boolean }> = curves.map((curve, index) => ({
    text: curve.label ?? curve.id,
    colour: colours.curves[index % colours.curves.length],
    dashed: false,
  }))

  for (const mark of definition.marks ?? []) {
    if ("derivative" in mark) {
      const curve = byId.get(mark.derivative.of)
      if (!curve) continue
      const colour = colours.curves[(curves.length + legend.length) % colours.curves.length]
      drawCurve(derivativeCurve(curve), colour, true)
      legend.push({ text: mark.derivative.label ?? `${curve.label ?? curve.id}'`, colour, dashed: true })
    } else if ("tangent" in mark) {
      const curve = byId.get(mark.tangent.of)
      if (!curve) continue
      const line = tangent(curve, at(mark.tangent.at, 0, names, values), view)
      if (!line) continue
      parts.push(
        `<line x1="${round(toX(frame, line.from.x))}" y1="${round(toY(frame, line.from.y))}" x2="${round(toX(frame, line.to.x))}" y2="${round(toY(frame, line.to.y))}" stroke="${colours.accent}" stroke-width="2"/>`,
      )
      // The slope is measured here, so the label cannot disagree with the line above it.
      const px = round(toX(frame, line.x0))
      const py = round(toY(frame, line.y0))
      parts.push(`<text x="${px + 8}" y="${py - 8}" fill="${colours.accent}" font-size="12">k = ${label(Math.round(line.slope * 1000) / 1000)}</text>`)
    } else if ("point" in mark) {
      const curve = byId.get(mark.point.on)
      if (!curve) continue
      const x = at(mark.point.at, 0, names, values)
      const y = curve.fn(x)
      if (!Number.isFinite(y)) continue
      const px = round(toX(frame, x))
      const py = round(toY(frame, y))
      parts.push(`<circle cx="${px}" cy="${py}" r="3.5" fill="${colours.accent}"/>`)
      if (mark.point.label) {
        parts.push(`<text x="${px + 7}" y="${py - 7}" fill="${colours.text}" font-size="12">${escapeHtml(mark.point.label)}</text>`)
      }
    }
  }

  legend.forEach((entry, index) => {
    const y = plotTop + 14 + index * 16
    const x = plotRight - 10
    parts.push(`<line x1="${x - 22}" y1="${y - 4}" x2="${x - 4}" y2="${y - 4}" stroke="${entry.colour}" stroke-width="2"${entry.dashed ? ' stroke-dasharray="6 4"' : ""}/>`)
    parts.push(`<text x="${x - 28}" y="${y}" fill="${colours.text}" font-size="12" text-anchor="end">${escapeHtml(entry.text)}</text>`)
  })

  const described = definition.caption ?? definition.plot.map((curve) => curve.label ?? curve.expr).join(", ")
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"`,
    ` role="img" aria-label="${escapeHtml(described)}" data-aigui-function>`,
    parts.join(""),
    "</svg>",
  ].join("")
}
