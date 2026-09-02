import { translate, type MessageBundle } from "@ai-gui/core"
import type { GravityDefinition, Simulation, Vec2 } from "./types"
import { UNITS } from "./units"

const LABELS: MessageBundle = {
  en: {
    speed: "orbital speed", period: "period", twoBody: "two-body", merged: "{a} and {b} collided and merged into {into}",
    bounced: "{a} and {b} bounced", more: "and {n} more", drift: "energy drift", truncated: "stopped early at t = {t} (step limit)",
    at: "t = ",
  },
  "zh-CN": {
    speed: "轨道速度", period: "周期", twoBody: "二体", merged: "{a} 与 {b} 相撞，合并为 {into}",
    bounced: "{a} 与 {b} 碰撞弹开", more: "另有 {n} 次", drift: "能量漂移", truncated: "在 t = {t} 提前结束（步数超限）",
    at: "t = ",
  },
}

/** Three significant figures, without the noise a raw double carries. */
export function fmt(value: number): string {
  if (value === 0) return "0"
  const magnitude = Math.abs(value)
  if (magnitude >= 1e5 || magnitude < 1e-3) return value.toExponential(2).replace(/\.?0+e/, "e")
  return String(Number(value.toPrecision(3)))
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "")
}

/**
 * The line under the figure: what was computed from the conditions.
 *
 * The orbital speed and the period are what a question asks for and what a model would answer
 * from memory. Computed from the same numbers the trails are drawn from, this line cannot
 * disagree with the picture above it. The energy drift is there for the same reason a lab
 * report has an error bar: it says how far the picture can be trusted.
 */
export function conclusionText(definition: GravityDefinition, simulation: Simulation, locale?: string): string {
  const t = (key: string) => translate(LABELS, locale, key)
  const units = UNITS[definition.units]
  const zh = locale?.startsWith("zh") === true
  const sep = zh ? "；" : "; "
  const colon = zh ? "：" : ": "
  const unit = (u: string) => (u ? ` ${u}` : "")
  const parts: string[] = []
  for (const body of simulation.initial) {
    if (!body.orbit) continue
    const multi = simulation.initial.filter((other) => other.mass > 0).length > 2
    const periodLabel = multi ? `${t("period")}(${t("twoBody")})` : t("period")
    parts.push(`${body.id}${colon}${t("speed")} ${fmt(body.orbit.speed)}${unit(units.speed)}, ${periodLabel} ${fmt(body.orbit.period)}${unit(units.time)}`.replace(", ", zh ? "，" : ", "))
  }
  const shown = simulation.events.slice(0, 4)
  for (const event of shown) {
    const text = event.rule === "merge" ? fill(t("merged"), { a: event.a, b: event.b, into: event.into ?? event.a }) : fill(t("bounced"), { a: event.a, b: event.b })
    parts.push(`${t("at")}${fmt(event.time)}${unit(units.time)}${colon}${text}`)
  }
  if (simulation.events.length > shown.length) parts.push(fill(t("more"), { n: String(simulation.events.length - shown.length) }))
  if (!simulation.events.some((event) => event.rule === "merge") && simulation.initial.filter((body) => body.mass > 0).length >= 2) {
    parts.push(`${t("drift")} ${fmt(simulation.energy.drift * 100)}%`)
  }
  if (simulation.truncated) parts.push(fill(t("truncated"), { t: fmt(simulation.samples[simulation.samples.length - 1].time) }))
  return parts.join(sep)
}

function palette(theme?: string) {
  return theme === "dark"
    ? { text: "#d4d4d8", grid: "#3f3f46", bodies: ["#38bdf8", "#fbbf24", "#a3e635", "#f472b6", "#c084fc", "#2dd4bf", "#fb923c", "#818cf8"] }
    : { text: "#3f3f46", grid: "#e4e4e7", bodies: ["#0369a1", "#b45309", "#4d7c0f", "#be185d", "#7c3aed", "#0f766e", "#c2410c", "#4338ca"] }
}

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const px = (n: number): string => String(Math.round(n * 100) / 100)

export interface RenderedGravity {
  svg: string
  /** Every body's pixel position at every sample, `null` once merged away, for the animation. */
  frames: Array<Array<[number, number] | null>>
  /** Pixel radius of each body, matching the circles in the SVG. */
  radii: number[]
}

/** Draw the trails and the final positions; the animation moves the same circles along the same trails. */
export function renderGravitySVG(definition: GravityDefinition, simulation: Simulation, options: { width?: number; height?: number } = {}, theme?: string): RenderedGravity {
  const width = options.width ?? 640
  const height = options.height ?? 400
  const c = palette(theme)
  const pad = 28

  // Frame from everything that was ever drawn — a comet's far apoapsis included — so nothing
  // leaves the picture, plus the bodies' own radii where they have one.
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const sample of simulation.samples) {
    sample.positions.forEach((position, index) => {
      if (!position) return
      const r = simulation.initial[index].radius ?? 0
      minX = Math.min(minX, position[0] - r)
      maxX = Math.max(maxX, position[0] + r)
      minY = Math.min(minY, position[1] - r)
      maxY = Math.max(maxY, position[1] + r)
    })
  }
  if (!Number.isFinite(minX)) {
    minX = -1
    maxX = 1
    minY = -1
    maxY = 1
  }
  const spanX = Math.max(maxX - minX, 1e-9)
  const spanY = Math.max(maxY - minY, 1e-9)
  const span = Math.max(spanX, spanY)
  const scale = Math.min((width - 2 * pad) / span, (height - 2 * pad) / span)
  const centreX = (minX + maxX) / 2
  const centreY = (minY + maxY) / 2
  const toPx = (p: Vec2): [number, number] => [width / 2 + (p[0] - centreX) * scale, height / 2 - (p[1] - centreY) * scale]

  const maxMass = Math.max(...simulation.initial.map((body) => body.mass), 0)
  const radii = simulation.initial.map((body) => {
    if (body.radius) return Math.max(2.5, body.radius * scale)
    // No radius given: size by mass so a star reads as a star, but never a dot too small to see.
    return maxMass > 0 && body.mass > 0 ? 3 + 6 * Math.cbrt(body.mass / maxMass) : 2.5
  })
  const colourOf = (index: number) => simulation.initial[index].color ?? c.bodies[index % c.bodies.length]

  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeHtml(definition.caption ?? "gravity")}">`)

  // A scale bar, because "how far apart" is what the picture is for and the units are not on the axes.
  const nice = Math.pow(10, Math.floor(Math.log10(span / 3)))
  const barUnits = [1, 2, 5].map((k) => k * nice).reduce((best, k) => (Math.abs(k * scale - width / 5) < Math.abs(best * scale - width / 5) ? k : best))
  const barPx = barUnits * scale
  const unitLabel = UNITS[definition.units].length
  parts.push(`<line x1="${px(pad)}" y1="${px(height - pad / 2)}" x2="${px(pad + barPx)}" y2="${px(height - pad / 2)}" stroke="${c.text}" stroke-width="1.5"/>`)
  parts.push(`<text x="${px(pad + barPx + 6)}" y="${px(height - pad / 2 + 4)}" fill="${c.text}" font-size="11" font-family="ui-sans-serif, system-ui, sans-serif">${fmt(barUnits)}${unitLabel ? ` ${escapeHtml(unitLabel)}` : ""}</text>`)

  if (definition.trails) {
    simulation.initial.forEach((_, index) => {
      // Broken where the body stops existing, so a merged body's trail ends at the collision.
      const runs: string[] = []
      let run: string[] = []
      for (const sample of simulation.samples) {
        const p = sample.positions[index]
        if (!p) {
          if (run.length) runs.push(run.join(" "))
          run = []
          continue
        }
        const [x, y] = toPx(p)
        const point = `${px(x)},${px(y)}`
        // A body that does not move (the Sun, a fixed wall) would otherwise be 600 copies of one point.
        if (run[run.length - 1] !== point) run.push(point)
      }
      if (run.length) runs.push(run.join(" "))
      for (const points of runs) {
        parts.push(`<polyline points="${points}" fill="none" stroke="${colourOf(index)}" stroke-width="1.4" stroke-opacity="0.65" stroke-linejoin="round"/>`)
      }
    })
  }

  const frames = simulation.samples.map((sample) => sample.positions.map((p) => (p ? toPx(p) : null)))
  const last = frames[frames.length - 1]
  simulation.initial.forEach((body, index) => {
    const p = last[index]
    if (!p) return
    const r = radii[index]
    const cross = simulation.final[index].fixed ? `<line x1="${px(p[0] - r - 3)}" y1="${px(p[1])}" x2="${px(p[0] + r + 3)}" y2="${px(p[1])}" stroke="${c.text}" stroke-width="1"/><line x1="${px(p[0])}" y1="${px(p[1] - r - 3)}" x2="${px(p[0])}" y2="${px(p[1] + r + 3)}" stroke="${c.text}" stroke-width="1"/>` : ""
    parts.push(`<g data-gravity-body="${index}">${cross}<circle cx="${px(p[0])}" cy="${px(p[1])}" r="${px(r)}" fill="${colourOf(index)}"/><text x="${px(p[0] + r + 4)}" y="${px(p[1] - r - 2)}" fill="${c.text}" font-size="12" font-family="ui-sans-serif, system-ui, sans-serif">${escapeHtml(body.id)}</text></g>`)
  })
  parts.push("</svg>")
  return { svg: parts.join(""), frames, radii }
}
