import type { AIGuiPlugin, ASTNode, RenderOutput } from "@ai-gui/core"

/**
 * Force and vector diagrams, drawn from a declaration rather than simulated.
 *
 * A mechanics lesson needs the picture a textbook draws: a body, the forces on it as labelled
 * arrows, their angles, and often one force resolved into components. What it does not need is a
 * rigid-body engine — a simulation produces a collision that *looks* right and gives a teacher no
 * way to label the intermediate quantities, stop at three seconds, or show a force that is in
 * equilibrium and therefore never moves anything. So this takes coordinates and draws them.
 *
 * The numbers are the model's to get right; the drawing is faithful to what it declared.
 */

export type VectorStyle = "force" | "velocity" | "acceleration" | "component" | "dimension"

export interface PhysicsVector {
  /** Where the arrow starts, in diagram units. Defaults to the body's centre. */
  from?: [number, number]
  /**
   * Either the arrow's tip, or a magnitude and angle.
   *
   * Angles are in degrees, counter-clockwise from the positive x axis, because that is how a
   * mechanics problem states them ("a 30° incline", "60° above the horizontal").
   */
  to?: [number, number]
  magnitude?: number
  angle?: number
  label?: string
  style?: VectorStyle
  /** Drawn as a dashed line, for a component or a construction line. */
  dashed?: boolean
}

export interface PhysicsBody {
  at: [number, number]
  /** A block, a ball, or a point mass. */
  shape?: "box" | "circle" | "point"
  width?: number
  height?: number
  radius?: number
  label?: string
  /** Degrees, counter-clockwise — an inclined block is drawn tilted. */
  rotation?: number
}

export interface PhysicsSurface {
  from: [number, number]
  to: [number, number]
  /** Hatching on the far side, the convention for ground or a wall. */
  hatch?: boolean
  label?: string
}

export interface PhysicsAngle {
  at: [number, number]
  /** Degrees, counter-clockwise from the positive x axis. */
  from: number
  to: number
  radius?: number
  label?: string
}

export interface PhysicsDiagram {
  version: 1
  /** The coordinate box the diagram is drawn in: [minX, minY, maxX, maxY]. */
  view?: [number, number, number, number]
  title?: string
  bodies?: PhysicsBody[]
  vectors?: PhysicsVector[]
  surfaces?: PhysicsSurface[]
  angles?: PhysicsAngle[]
}

export interface PhysicsOptions {
  width?: number
  height?: number
  maxSourceBytes?: number
  /** How many of each element to draw before refusing — a runaway block is not a diagram. */
  maxElements?: number
}

const DEFAULTS = { width: 460, height: 340, maxSourceBytes: 8 * 1024, maxElements: 40 }

/** Colours are named through currentColor and CSS custom properties so a host's theme decides. */
const STYLE_VAR: Record<VectorStyle, string> = {
  force: "--aigui-physics-force",
  velocity: "--aigui-physics-velocity",
  acceleration: "--aigui-physics-acceleration",
  component: "--aigui-physics-component",
  dimension: "--aigui-physics-dimension",
}

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

/**
 * Read a diagram out of a block, rejecting anything that is not one.
 *
 * Strict, like the other plugins that accept model output: a diagram that half-parses would draw a
 * confident picture of something the model did not mean.
 */
export function parsePhysicsDiagram(
  source: string,
  options: PhysicsOptions = {},
): { valid: true; data: PhysicsDiagram } | { valid: false; issues: string[] } {
  const limits = { ...DEFAULTS, ...options }
  if (new TextEncoder().encode(source).byteLength > limits.maxSourceBytes) {
    return { valid: false, issues: ["Diagram is too large."] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    return { valid: false, issues: ["Diagram must be valid JSON."] }
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { valid: false, issues: ["Diagram must be a JSON object."] }
  }
  const value = parsed as Record<string, unknown>
  if (value.version !== 1) {
    return { valid: false, issues: ['Diagram must declare "version": 1.'] }
  }
  const issues: string[] = []
  const list = <T>(key: string, read: (item: Record<string, unknown>, path: string) => T | undefined): T[] => {
    const raw = value[key]
    if (raw === undefined) return []
    if (!Array.isArray(raw)) {
      issues.push(`$.${key} must be an array.`)
      return []
    }
    if (raw.length > limits.maxElements) {
      issues.push(`$.${key} has more than ${limits.maxElements} entries.`)
      return []
    }
    const out: T[] = []
    raw.forEach((item, index) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        issues.push(`$.${key}[${index}] must be an object.`)
        return
      }
      const read_ = read(item as Record<string, unknown>, `$.${key}[${index}]`)
      if (read_ !== undefined) out.push(read_)
    })
    return out
  }

  const bodies = list<PhysicsBody>("bodies", (item, path) => {
    if (!isFinitePoint(item.at)) {
      issues.push(`${path}.at must be two finite numbers.`)
      return undefined
    }
    const shape = item.shape === undefined ? "box" : item.shape
    if (shape !== "box" && shape !== "circle" && shape !== "point") {
      issues.push(`${path}.shape must be box, circle, or point.`)
      return undefined
    }
    return {
      at: item.at,
      shape,
      width: num(item.width, 60),
      height: num(item.height, 40),
      radius: num(item.radius, 22),
      rotation: num(item.rotation, 0),
      ...(typeof item.label === "string" ? { label: item.label } : {}),
    }
  })

  const vectors = list<PhysicsVector>("vectors", (item, path) => {
    const hasTo = isFinitePoint(item.to)
    const hasPolar = typeof item.magnitude === "number" && Number.isFinite(item.magnitude)
    if (!hasTo && !hasPolar) {
      issues.push(`${path} needs either "to" or "magnitude" with "angle".`)
      return undefined
    }
    const style = item.style === undefined ? "force" : item.style
    if (typeof style !== "string" || !Object.hasOwn(STYLE_VAR, style)) {
      issues.push(`${path}.style is not one of ${Object.keys(STYLE_VAR).join(", ")}.`)
      return undefined
    }
    return {
      ...(isFinitePoint(item.from) ? { from: item.from } : {}),
      ...(hasTo ? { to: item.to as [number, number] } : {}),
      ...(hasPolar ? { magnitude: item.magnitude as number, angle: num(item.angle, 0) } : {}),
      style: style as VectorStyle,
      dashed: item.dashed === true,
      ...(typeof item.label === "string" ? { label: item.label } : {}),
    }
  })

  const surfaces = list<PhysicsSurface>("surfaces", (item, path) => {
    if (!isFinitePoint(item.from) || !isFinitePoint(item.to)) {
      issues.push(`${path}.from and ${path}.to must be two finite numbers each.`)
      return undefined
    }
    return {
      from: item.from,
      to: item.to,
      hatch: item.hatch !== false,
      ...(typeof item.label === "string" ? { label: item.label } : {}),
    }
  })

  const angles = list<PhysicsAngle>("angles", (item, path) => {
    if (!isFinitePoint(item.at)) {
      issues.push(`${path}.at must be two finite numbers.`)
      return undefined
    }
    if (typeof item.from !== "number" || typeof item.to !== "number") {
      issues.push(`${path}.from and ${path}.to must be angles in degrees.`)
      return undefined
    }
    return {
      at: item.at,
      from: item.from,
      to: item.to,
      radius: num(item.radius, 28),
      ...(typeof item.label === "string" ? { label: item.label } : {}),
    }
  })

  if (bodies.length + vectors.length + surfaces.length === 0) {
    issues.push("Diagram must contain at least one body, vector, or surface.")
  }
  if (issues.length > 0) return { valid: false, issues }
  return {
    valid: true,
    data: {
      version: 1,
      ...(Array.isArray(value.view) && value.view.length === 4 && value.view.every((v) => typeof v === "number" && Number.isFinite(v))
        ? { view: value.view as [number, number, number, number] }
        : {}),
      ...(typeof value.title === "string" ? { title: value.title } : {}),
      bodies,
      vectors,
      surfaces,
      angles,
    },
  }
}

/** The box the diagram occupies, widened to hold everything it draws. */
function viewBoxOf(diagram: PhysicsDiagram): [number, number, number, number] {
  if (diagram.view) return diagram.view
  const xs: number[] = []
  const ys: number[] = []
  const note = (point: [number, number]) => {
    xs.push(point[0])
    ys.push(point[1])
  }
  for (const body of diagram.bodies ?? []) {
    const halfWidth = (body.shape === "circle" ? (body.radius ?? 22) : (body.width ?? 60)) / 2
    const halfHeight = (body.shape === "circle" ? (body.radius ?? 22) : (body.height ?? 40)) / 2
    note([body.at[0] - halfWidth, body.at[1] - halfHeight])
    note([body.at[0] + halfWidth, body.at[1] + halfHeight])
  }
  for (const surface of diagram.surfaces ?? []) {
    note(surface.from)
    note(surface.to)
  }
  for (const vector of diagram.vectors ?? []) {
    const start = vector.from ?? (diagram.bodies?.[0]?.at ?? [0, 0])
    note(start)
    const tip = tipOf(vector, start)
    note(tip)
    if (vector.label) {
      // The label is written past the arrowhead — see the renderer, which offsets by the same 8 — and
      // then runs the width of its own text. Measuring the tip alone left "mg cos(30°)" outside the
      // frame: an arrow pointing at nothing, with its name cut off at the edge of the picture.
      const lx = tip[0] + (tip[0] - start[0]) * 0.08 + 8
      const ly = tip[1] + (tip[1] - start[1]) * 0.08
      note([lx, ly])
      note([lx + textWidth(vector.label), ly + LABEL_HEIGHT])
      note([lx, ly - LABEL_HEIGHT])
    }
  }
  // Angle marks were measured by nothing at all, which is how the 30° at the foot of an incline ended
  // up outside the picture — the one label a mechanics diagram cannot do without.
  for (const angle of diagram.angles ?? []) {
    const radius = angle.radius ?? 28
    const reach = radius + (angle.label ? ANGLE_LABEL_OFFSET + textWidth(angle.label) : 0)
    // Every direction: the arc runs from `from` to `to`, and the label sits on the bisector of whichever
    // pair those are — cheaper and safer to bound the whole circle than to reason about the sweep.
    note([angle.at[0] - reach, angle.at[1] - reach])
    note([angle.at[0] + reach, angle.at[1] + reach])
  }
  for (const surface of diagram.surfaces ?? []) {
    if (!surface.hatch) continue
    // Hatching hangs below the line by its own length; a surface at the bottom of a diagram loses it.
    note([Math.min(surface.from[0], surface.to[0]) - HATCH_REACH, Math.min(surface.from[1], surface.to[1]) - HATCH_REACH])
  }
  if (xs.length === 0) return [0, 0, 100, 100]
  const pad = 40
  return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad]
}

/** How far past the arc a label sits, as the renderer places it. */
const ANGLE_LABEL_OFFSET = 14
/** How far the hatching hangs off a surface, as the renderer draws it. */
const HATCH_REACH = 15
/** One line of label text, in the same units the diagram is drawn in. */
const LABEL_HEIGHT = 14

/**
 * Roughly how wide a label will be.
 *
 * An estimate on purpose: measuring text needs a DOM, and this renders to a string on whatever runs it.
 * Wide-erring — CJK counted at a full em, Latin at half — because a box slightly too big shows white
 * space, and a box slightly too small cuts a word off.
 */
function textWidth(label: string): number {
  let width = 0
  for (const character of label) {
    width += /[\u3000-\u9fff\uff00-\uffef]/.test(character) ? LABEL_HEIGHT : LABEL_HEIGHT * 0.55
  }
  return width
}

/** Where a vector ends, whether it was given as a point or as a magnitude and angle. */
function tipOf(vector: PhysicsVector, start: [number, number]): [number, number] {
  if (vector.to) return vector.to
  const radians = ((vector.angle ?? 0) * Math.PI) / 180
  const length = vector.magnitude ?? 0
  return [start[0] + length * Math.cos(radians), start[1] + length * Math.sin(radians)]
}

function round(value: number): string {
  return (Math.round(value * 100) / 100).toString()
}

/**
 * Draw the diagram.
 *
 * The y axis is flipped once, in the outer transform, so a declaration can say "gravity points to
 * y = -1" and mean down — a mechanics problem is stated in maths coordinates, not screen ones.
 */
export function renderPhysicsSVG(diagram: PhysicsDiagram, options: PhysicsOptions = {}): string {
  const limits = { ...DEFAULTS, ...options }
  const [minX, minY, maxX, maxY] = viewBoxOf(diagram)
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)
  const parts: string[] = []

  for (const surface of diagram.surfaces ?? []) {
    parts.push(
      `<line x1="${round(surface.from[0])}" y1="${round(surface.from[1])}" x2="${round(surface.to[0])}" y2="${round(surface.to[1])}" class="aigui-physics-surface" />`,
    )
    if (surface.hatch) {
      const dx = surface.to[0] - surface.from[0]
      const dy = surface.to[1] - surface.from[1]
      const span = Math.hypot(dx, dy) || 1
      const steps = Math.min(limits.maxElements, Math.max(2, Math.floor(span / 14)))
      const nx = -dy / span
      const ny = dx / span
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps
        const x = surface.from[0] + dx * t
        const y = surface.from[1] + dy * t
        parts.push(
          `<line x1="${round(x)}" y1="${round(y)}" x2="${round(x - nx * 9 - dx / span * 6)}" y2="${round(y - ny * 9 - dy / span * 6)}" class="aigui-physics-hatch" />`,
        )
      }
    }
    if (surface.label) {
      parts.push(
        `<text x="${round((surface.from[0] + surface.to[0]) / 2)}" y="${round((surface.from[1] + surface.to[1]) / 2 - 12)}" class="aigui-physics-label" transform="scale(1,-1)" transform-origin="${round((surface.from[0] + surface.to[0]) / 2)} ${round((surface.from[1] + surface.to[1]) / 2 - 12)}">${escapeHtml(surface.label)}</text>`,
      )
    }
  }

  for (const angle of diagram.angles ?? []) {
    const radius = angle.radius ?? 28
    const start = (angle.from * Math.PI) / 180
    const end = (angle.to * Math.PI) / 180
    const large = Math.abs(angle.to - angle.from) > 180 ? 1 : 0
    const sweep = angle.to > angle.from ? 1 : 0
    const x1 = angle.at[0] + radius * Math.cos(start)
    const y1 = angle.at[1] + radius * Math.sin(start)
    const x2 = angle.at[0] + radius * Math.cos(end)
    const y2 = angle.at[1] + radius * Math.sin(end)
    parts.push(
      `<path d="M ${round(x1)} ${round(y1)} A ${round(radius)} ${round(radius)} 0 ${large} ${sweep} ${round(x2)} ${round(y2)}" class="aigui-physics-angle" />`,
    )
    if (angle.label) {
      const mid = (start + end) / 2
      const lx = angle.at[0] + (radius + 14) * Math.cos(mid)
      const ly = angle.at[1] + (radius + 14) * Math.sin(mid)
      parts.push(
        `<text x="${round(lx)}" y="${round(ly)}" class="aigui-physics-label" transform="scale(1,-1)" transform-origin="${round(lx)} ${round(ly)}">${escapeHtml(angle.label)}</text>`,
      )
    }
  }

  for (const body of diagram.bodies ?? []) {
    const rotate = body.rotation ? ` transform="rotate(${round(body.rotation)} ${round(body.at[0])} ${round(body.at[1])})"` : ""
    if (body.shape === "circle") {
      parts.push(`<circle cx="${round(body.at[0])}" cy="${round(body.at[1])}" r="${round(body.radius ?? 22)}" class="aigui-physics-body"${rotate} />`)
    } else if (body.shape === "point") {
      parts.push(`<circle cx="${round(body.at[0])}" cy="${round(body.at[1])}" r="4" class="aigui-physics-point"${rotate} />`)
    } else {
      const w = body.width ?? 60
      const h = body.height ?? 40
      parts.push(
        `<rect x="${round(body.at[0] - w / 2)}" y="${round(body.at[1] - h / 2)}" width="${round(w)}" height="${round(h)}" class="aigui-physics-body"${rotate} />`,
      )
    }
    if (body.label) {
      parts.push(
        `<text x="${round(body.at[0])}" y="${round(body.at[1])}" class="aigui-physics-body-label" transform="scale(1,-1)" transform-origin="${round(body.at[0])} ${round(body.at[1])}">${escapeHtml(body.label)}</text>`,
      )
    }
  }

  for (const vector of diagram.vectors ?? []) {
    const start = vector.from ?? (diagram.bodies?.[0]?.at ?? [0, 0])
    const tip = tipOf(vector, start)
    const style = vector.style ?? "force"
    const dash = vector.dashed ? ' stroke-dasharray="6 4"' : ""
    parts.push(
      `<line x1="${round(start[0])}" y1="${round(start[1])}" x2="${round(tip[0])}" y2="${round(tip[1])}" class="aigui-physics-vector" style="stroke:var(${STYLE_VAR[style]}, currentColor)" marker-end="url(#aigui-physics-arrow-${style})"${dash} />`,
    )
    if (vector.label) {
      const lx = tip[0] + (tip[0] - start[0]) * 0.08 + 8
      const ly = tip[1] + (tip[1] - start[1]) * 0.08
      parts.push(
        `<text x="${round(lx)}" y="${round(ly)}" class="aigui-physics-label" style="fill:var(${STYLE_VAR[style]}, currentColor)" transform="scale(1,-1)" transform-origin="${round(lx)} ${round(ly)}">${escapeHtml(vector.label)}</text>`,
      )
    }
  }

  const markers = Object.entries(STYLE_VAR)
    .map(
      ([style, variable]) =>
        `<marker id="aigui-physics-arrow-${style}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(${variable}, currentColor)" /></marker>`,
    )
    .join("")

  const title = diagram.title ? `<title>${escapeHtml(diagram.title)}</title>` : ""
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round(minX)} ${round(minY)} ${round(width)} ${round(height)}"`,
    ` width="100%" style="max-width:${limits.width}px;max-height:${limits.height}px;display:block;margin:auto"`,
    ` role="img" aria-label="${escapeHtml(diagram.title ?? "Physics diagram")}" data-aigui-physics="diagram">`,
    title,
    `<defs>${markers}</defs>`,
    // One flip for the whole drawing: a problem states "downward" as negative y, and every label
    // flips back so text stays upright.
    `<g transform="translate(0, ${round(minY + maxY)}) scale(1, -1)">`,
    parts.join(""),
    "</g></svg>",
  ].join("")
}

/**
 * You rarely want this directly: `buildSystemPrompt({ registry, plugins, locale })` from
 * `@ai-gui/core` collects the card specs and every enabled plugin's spec in one call, in the
 * product's language. Reach for this only to inspect or override one plugin's rules.
 */
export function physicsPromptSpec(options: PhysicsOptions = {}): string {
  const limits = { ...DEFAULTS, ...options }
  return [
    "Force and vector diagrams (one fenced block): ```physics <strict JSON>```.",
    'Root: {"version":1,"title":"..."?,"view":[minX,minY,maxX,maxY]?,"bodies":[...]?,"surfaces":[...]?,"vectors":[...]?,"angles":[...]?}. No unknown fields.',
    'Body: {"at":[x,y],"shape":"box|circle|point"?,"width":n?,"height":n?,"radius":n?,"rotation":deg?,"label":"..."?}.',
    'Surface: {"from":[x,y],"to":[x,y],"hatch":true?,"label":"..."?} — hatching marks the solid side.',
    'Vector: {"from":[x,y]?,"to":[x,y]?,"magnitude":n?,"angle":deg?,"style":"force|velocity|acceleration|component|dimension"?,"dashed":true?,"label":"..."?}. Give either "to" or "magnitude" with "angle". Omit "from" to start at the first body.',
    'Angle: {"at":[x,y],"from":deg,"to":deg,"radius":n?,"label":"..."?}.',
    "y increases upwards and angles are counter-clockwise from the positive x axis, as a mechanics problem states them: gravity points at angle -90.",
    `Diagram source is local JSON only, at most ${limits.maxSourceBytes} UTF-8 bytes. Never emit URLs, scripts, remote resources, HTML, or executable content.`,
    "Use this for free-body diagrams, resolved components, inclines and projectile setups — the picture a textbook draws. It is a drawing, not a simulation: state the coordinates you mean.",
  ].join("\n")
}

export const physicsCss = `
[data-aigui-physics] { max-width: 100%; height: auto; overflow: visible; color: currentColor; }
[data-aigui-physics] .aigui-physics-body { fill: var(--aigui-physics-body, color-mix(in srgb, currentColor 12%, transparent)); stroke: currentColor; stroke-width: 1.5; }
[data-aigui-physics] .aigui-physics-point { fill: currentColor; stroke: none; }
[data-aigui-physics] .aigui-physics-surface { stroke: currentColor; stroke-width: 2; }
[data-aigui-physics] .aigui-physics-hatch { stroke: currentColor; stroke-width: 1; opacity: .55; }
[data-aigui-physics] .aigui-physics-angle { fill: none; stroke: var(--aigui-physics-dimension, currentColor); stroke-width: 1.2; }
[data-aigui-physics] .aigui-physics-vector { stroke-width: 2; stroke-linecap: round; }
[data-aigui-physics] .aigui-physics-label { font-size: 13px; font-family: inherit; dominant-baseline: middle; }
[data-aigui-physics] .aigui-physics-body-label { font-size: 13px; font-family: inherit; text-anchor: middle; dominant-baseline: middle; fill: currentColor; }
`

function errorHtml(issue: string): RenderOutput {
  return { kind: "html", html: `<pre data-aigui-physics-error>${escapeHtml(issue)}</pre>` }
}

export function physics(options: PhysicsOptions = {}): AIGuiPlugin {
  const render = (node: ASTNode): RenderOutput => {
    const parsed = parsePhysicsDiagram(node.content ?? "", options)
    if (!parsed.valid) return errorHtml(parsed.issues[0] ?? "Invalid diagram.")
    try {
      // Built here from coordinates the model declared, not from markup it wrote, so the host's
      // sanitizer would only strip the drawing.
      return { kind: "html", html: renderPhysicsSVG(parsed.data, options), trusted: true }
    } catch {
      return errorHtml("Diagram could not be drawn.")
    }
  }
  return { name: "physics", nodeRenderers: { physics: render }, css: physicsCss, promptSpec: physicsPromptSpec(options) }
}
