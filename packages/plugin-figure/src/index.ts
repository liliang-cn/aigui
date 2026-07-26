import type { AIGuiPlugin, ASTNode, RenderOutput } from "@ai-gui/core"

/**
 * Labelled figures: the diagram whose whole point is what the parts are called.
 *
 * A cell with its organelles named, a leaf's layers, a piece of apparatus with the parts a method
 * refers to. Mermaid draws boxes joined by arrows and a chart draws data; neither draws a shape with
 * "细胞核 — 储存 DNA" on a leader line pointing into it, which is the figure a biology lesson is
 * built around.
 *
 * The model composes the shapes and writes the callouts. Nothing is shipped as artwork, so nothing
 * here decides which figures a curriculum is allowed to teach — an ellipse inside an ellipse is a
 * crude cell, but it is the learner's cell, labelled with what this lesson is about. Complex
 * outlines are a polygon: a point list can be checked, where a hand-written path cannot.
 */

export type PartShape = "ellipse" | "rect" | "polygon" | "point"

/** How much a part's interior is filled, so nesting reads as nesting. */
export type PartFill = "none" | "tint" | "solid"

export interface FigurePart {
  shape?: PartShape
  /** Centre, for an ellipse, a rect or a point. */
  at?: [number, number]
  width?: number
  height?: number
  /** The outline, for a polygon. Closed automatically. */
  points?: [number, number][]
  /** Degrees, counter-clockwise. */
  rotation?: number
  fill?: PartFill
  /** What this part is called. Omit for a part that is only there to be drawn. */
  label?: string
  /** A second, quieter line under the label: what it does, why it matters. */
  note?: string
  /**
   * Where the callout text sits. Omitted, labels are stacked down the sides of the figure with
   * leader lines drawn to them — the arrangement a textbook plate uses.
   */
  labelAt?: [number, number]
}

export interface FigureDiagram {
  version: 1
  /** The coordinate box the figure is drawn in: [minX, minY, maxX, maxY]. */
  view?: [number, number, number, number]
  title?: string
  /** A line under the figure: what it is a figure of. */
  caption?: string
  parts: FigurePart[]
}

export interface FigureOptions {
  width?: number
  height?: number
  maxSourceBytes?: number
  /** How many parts to draw before refusing — a runaway block is not a figure. */
  maxParts?: number
}

const DEFAULTS = { width: 480, height: 360, maxSourceBytes: 8 * 1024, maxParts: 32 }

const FILLS: readonly PartFill[] = ["none", "tint", "solid"]
const SHAPES: readonly PartShape[] = ["ellipse", "rect", "polygon", "point"]

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function isFinitePoint(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((part) => typeof part === "number" && Number.isFinite(part))
  )
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function round(value: number): string {
  return (Math.round(value * 100) / 100).toString()
}

/**
 * Read a figure out of a block, rejecting anything that is not one.
 *
 * Strict, like the other plugins that accept model output: a figure that half-parses would label a
 * shape the model did not mean, and a mislabelled diagram teaches the wrong thing confidently.
 */
export function parseFigure(
  source: string,
  options: FigureOptions = {},
): { valid: true; data: FigureDiagram } | { valid: false; issues: string[] } {
  const limits = { ...DEFAULTS, ...options }
  if (new TextEncoder().encode(source).byteLength > limits.maxSourceBytes) {
    return { valid: false, issues: ["Figure is too large."] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    return { valid: false, issues: ["Figure must be valid JSON."] }
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { valid: false, issues: ["Figure must be a JSON object."] }
  }
  const value = parsed as Record<string, unknown>
  if (value.version !== 1) {
    return { valid: false, issues: ['Figure must declare "version": 1.'] }
  }
  if (!Array.isArray(value.parts)) {
    return { valid: false, issues: ["$.parts must be an array." ] }
  }
  if (value.parts.length === 0) {
    return { valid: false, issues: ["Figure must contain at least one part."] }
  }
  if (value.parts.length > limits.maxParts) {
    return { valid: false, issues: [`$.parts has more than ${limits.maxParts} entries.`] }
  }

  const issues: string[] = []
  const parts: FigurePart[] = []
  value.parts.forEach((raw, index) => {
    const path = `$.parts[${index}]`
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      issues.push(`${path} must be an object.`)
      return
    }
    const item = raw as Record<string, unknown>
    const shape = item.shape === undefined ? "ellipse" : item.shape
    if (typeof shape !== "string" || !SHAPES.includes(shape as PartShape)) {
      issues.push(`${path}.shape must be one of ${SHAPES.join(", ")}.`)
      return
    }
    const fill = item.fill === undefined ? "tint" : item.fill
    if (typeof fill !== "string" || !FILLS.includes(fill as PartFill)) {
      issues.push(`${path}.fill must be one of ${FILLS.join(", ")}.`)
      return
    }
    if (shape === "polygon") {
      if (!Array.isArray(item.points) || item.points.length < 3) {
        issues.push(`${path}.points must be at least three [x,y] pairs.`)
        return
      }
      if (item.points.length > 200) {
        issues.push(`${path}.points has more than 200 points.`)
        return
      }
      if (!item.points.every(isFinitePoint)) {
        issues.push(`${path}.points must all be two finite numbers.`)
        return
      }
    } else if (!isFinitePoint(item.at)) {
      issues.push(`${path}.at must be two finite numbers.`)
      return
    }
    parts.push({
      shape: shape as PartShape,
      fill: fill as PartFill,
      ...(isFinitePoint(item.at) ? { at: item.at } : {}),
      ...(shape === "polygon" ? { points: item.points as [number, number][] } : {}),
      width: num(item.width, 80),
      height: num(item.height, 60),
      rotation: num(item.rotation, 0),
      ...(typeof item.label === "string" ? { label: item.label } : {}),
      ...(typeof item.note === "string" ? { note: item.note } : {}),
      ...(isFinitePoint(item.labelAt) ? { labelAt: item.labelAt } : {}),
    })
  })

  if (issues.length > 0) return { valid: false, issues }
  return {
    valid: true,
    data: {
      version: 1,
      ...(Array.isArray(value.view) &&
      value.view.length === 4 &&
      value.view.every((part) => typeof part === "number" && Number.isFinite(part))
        ? { view: value.view as [number, number, number, number] }
        : {}),
      ...(typeof value.title === "string" ? { title: value.title } : {}),
      ...(typeof value.caption === "string" ? { caption: value.caption } : {}),
      parts,
    },
  }
}

/** Where a part sits, and how far it reaches. */
function boundsOf(part: FigurePart): { at: [number, number]; halfWidth: number; halfHeight: number } {
  if (part.shape === "polygon" && part.points) {
    const xs = part.points.map((point) => point[0])
    const ys = part.points.map((point) => point[1])
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    return {
      at: [(minX + maxX) / 2, (minY + maxY) / 2],
      halfWidth: (maxX - minX) / 2,
      halfHeight: (maxY - minY) / 2,
    }
  }
  const at = part.at ?? [0, 0]
  if (part.shape === "point") return { at, halfWidth: 4, halfHeight: 4 }
  return { at, halfWidth: (part.width ?? 80) / 2, halfHeight: (part.height ?? 60) / 2 }
}

/** The box the figure occupies, before room is made for the labels beside it. */
function figureBounds(diagram: FigureDiagram): [number, number, number, number] {
  const xs: number[] = []
  const ys: number[] = []
  for (const part of diagram.parts) {
    const { at, halfWidth, halfHeight } = boundsOf(part)
    xs.push(at[0] - halfWidth, at[0] + halfWidth)
    ys.push(at[1] - halfHeight, at[1] + halfHeight)
  }
  if (xs.length === 0) return [0, 0, 100, 100]
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

/** A callout: the text, where it sits, and which side of the figure it is on. */
interface Callout {
  part: FigurePart
  at: [number, number]
  side: "left" | "right"
}

/**
 * Decide where each label goes.
 *
 * A label the model placed is left where it put it. The rest go out to the side the part is already
 * on and are stacked down it, evenly spread and in the order they appear top to bottom — the
 * arrangement a textbook plate uses, so a model can name six organelles without also solving a
 * layout problem whose result it cannot see.
 *
 * The side has to follow the part, not its turn in the list. Alternating sides sends the leader for
 * a part on the left out to the right, straight across everything drawn in between, and a figure
 * whose lines cross the thing they are labelling cannot be read.
 */
function layOutCallouts(diagram: FigureDiagram, bounds: [number, number, number, number]): Callout[] {
  const [minX, minY, maxX, maxY] = bounds
  const centreX = (minX + maxX) / 2
  const labelled = diagram.parts.filter((part) => part.label !== undefined)
  const placed: Callout[] = []
  const gutter = 56

  const automatic: { part: FigurePart; side: "left" | "right"; y: number }[] = []
  for (const part of labelled) {
    if (part.labelAt) {
      const { at } = boundsOf(part)
      placed.push({ part, at: part.labelAt, side: part.labelAt[0] < at[0] ? "left" : "right" })
      continue
    }
    const { at } = boundsOf(part)
    automatic.push({ part, side: at[0] <= centreX ? "left" : "right", y: at[1] })
  }

  for (const side of ["left", "right"] as const) {
    const column = automatic.filter((entry) => entry.side === side)
    // Top of the drawing first, so the label order matches the figure.
    column.sort((left, right) => right.y - left.y)
    const span = maxY - minY
    const step = column.length > 1 ? span / (column.length - 1) : 0
    column.forEach((entry, index) => {
      const y = column.length > 1 ? maxY - index * step : (minY + maxY) / 2
      placed.push({ part: entry.part, at: [side === "left" ? minX - gutter : maxX + gutter, y], side })
    })
  }
  return placed
}

/** The point on a part's edge a leader line should meet, coming from `towards`. */
function anchorOn(part: FigurePart, towards: [number, number]): [number, number] {
  const { at, halfWidth, halfHeight } = boundsOf(part)
  const dx = towards[0] - at[0]
  const dy = towards[1] - at[1]
  const distance = Math.hypot(dx, dy)
  if (distance === 0) return at
  // Meet the bounding ellipse rather than the centre, so the line stops at the part it names.
  const scale = Math.min(1, Math.hypot(halfWidth, halfHeight) / distance)
  return [at[0] + dx * scale * 0.95, at[1] + dy * scale * 0.95]
}

/**
 * Draw the figure.
 *
 * The y axis is flipped once in the outer transform, the same way `@ai-gui/plugin-physics` does it,
 * so a lesson that draws both does not have to hold two conventions at once. Every text node flips
 * back so it stays upright.
 */
export function renderFigureSVG(diagram: FigureDiagram, options: FigureOptions = {}): string {
  const limits = { ...DEFAULTS, ...options }
  const bounds = figureBounds(diagram)
  const callouts = layOutCallouts(diagram, bounds)
  const parts: string[] = []

  for (const part of diagram.parts) {
    const rotation =
      part.rotation && part.shape !== "polygon"
        ? ` transform="rotate(${round(part.rotation)} ${round((part.at ?? [0, 0])[0])} ${round((part.at ?? [0, 0])[1])})"`
        : ""
    const fill = ` class="aigui-figure-part aigui-figure-fill-${part.fill ?? "tint"}"`
    if (part.shape === "polygon" && part.points) {
      const points = part.points.map((point) => `${round(point[0])},${round(point[1])}`).join(" ")
      parts.push(`<polygon points="${points}"${fill} />`)
    } else if (part.shape === "point") {
      const at = part.at ?? [0, 0]
      parts.push(`<circle cx="${round(at[0])}" cy="${round(at[1])}" r="4" class="aigui-figure-point" />`)
    } else if (part.shape === "rect") {
      const at = part.at ?? [0, 0]
      const width = part.width ?? 80
      const height = part.height ?? 60
      parts.push(
        `<rect x="${round(at[0] - width / 2)}" y="${round(at[1] - height / 2)}" width="${round(width)}" height="${round(height)}" rx="4"${fill}${rotation} />`,
      )
    } else {
      const at = part.at ?? [0, 0]
      parts.push(
        `<ellipse cx="${round(at[0])}" cy="${round(at[1])}" rx="${round((part.width ?? 80) / 2)}" ry="${round((part.height ?? 60) / 2)}"${fill}${rotation} />`,
      )
    }
  }

  for (const callout of callouts) {
    const anchor = anchorOn(callout.part, callout.at)
    // An elbow rather than a diagonal: the horizontal run gives the text something to sit on.
    const elbowX = callout.side === "left" ? callout.at[0] + 12 : callout.at[0] - 12
    parts.push(
      `<path d="M ${round(anchor[0])} ${round(anchor[1])} L ${round(elbowX)} ${round(callout.at[1])} L ${round(callout.at[0])} ${round(callout.at[1])}" class="aigui-figure-leader" />`,
      `<circle cx="${round(anchor[0])}" cy="${round(anchor[1])}" r="2.5" class="aigui-figure-leader-dot" />`,
    )
    const anchorAttribute = callout.side === "left" ? "end" : "start"
    const flip = `transform="scale(1,-1)" transform-origin="${round(callout.at[0])} ${round(callout.at[1])}"`
    parts.push(
      `<text x="${round(callout.at[0])}" y="${round(callout.at[1])}" class="aigui-figure-label" text-anchor="${anchorAttribute}" ${flip}>${escapeHtml(callout.part.label ?? "")}</text>`,
    )
    if (callout.part.note) {
      parts.push(
        `<text x="${round(callout.at[0])}" y="${round(callout.at[1] - 15)}" class="aigui-figure-note" text-anchor="${anchorAttribute}" transform="scale(1,-1)" transform-origin="${round(callout.at[0])} ${round(callout.at[1] - 15)}">${escapeHtml(callout.part.note)}</text>`,
      )
    }
  }

  // The view has to hold the labels as well as the figure, or half the callouts fall off the edge.
  const view = diagram.view ?? viewWithCallouts(bounds, callouts, Boolean(diagram.caption))
  const [minX, minY, maxX, maxY] = view
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)

  if (diagram.caption) {
    const y = minY + 14
    parts.push(
      `<text x="${round((minX + maxX) / 2)}" y="${round(y)}" class="aigui-figure-caption" text-anchor="middle" transform="scale(1,-1)" transform-origin="${round((minX + maxX) / 2)} ${round(y)}">${escapeHtml(diagram.caption)}</text>`,
    )
  }

  const title = diagram.title ? `<title>${escapeHtml(diagram.title)}</title>` : ""
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round(minX)} ${round(minY)} ${round(width)} ${round(height)}"`,
    ` width="100%" style="max-width:${limits.width}px;max-height:${limits.height}px;display:block;margin:auto"`,
    ` role="img" aria-label="${escapeHtml(diagram.title ?? diagram.caption ?? "Labelled figure")}" data-aigui-figure="diagram">`,
    title,
    `<g transform="translate(0, ${round(minY + maxY)}) scale(1, -1)">`,
    parts.join(""),
    "</g></svg>",
  ].join("")
}

/** Widen the drawing box until every callout, and the caption, is inside it. */
function viewWithCallouts(
  bounds: [number, number, number, number],
  callouts: Callout[],
  hasCaption: boolean,
): [number, number, number, number] {
  // Room for the text itself, which is laid out by the renderer and cannot be measured here.
  const textRoom = 120
  const xs = [bounds[0], bounds[2]]
  const ys = [bounds[1], bounds[3]]
  for (const callout of callouts) {
    xs.push(callout.side === "left" ? callout.at[0] - textRoom : callout.at[0] + textRoom)
    ys.push(callout.at[1] - 20, callout.at[1] + 12)
  }
  const pad = 12
  return [
    Math.min(...xs) - pad,
    Math.min(...ys) - pad - (hasCaption ? 22 : 0),
    Math.max(...xs) + pad,
    Math.max(...ys) + pad,
  ]
}

export function figurePromptSpec(options: FigureOptions = {}): string {
  const limits = { ...DEFAULTS, ...options }
  return [
    "Labelled figures (one fenced block): ```figure <strict JSON>```.",
    'Root: {"version":1,"title":"..."?,"caption":"..."?,"view":[minX,minY,maxX,maxY]?,"parts":[...]}. No unknown fields.',
    'Part: {"shape":"ellipse|rect|polygon|point"?,"at":[x,y],"width":n?,"height":n?,"points":[[x,y],...]?,"rotation":deg?,"fill":"none|tint|solid"?,"label":"..."?,"note":"..."?,"labelAt":[x,y]?}.',
    'Give "at" for ellipse, rect and point; give "points" (three or more) for polygon. Default shape is ellipse, default fill is tint.',
    '"label" is what the part is called and "note" is a shorter second line saying what it does. Omit "labelAt" and the labels are stacked down both sides with leader lines drawn for you.',
    "Draw containers before the parts inside them, so an enclosing outline does not cover them.",
    "y increases upwards, the same convention as ```physics.",
    `Figure source is local JSON only, at most ${limits.maxSourceBytes} UTF-8 bytes. Never emit URLs, scripts, remote resources, HTML, or executable content.`,
    "Use this when naming the parts is the lesson: cell organelles, a leaf's layers, apparatus, a labelled cross-section. Use ```mermaid for boxes joined by arrows and ```chart for data.",
  ].join("\n")
}

export const figureCss = `
[data-aigui-figure] { max-width: 100%; height: auto; overflow: visible; color: currentColor; }
[data-aigui-figure] .aigui-figure-part { stroke: currentColor; stroke-width: 1.5; }
[data-aigui-figure] .aigui-figure-fill-none { fill: none; }
[data-aigui-figure] .aigui-figure-fill-tint { fill: var(--aigui-figure-tint, color-mix(in srgb, currentColor 10%, transparent)); }
[data-aigui-figure] .aigui-figure-fill-solid { fill: var(--aigui-figure-solid, color-mix(in srgb, currentColor 28%, transparent)); }
[data-aigui-figure] .aigui-figure-point { fill: currentColor; stroke: none; }
[data-aigui-figure] .aigui-figure-leader { fill: none; stroke: var(--aigui-figure-leader, currentColor); stroke-width: 1; opacity: .6; }
[data-aigui-figure] .aigui-figure-leader-dot { fill: var(--aigui-figure-leader, currentColor); opacity: .8; }
[data-aigui-figure] .aigui-figure-label { font-size: 13px; font-family: inherit; dominant-baseline: middle; fill: currentColor; }
[data-aigui-figure] .aigui-figure-note { font-size: 11px; font-family: inherit; dominant-baseline: middle; fill: currentColor; opacity: .7; }
[data-aigui-figure] .aigui-figure-caption { font-size: 12px; font-family: inherit; fill: currentColor; opacity: .75; }
`

function errorHtml(issue: string): RenderOutput {
  return { kind: "html", html: `<pre data-aigui-figure-error>${escapeHtml(issue)}</pre>` }
}

export function figure(options: FigureOptions = {}): AIGuiPlugin {
  const render = (node: ASTNode): RenderOutput => {
    const parsed = parseFigure(node.content ?? "", options)
    if (!parsed.valid) return errorHtml(parsed.issues[0] ?? "Invalid figure.")
    try {
      // Built here from coordinates the model declared, not from markup it wrote, so the host's
      // sanitizer would only strip the drawing.
      return { kind: "html", html: renderFigureSVG(parsed.data, options), trusted: true }
    } catch {
      return errorHtml("Figure could not be drawn.")
    }
  }
  return { name: "figure", nodeRenderers: { figure: render }, css: figureCss, promptSpec: figurePromptSpec(options) }
}
