import { evaluateConstant, ExprError, isPlottable } from "./expr"
import { at } from "./plot"
import type { CurveDef, FunctionDefinition, FunctionResult, MarkDef, ParamDef } from "./types"

const TOP = new Set(["params", "plot", "view", "marks", "caption"])
const CURVE = new Set(["id", "expr", "domain", "label"])
const RULES = new Set(["left", "right", "mid"])
const ID = /^[A-Za-z][A-Za-z0-9_']*$/

const bad = (message: string): FunctionResult<never> => ({ ok: false, error: { code: "invalid-definition", message } })
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
/**
 * Endpoints are read against the parameters declared in the same figure, so `"domain": [-1, "a"]`
 * works. Both helpers are built per call rather than held at module scope: a parser keeping mutable
 * state between invocations is one nested or concurrent call away from reading another figure's
 * parameters.
 */
function readers(names: readonly string[], sample: Record<string, number>) {
  const endpoint = (v: unknown): number | undefined => evaluateConstant(v, names, sample)
  const span = (v: unknown): [number, number] | undefined => {
    if (!Array.isArray(v) || v.length !== 2) return undefined
    const from = endpoint(v[0])
    const to = endpoint(v[1])
    return from === undefined || to === undefined ? undefined : [from, to]
  }
  return { endpoint, span }
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

  const params: ParamDef[] = []
  const names: string[] = []
  const sample: Record<string, number> = {}
  if (raw.params !== undefined) {
    if (!Array.isArray(raw.params)) return bad("params must be an array")
    if (raw.params.length > 4) return bad("params has more than 4 entries")
    for (const [index, entry] of raw.params.entries()) {
      if (!isRecord(entry)) return bad(`params[${index}] must be an object`)
      for (const key of Object.keys(entry)) {
        if (!["id", "from", "to", "value", "step", "label"].includes(key)) return bad(`params[${index}] has no field ${key}`)
      }
      const { id, from, to } = entry
      if (typeof id !== "string" || !/^[a-z][a-z0-9]?$/i.test(id) || id === "x" || id === "e") {
        return bad(`params[${index}].id must be a short name, and not x or e`)
      }
      if (names.includes(id)) return bad(`params[${index}].id repeats ${id}`)
      if (typeof from !== "number" || typeof to !== "number" || !(from < to)) return bad(`params[${index}] needs from < to`)
      const value = entry.value === undefined ? (from + to) / 2 : entry.value
      if (typeof value !== "number" || value < from || value > to) return bad(`params[${index}].value must lie in [from, to]`)
      if (entry.step !== undefined && (typeof entry.step !== "number" || entry.step <= 0)) return bad(`params[${index}].step must be positive`)
      if (entry.label !== undefined && typeof entry.label !== "string") return bad(`params[${index}].label must be a string`)
      names.push(id)
      sample[id] = value
      params.push({ id, from, to, value, step: entry.step as number | undefined, label: entry.label as string | undefined })
    }
  }

  const { endpoint, span } = readers(names, sample)

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
      isPlottable(expr, domain ?? span((raw.view as Record<string, unknown> | undefined)?.x) ?? [-5, 5], names, sample)
    } catch (error) {
      return bad(`plot[${index}].expr ${JSON.stringify(expr)}: ${error instanceof ExprError ? error.message : "cannot be evaluated"}`)
    }
    plot.push({ id, expr, label: label as string | undefined, domain: entry.domain as CurveDef["domain"] })
  }

  const definition: FunctionDefinition = { plot }
  if (params.length > 0) definition.params = params

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
