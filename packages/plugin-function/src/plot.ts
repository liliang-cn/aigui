import { derivativeAt, evaluateConstant, parseExpression, type CompiledExpression, type Scope } from "./expr"
import type { CurveDef, FunctionDefinition, MarkDef, Viewport } from "./types"

export interface Curve {
  id: string
  label?: string
  fn: CompiledExpression
  domain: [number, number]
}

/** One sampled point, or a gap where the function has no finite value. */
export type Sample = { x: number; y: number } | null

export const at = (value: unknown, fallback = 0, names: readonly string[] = [], scope: Scope = {}): number =>
  evaluateConstant(value, names, scope) ?? fallback

/** Compile the curves a definition declares, in order. */
export function compileCurves(definition: FunctionDefinition, fallbackX: [number, number], scope: Scope = {}): Curve[] {
  const names = (definition.params ?? []).map((p) => p.id)
  return definition.plot.map((curve: CurveDef) => {
    const compiled = parseExpression(curve.expr, names)
    return {
      id: curve.id,
      label: curve.label,
      // Bound to the parameter values of this frame, so everything downstream — sampling, the
      // tangent's slope, the area — works on one consistent set of numbers.
      fn: (x: number) => compiled(x, scope),
      domain: curve.domain ? [at(curve.domain[0], 0, names, scope), at(curve.domain[1], 0, names, scope)] : fallbackX,
    }
  })
}

/** The parameter values a figure starts at. */
export function initialScope(definition: FunctionDefinition): Scope {
  const scope: Scope = {}
  for (const param of definition.params ?? []) scope[param.id] = param.value ?? (param.from + param.to) / 2
  return scope
}

/** Evaluate a curve across its domain, leaving a gap wherever it has no finite value. */
export function sample(curve: Curve, count: number): Sample[] {
  const [from, to] = curve.domain
  const out: Sample[] = []
  for (let i = 0; i <= count; i++) {
    const x = from + ((to - from) * i) / count
    const y = curve.fn(x)
    out.push(Number.isFinite(y) ? { x, y } : null)
  }
  return out
}

/**
 * Split samples into the polylines that should actually be drawn.
 *
 * A gap is obvious, but the harder case is a pole: 1/x is finite either side of zero and the two
 * branches must not be joined, or the figure grows a vertical line that looks like part of the
 * graph. A step that crosses the whole viewport in one sample is that pole.
 */
export function polylines(samples: Sample[], view: Viewport): Array<Array<{ x: number; y: number }>> {
  const height = view.y[1] - view.y[0]
  const lines: Array<Array<{ x: number; y: number }>> = []
  let current: Array<{ x: number; y: number }> = []
  let previous: { x: number; y: number } | null = null
  for (const point of samples) {
    if (!point) {
      if (current.length > 1) lines.push(current)
      current = []
      previous = null
      continue
    }
    const jumped = previous && Math.abs(point.y - previous.y) > height * 1.5 && (point.y - previous.y) * 0 === 0
    if (jumped) {
      if (current.length > 1) lines.push(current)
      current = []
    }
    current.push(point)
    previous = point
  }
  if (current.length > 1) lines.push(current)
  return lines
}

/**
 * Choose a window when the definition does not give one.
 *
 * The y range comes from the middle of the sorted values rather than from their extremes: one pole
 * near the edge of the domain is enough to make a naive min/max flatten every curve on the figure
 * into a horizontal line at zero.
 */
export function autoView(curves: Curve[], definition: FunctionDefinition, count: number, scope: Scope = {}): Viewport {
  const names = (definition.params ?? []).map((p) => p.id)
  const xs = curves.flatMap((curve) => curve.domain)
  const x: [number, number] = definition.view?.x
    ? [at(definition.view.x[0], 0, names, scope), at(definition.view.x[1], 0, names, scope)]
    : [Math.min(...xs), Math.max(...xs)]

  if (definition.view?.y) return { x, y: [at(definition.view.y[0], 0, names, scope), at(definition.view.y[1], 0, names, scope)] }

  const values = curves
    .flatMap((curve) => sample(curve, count))
    .filter((point): point is { x: number; y: number } => point !== null)
    .map((point) => point.y)
    .sort((a, b) => a - b)
  if (values.length === 0) return { x, y: [-1, 1] }
  const low = values[Math.floor(values.length * 0.02)]
  const high = values[Math.floor(values.length * 0.98)]
  const pad = Math.max((high - low) * 0.12, 0.5)
  return { x, y: [Math.min(low - pad, 0 - pad / 4), Math.max(high + pad, 0 + pad / 4)] }
}

export interface TangentLine {
  x0: number
  y0: number
  slope: number
  from: { x: number; y: number }
  to: { x: number; y: number }
}

/** The tangent at a point, with its slope measured rather than taken from the model. */
export function tangent(curve: Curve, x0: number, view: Viewport): TangentLine | undefined {
  const y0 = curve.fn(x0)
  if (!Number.isFinite(y0)) return undefined
  const slope = derivativeAt(curve.fn, x0)
  if (!Number.isFinite(slope)) return undefined
  const line = (x: number) => ({ x, y: y0 + slope * (x - x0) })
  return { x0, y0, slope, from: line(view.x[0]), to: line(view.x[1]) }
}

/** The rectangles of a Riemann sum, and the total they add up to. */
export function riemann(
  curve: Curve,
  from: number,
  to: number,
  n: number,
  rule: "left" | "right" | "mid",
): { rects: Array<{ x: number; width: number; y: number }>; total: number } {
  const width = (to - from) / n
  const rects: Array<{ x: number; width: number; y: number }> = []
  let total = 0
  for (let i = 0; i < n; i++) {
    const left = from + width * i
    const at = rule === "left" ? left : rule === "right" ? left + width : left + width / 2
    const y = curve.fn(at)
    if (!Number.isFinite(y)) continue
    rects.push({ x: left, width, y })
    total += y * width
  }
  return { rects, total }
}

/** The curve of f′, sampled the same way f is. */
export function derivativeCurve(curve: Curve): Curve {
  return {
    id: `${curve.id}'`,
    fn: (x: number) => derivativeAt(curve.fn, x),
    domain: curve.domain,
  }
}

/** Which curve a mark refers to, if any. */
export function markTarget(mark: MarkDef): string | undefined {
  if ("tangent" in mark) return mark.tangent.of
  if ("riemann" in mark) return mark.riemann.of
  if ("point" in mark) return mark.point.on
  if ("derivative" in mark) return mark.derivative.of
  if ("area" in mark) return mark.area.of
  return undefined
}
