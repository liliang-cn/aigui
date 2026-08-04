import { evaluateConstant, ExprError, isPlottable } from "./expr"
import { at } from "./plot"
import type { CurveDef, FunctionDefinition, FunctionResult, MarkDef } from "./types"

const TOP = new Set(["plot", "view", "marks", "caption"])
const CURVE = new Set(["id", "expr", "domain", "label"])
const RULES = new Set(["left", "right", "mid"])
const ID = /^[A-Za-z][A-Za-z0-9_']*$/

const bad = (message: string): FunctionResult<never> => ({ ok: false, error: { code: "invalid-definition", message } })
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const endpoint = (v: unknown): number | undefined => evaluateConstant(v)
const span = (v: unknown): [number, number] | undefined => {
  if (!Array.isArray(v) || v.length !== 2) return undefined
  const from = endpoint(v[0])
  const to = endpoint(v[1])
  return from === undefined || to === undefined ? undefined : [from, to]
}

/**
 * Validate one `function` fence.
 *
 * Two refusals here are the whole point of the protocol rather than housekeeping. Sampled points
 * are refused because a model that plots the curve itself has put its own arithmetic into the
 * picture, and a wrong point looks exactly like a right one. A mark naming a curve that no `plot`
 * defines is refused because the figure would silently omit the thing the answer is pointing at.
 */
export function parseFunction(
  source: string,
  options: { maxCurves?: number; maxSourceBytes?: number } = {},
): FunctionResult<FunctionDefinition> {
  const maxCurves = options.maxCurves ?? 8
  const maxSourceBytes = options.maxSourceBytes ?? 16 * 1024
  if (new TextEncoder().encode(source).byteLength > maxSourceBytes) {
    return { ok: false, error: { code: "too-large", message: "Figure definition is too large." } }
  }
  let raw: unknown
  try {
    raw = JSON.parse(source)
  } catch {
    return { ok: false, error: { code: "invalid-json", message: "Figure definition is not valid JSON." } }
  }
  if (!isRecord(raw)) return bad("A figure definition must be a JSON object")
  // Before the generic unknown-field check, so the message names the actual mistake. "points is not
  // a field" tells whoever is tuning the prompt nothing; this tells them the model did the
  // renderer's job.
  if (/"(points|data|values|coords|coordinates|samples|series)"\s*:/.test(source)) {
    return bad("give an expression, not sampled points — the curve is sampled for you")
  }
  for (const key of Object.keys(raw)) if (!TOP.has(key)) return bad(`${key} is not a field of a figure definition`)

  if (!Array.isArray(raw.plot) || raw.plot.length === 0) return bad("plot must be a non-empty array")
  if (raw.plot.length > maxCurves) return bad(`plot has more than ${maxCurves} curves`)

  const ids = new Set<string>()
  const plot: CurveDef[] = []
  for (const [index, entry] of raw.plot.entries()) {
    if (!isRecord(entry)) return bad(`plot[${index}] must be an object`)
    for (const key of Object.keys(entry)) if (!CURVE.has(key)) return bad(`plot[${index}] has no field ${key}`)
    const { id, expr, label } = entry
    if (typeof id !== "string" || !ID.test(id)) return bad(`plot[${index}].id must be a short name`)
    if (ids.has(id)) return bad(`plot[${index}].id repeats ${id}`)
    ids.add(id)
    if (typeof expr !== "string") return bad(`plot[${index}].expr must be a string`)
    if (label !== undefined && typeof label !== "string") return bad(`plot[${index}].label must be a string`)

    let domain: [number, number] | undefined
    if (entry.domain !== undefined) {
      domain = span(entry.domain)
      if (!domain) return bad(`plot[${index}].domain must be [from, to]`)
      if (domain[0] >= domain[1]) return bad(`plot[${index}].domain must run from smaller to larger`)
    }
    try {
      isPlottable(expr, domain ?? span((raw.view as Record<string, unknown> | undefined)?.x) ?? [-5, 5])
    } catch (error) {
      return bad(`plot[${index}].expr ${JSON.stringify(expr)}: ${error instanceof ExprError ? error.message : "cannot be evaluated"}`)
    }
    plot.push({ id, expr, label: label as string | undefined, domain: entry.domain as CurveDef["domain"] })
  }

  const definition: FunctionDefinition = { plot }

  if (raw.view !== undefined) {
    if (!isRecord(raw.view)) return bad("view must be an object")
    for (const axis of Object.keys(raw.view)) if (axis !== "x" && axis !== "y") return bad(`view has no axis ${axis}`)
    for (const axis of ["x", "y"] as const) {
      const value = raw.view[axis]
      if (value === undefined) continue
      const range = span(value)
      if (!range || range[0] >= range[1]) return bad(`view.${axis} must be [min, max] with min < max`)
    }
    definition.view = raw.view as FunctionDefinition["view"]
  }

  if (raw.marks !== undefined) {
    if (!Array.isArray(raw.marks)) return bad("marks must be an array, even for a single mark")
    const marks: MarkDef[] = []
    for (const [index, entry] of raw.marks.entries()) {
      if (!isRecord(entry)) return bad(`marks[${index}] must be an object`)
      const where = `marks[${index}]`
      const known = (id: unknown, field: string): string | undefined => {
        if (typeof id !== "string") return `${where}.${field} must name a curve`
        if (!ids.has(id)) return `${where}.${field} refers to ${id}, which no plot defines`
        return undefined
      }
      if (isRecord(entry.tangent)) {
        const problem = known(entry.tangent.of, "tangent.of")
        if (problem) return bad(problem)
        if (endpoint(entry.tangent.at) === undefined) return bad(`${where}.tangent.at must be a number or constant expression`)
      } else if (isRecord(entry.area)) {
        const area = entry.area
        if (area.between !== undefined) {
          if (!Array.isArray(area.between) || area.between.length !== 2) return bad(`${where}.area.between must name two curves`)
          for (const id of area.between) {
            const problem = known(id, "area.between")
            if (problem) return bad(problem)
          }
        } else {
          const problem = known(area.of, "area.of")
          if (problem) return bad(problem)
        }
        if (endpoint(area.from) === undefined || endpoint(area.to) === undefined) return bad(`${where}.area needs from and to`)
        if (at(area.from) >= at(area.to)) return bad(`${where}.area must run from smaller to larger`)
      } else if (isRecord(entry.riemann)) {
        const riemann = entry.riemann
        const problem = known(riemann.of, "riemann.of")
        if (problem) return bad(problem)
        if (!Number.isInteger(riemann.n) || (riemann.n as number) < 1 || (riemann.n as number) > 200) {
          return bad(`${where}.riemann.n must be a whole number from 1 to 200`)
        }
        if (riemann.rule !== undefined && !RULES.has(riemann.rule as string)) return bad(`${where}.riemann.rule must be left, right or mid`)
        if (endpoint(riemann.from) === undefined || endpoint(riemann.to) === undefined) return bad(`${where}.riemann needs from and to`)
      } else if (isRecord(entry.point)) {
        const problem = known(entry.point.on, "point.on")
        if (problem) return bad(problem)
        if (endpoint(entry.point.at) === undefined) return bad(`${where}.point.at must be a number or constant expression`)
        if (entry.point.label !== undefined && typeof entry.point.label !== "string") return bad(`${where}.point.label must be a string`)
      } else if (isRecord(entry.asymptote)) {
        const { x, y } = entry.asymptote
        if ((typeof x === "number") === (typeof y === "number")) return bad(`${where}.asymptote needs exactly one of x or y`)
      } else if (isRecord(entry.derivative)) {
        const problem = known(entry.derivative.of, "derivative.of")
        if (problem) return bad(problem)
      } else {
        return bad(`${where} is not a mark this protocol defines`)
      }
      marks.push(entry as unknown as MarkDef)
    }
    definition.marks = marks
  }

  if (raw.caption !== undefined) {
    if (typeof raw.caption !== "string") return bad("caption must be a string")
    definition.caption = raw.caption
  }

  return { ok: true, value: definition }
}
