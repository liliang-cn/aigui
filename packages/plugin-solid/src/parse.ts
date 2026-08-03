import { buildFigure, labelNames, names, resolvePoints } from "./geometry"
import type { Figure, HighlightDef, PointDef, SegmentDef, ShowFlag, SolidDefinition, SolidKind, SolidResult } from "./types"

const KINDS = new Set<SolidKind>(["cube", "cuboid", "prism", "pyramid", "cylinder", "cone", "sphere"])
const FLAGS = new Set<ShowFlag>(["labels", "hiddenEdges", "views"])
const POLYHEDRA = new Set<SolidKind>(["cube", "cuboid", "prism", "pyramid"])
const ID = /^[A-Z]\d?$/
const LABEL = /^[A-Z]\d?(?:[A-Z]\d?)*(?:-[A-Z]\d?(?:[A-Z]\d?)*)?$/
const FIELDS = new Set(["solid", "label", "edge", "size", "base", "height", "radius", "apexOver", "points", "segments", "section", "highlight", "show", "caption"])

const bad = (message: string): SolidResult<never> => ({ ok: false, error: { code: "invalid-definition", message } })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0

function parsePoints(raw: unknown, max: number): SolidResult<PointDef[]> {
  if (raw === undefined) return { ok: true, value: [] }
  if (!Array.isArray(raw)) return bad("points must be an array")
  if (raw.length > max) return bad(`points has more than ${max} entries`)
  const points: PointDef[] = []
  for (const [index, entry] of raw.entries()) {
    if (!isRecord(entry)) return bad(`points[${index}] must be an object`)
    const { id } = entry
    if (typeof id !== "string" || !ID.test(id)) return bad(`points[${index}].id must be a vertex letter`)
    const forms = ["on", "center", "foot", "onCircle"].filter((key) => key in entry)
    if (forms.length !== 1) return bad(`points[${index}] must use exactly one of on / center / foot / onCircle`)
    if (typeof entry.on === "string") {
      if (names(entry.on).length !== 2) return bad(`points[${index}].on must name two points`)
      if (typeof entry.at !== "number" || !(entry.at >= 0 && entry.at <= 1)) return bad(`points[${index}].at must be between 0 and 1`)
      points.push({ id, on: entry.on, at: entry.at })
    } else if (typeof entry.center === "string") {
      if (names(entry.center).length < 3) return bad(`points[${index}].center must name a face`)
      points.push({ id, center: entry.center })
    } else if (isRecord(entry.foot)) {
      const { from, to } = entry.foot
      if (typeof from !== "string" || typeof to !== "string") return bad(`points[${index}].foot needs from and to`)
      points.push({ id, foot: { from, to } })
    } else if (entry.onCircle === "base" || entry.onCircle === "top") {
      if (typeof entry.angle !== "number" || !Number.isFinite(entry.angle)) return bad(`points[${index}].angle must be a number`)
      points.push({ id, onCircle: entry.onCircle, angle: entry.angle })
    } else {
      return bad(`points[${index}] is not a form this plugin understands`)
    }
  }
  return { ok: true, value: points }
}

function parseSegments(raw: unknown): SolidResult<SegmentDef[]> {
  if (raw === undefined) return { ok: true, value: [] }
  if (!Array.isArray(raw)) return bad("segments must be an array")
  const segments: SegmentDef[] = []
  for (const [index, entry] of raw.entries()) {
    if (!isRecord(entry)) return bad(`segments[${index}] must be an object`)
    const { from, to, style, note } = entry
    if (typeof from !== "string" || typeof to !== "string") return bad(`segments[${index}] needs from and to`)
    if (style !== undefined && style !== "solid" && style !== "dashed") return bad(`segments[${index}].style must be solid or dashed`)
    if (note !== undefined && typeof note !== "string") return bad(`segments[${index}].note must be a string`)
    segments.push({ from, to, style: style as SegmentDef["style"], note: note as string | undefined })
  }
  return { ok: true, value: segments }
}

function parseHighlight(raw: unknown): SolidResult<HighlightDef[]> {
  if (raw === undefined) return { ok: true, value: [] }
  // Written as a bare object rather than an array is the single most common shape error a model
  // makes here, so it is named rather than lumped in with "invalid".
  if (!Array.isArray(raw)) return bad("highlight must be an array, even for a single mark")
  const marks: HighlightDef[] = []
  for (const [index, entry] of raw.entries()) {
    if (!isRecord(entry)) return bad(`highlight[${index}] must be an object`)
    if (Array.isArray(entry.line)) {
      if (entry.line.length !== 2 || !entry.line.every((n) => typeof n === "string")) return bad(`highlight[${index}].line must name two points`)
      marks.push({ line: entry.line as [string, string] })
    } else if (Array.isArray(entry.plane)) {
      if (entry.plane.length < 3 || !entry.plane.every((n) => typeof n === "string")) return bad(`highlight[${index}].plane must name at least three points`)
      marks.push({ plane: entry.plane as string[] })
    } else if (isRecord(entry.angle)) {
      const { at, rays } = entry.angle
      if (typeof at !== "string" || !Array.isArray(rays) || rays.length !== 2 || !rays.every((n) => typeof n === "string")) {
        return bad(`highlight[${index}].angle needs at and two rays`)
      }
      marks.push({ angle: { at, rays: rays as [string, string] } })
    } else {
      return bad(`highlight[${index}] must be a line, plane or angle`)
    }
  }
  return { ok: true, value: marks }
}

/**
 * Every letter a figure mentions must be a vertex of its own label or a point it defined.
 *
 * This is the check that a field-by-field validator misses: `{"plane": ["P", "A", "B"]}` on a cone
 * is the right shape in every respect and still unrenderable, because a cone has no A or B until
 * someone puts them on its circle. Left through, it draws a figure that quietly omits what the
 * answer is pointing at.
 */
function checkReferences(definition: SolidDefinition, figure: Figure): SolidResult<null> {
  const known = new Set([...labelNames(definition.label), ...figure.points.keys()])
  for (const point of definition.points ?? []) known.add(point.id)
  const check = (name: string, where: string): SolidResult<null> | undefined =>
    known.has(name) ? undefined : bad(`${where} refers to ${name}, which is neither a vertex of ${JSON.stringify(definition.label ?? "")} nor a point this figure defines`)

  for (const [index, segment] of (definition.segments ?? []).entries()) {
    const problem = check(segment.from, `segments[${index}].from`) ?? check(segment.to, `segments[${index}].to`)
    if (problem) return problem
  }
  for (const name of definition.section?.through ?? []) {
    const problem = check(name, "section.through")
    if (problem) return problem
  }
  for (const [index, mark] of (definition.highlight ?? []).entries()) {
    const referenced = "line" in mark ? mark.line : "plane" in mark ? mark.plane : [mark.angle.at, ...mark.angle.rays]
    for (const name of referenced) {
      const problem = check(name, `highlight[${index}]`)
      if (problem) return problem
    }
  }
  return { ok: true, value: null }
}

export interface ParsedSolid {
  definition: SolidDefinition
  figure: Figure
}

/** Validate one `solid` fence and resolve it to geometry, or explain why it cannot be drawn. */
export function parseSolid(source: string, options: { maxPoints?: number; maxSourceBytes?: number } = {}): SolidResult<ParsedSolid> {
  const maxPoints = options.maxPoints ?? 24
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
  // An unknown key is not noise to skip past: a model that wrote `vertices` or `proof` wanted
  // something this protocol does not offer, and dropping it quietly draws a figure missing the very
  // thing the answer points at.
  for (const key of Object.keys(raw)) {
    if (!FIELDS.has(key)) return bad(`${key} is not a field of a figure definition`)
  }
  if (typeof raw.solid !== "string" || !KINDS.has(raw.solid as SolidKind)) return bad(`solid must be one of ${[...KINDS].join(", ")}`)
  const kind = raw.solid as SolidKind

  if (kind !== "sphere" && typeof raw.label !== "string") return bad("label is required")
  if (raw.label !== undefined && typeof raw.label !== "string") return bad("label must be a string")
  if (typeof raw.label === "string" && !LABEL.test(raw.label)) {
    // Anything else names no vertices at all, and the figure would mount as an empty box rather
    // than say what was wrong with it.
    return bad("label must be vertex letters, optionally split by one hyphen, e.g. ABCD-A1B1C1D1")
  }

  const definition: SolidDefinition = { solid: kind, label: raw.label as string | undefined }

  if (kind === "cube") {
    if (!positive(raw.edge)) return bad("cube needs a positive edge")
    definition.edge = raw.edge
  }
  if (kind === "cuboid") {
    if (!Array.isArray(raw.size) || raw.size.length !== 3 || !raw.size.every(positive)) return bad("cuboid needs size [l, w, h]")
    definition.size = raw.size as [number, number, number]
  }
  if (kind === "prism" || kind === "pyramid") {
    if (typeof raw.base !== "number" || ![3, 4, 5, 6].includes(raw.base)) return bad("base must be 3, 4, 5 or 6")
    if (!positive(raw.edge)) return bad(`${kind} needs a positive edge`)
    if (!positive(raw.height)) return bad(`${kind} needs a positive height`)
    definition.base = raw.base
    definition.edge = raw.edge
    definition.height = raw.height
  }
  if (kind === "pyramid" && raw.apexOver !== undefined) {
    if (typeof raw.apexOver !== "string") return bad("apexOver must name a vertex")
    definition.apexOver = raw.apexOver
  }
  if (kind === "cone" || kind === "cylinder") {
    if (!positive(raw.radius)) return bad(`${kind} needs a positive radius`)
    if (!positive(raw.height)) return bad(`${kind} needs a positive height`)
    definition.radius = raw.radius
    definition.height = raw.height
  }
  if (kind === "sphere") {
    if (!positive(raw.radius)) return bad("sphere needs a positive radius")
    definition.radius = raw.radius
  }

  const points = parsePoints(raw.points, maxPoints)
  if (!points.ok) return points
  definition.points = points.value

  const segments = parseSegments(raw.segments)
  if (!segments.ok) return segments
  definition.segments = segments.value

  const highlight = parseHighlight(raw.highlight)
  if (!highlight.ok) return highlight
  definition.highlight = highlight.value

  if (raw.section !== undefined) {
    if (!isRecord(raw.section) || !Array.isArray(raw.section.through)) return bad("section needs a through array")
    const through = raw.section.through
    if (through.length !== 3 || !through.every((n) => typeof n === "string")) return bad("section.through must name exactly three points")
    // A plane through a cone or a cylinder generally cuts an ellipse or a parabola, and a polygon
    // drawn in its place would be a different curve presented as the answer.
    if (!POLYHEDRA.has(kind)) return bad("section is only supported on polyhedra")
    definition.section = { through: through as string[] }
  }

  if (raw.show !== undefined) {
    if (!Array.isArray(raw.show) || !raw.show.every((flag) => typeof flag === "string" && FLAGS.has(flag as ShowFlag))) {
      return bad(`show may only contain ${[...FLAGS].join(", ")}`)
    }
    definition.show = raw.show as ShowFlag[]
  }
  if (raw.caption !== undefined) {
    if (typeof raw.caption !== "string") return bad("caption must be a string")
    definition.caption = raw.caption
  }

  const needed = kind === "cube" || kind === "cuboid" ? 8
    : kind === "prism" ? (definition.base ?? 0) * 2
    : kind === "pyramid" ? (definition.base ?? 0) + 1
    : kind === "sphere" ? 0
    : 2
  const supplied = labelNames(definition.label).length
  if (supplied < needed) {
    return bad(`label names ${supplied} vertices but a ${kind} like this one needs ${needed}`)
  }

  const figure = buildFigure(definition)
  const { missing } = resolvePoints(figure, definition.points)
  if (missing.length > 0) return bad(`these points could not be placed: ${missing.join(", ")}`)

  const references = checkReferences(definition, figure)
  if (!references.ok) return references

  return { ok: true, value: { definition, figure } }
}
