import { translate, type MessageBundle } from "@ai-gui/core"
import { solve, strobeTimes, type MotionDefinition, type Sample } from "./motion"

const LABELS: MessageBundle = {
  en: {
    range: "range", apex: "maximum height", flightTime: "flight time", fallTime: "time to fall",
    impactSpeed: "speed on landing", displacement: "displacement", finalSpeed: "final speed",
    elapsed: "time taken", frequency: "frequency", maxSpeed: "maximum speed",
    maxAcceleration: "maximum acceleration", speed: "speed", angularSpeed: "angular speed",
    centripetal: "centripetal acceleration", momentum: "momentum", energyBefore: "kinetic energy before",
    energyAfter: "kinetic energy after", before: "before", after: "after", lost: "kinetic energy is not conserved",
  },
  "zh-CN": {
    range: "射程", apex: "最大高度", flightTime: "飞行时间", fallTime: "下落时间",
    impactSpeed: "落地速度", displacement: "位移", finalSpeed: "末速度",
    elapsed: "历时", frequency: "频率", maxSpeed: "最大速度",
    maxAcceleration: "最大加速度", speed: "线速度", angularSpeed: "角速度",
    centripetal: "向心加速度", momentum: "动量", energyBefore: "碰前动能",
    energyAfter: "碰后动能", before: "碰前", after: "碰后", lost: "动能不守恒",
  },
}

const round = (n: number): number => Math.round(n * 100) / 100

/**
 * The line under the figure, written from the solved motion.
 *
 * The range and the flight time are what a question asks for and what a model answers from memory.
 * Computed from the same numbers the trajectory is drawn from, this line cannot disagree with the
 * curve above it.
 */
export function conclusionText(definition: MotionDefinition, locale?: string): string {
  const t = (key: string) => translate(LABELS, locale, key)
  const result = solve(definition)
  const separator = locale?.startsWith("zh") ? "，" : ", "
  const parts = result.quantities.map((q) => `${t(q.key)} ${round(q.value)} ${q.unit}`)
  if (definition.motion === "collision" && result.after) {
    const [a, b] = result.after
    const velocities = `${t("after")} ${round(a)} m/s / ${round(b)} m/s`
    const [before, afterEnergy] = [result.quantities[1].value, result.quantities[2].value]
    const note = afterEnergy < before - 1e-9 ? `${separator}${t("lost")}` : ""
    return `${velocities}${separator}${parts.slice(0, 1).join(separator)}${note}`
  }
  return parts.join(separator)
}

function palette(theme?: string) {
  return theme === "dark"
    ? { axis: "#52525b", grid: "#3f3f46", text: "#d4d4d8", path: "#38bdf8", strobe: "#f472b6", vector: "#fbbf24", body: "#a3e635" }
    : { axis: "#a1a1aa", grid: "#e4e4e7", text: "#3f3f46", path: "#0369a1", strobe: "#be185d", vector: "#b45309", body: "#4d7c0f" }
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** Render one definition to a standalone SVG string. */
export function renderMotionSVG(definition: MotionDefinition, options: { width?: number; height?: number } = {}, theme?: string, locale?: string): string {
  const width = options.width ?? 640
  const height = options.height ?? 320
  const c = palette(theme)
  const result = solve(definition)
  const show = definition.show ?? ["trajectory", "strobe"]
  const parts: string[] = []
  const marker = `<marker id="mv" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${c.vector}"/></marker>`

  if (definition.motion === "collision") {
    const [a, b] = definition.bodies!
    const after = result.after!
    const rows: Array<[string, number, number]> = [
      [translate(LABELS, locale, "before"), a.speed, b.speed],
      [translate(LABELS, locale, "after"), after[0], after[1]],
    ]
    const scale = 26 / Math.max(1, Math.max(...[a.speed, b.speed, ...after].map(Math.abs)))
    rows.forEach(([name, va, vb], row) => {
      const y = 90 + row * 120
      parts.push(`<text x="24" y="${y - 34}" fill="${c.text}" font-size="13">${escapeHtml(name)}</text>`)
      parts.push(`<line x1="24" y1="${y + 26}" x2="${width - 24}" y2="${y + 26}" stroke="${c.axis}" stroke-width="1"/>`)
      const stuck = definition.kind === "inelastic" && row === 1
      const centres = stuck ? [width * 0.5 - 22, width * 0.5 + 22] : [width * 0.34, width * 0.66]
      for (const [i, [body, v]] of ([[a, va], [b, vb]] as Array<[{ mass: number }, number]>).entries()) {
        const r = 12 + Math.cbrt(body.mass) * 7
        const cx = centres[i]
        parts.push(`<circle cx="${round(cx)}" cy="${y}" r="${round(r)}" fill="${c.body}" fill-opacity="0.25" stroke="${c.body}" stroke-width="2"/>`)
        parts.push(`<text x="${round(cx)}" y="${y + 5}" fill="${c.text}" font-size="12" text-anchor="middle">${body.mass} kg</text>`)
        if (Math.abs(v) > 1e-9) {
          const to = cx + Math.sign(v) * (r + Math.abs(v) * scale)
          parts.push(`<line x1="${round(cx + Math.sign(v) * r)}" y1="${y}" x2="${round(to)}" y2="${y}" stroke="${c.vector}" stroke-width="2.5" marker-end="url(#mv)"/>`)
          parts.push(`<text x="${round(to)}" y="${y - 12}" fill="${c.vector}" font-size="12" text-anchor="middle">${round(v)} m/s</text>`)
        } else {
          parts.push(`<text x="${round(cx)}" y="${y - 22}" fill="${c.text}" font-size="11" text-anchor="middle">v = 0</text>`)
        }
      }
    })
  } else {
    // One scale for both axes so a trajectory keeps its shape.
    const times = strobeTimes(result.duration, definition.strobe)
    const dense = Array.from({ length: 200 }, (_, i) => result.samples((result.duration * i) / 199))
    const xs = dense.map((s) => s.x)
    const ys = dense.map((s) => s.y)
    const minX = Math.min(...xs, 0)
    const maxX = Math.max(...xs, 0)
    const minY = Math.min(...ys, 0)
    const maxY = Math.max(...ys, 0)
    const padX = Math.max((maxX - minX) * 0.08, 0.5)
    const padY = Math.max((maxY - minY) * 0.14, 0.5)
    const scale = Math.min((width - 70) / (maxX - minX + 2 * padX), (height - 60) / (maxY - minY + 2 * padY))
    // Both axes share one scale, so a trajectory keeps its shape — which means one of the two
    // directions usually has slack left over. Centring in that direction is what stops a vertical
    // fall, a circle or an oscillation from hugging the left edge of an otherwise empty canvas.
    const drawnWidth = (maxX - minX) * scale
    const drawnHeight = (maxY - minY) * scale
    const originX = Math.max(46, (width - drawnWidth) / 2) - minX * scale
    const originY = height - Math.max(34, (height - drawnHeight) / 2) + minY * scale
    const px = (s: { x: number; y: number }) => `${round(originX + s.x * scale)},${round(originY - s.y * scale)}`

    // The ground, or the axis the motion happens along.
    parts.push(`<line x1="24" y1="${round(originY)}" x2="${width - 24}" y2="${round(originY)}" stroke="${c.axis}" stroke-width="1.5"/>`)

    if (show.includes("trajectory")) {
      parts.push(`<polyline points="${dense.map(px).join(" ")}" fill="none" stroke="${c.path}" stroke-width="2"/>`)
    }
    if (show.includes("strobe")) {
      for (const time of times) {
        const s = result.samples(time)
        parts.push(`<circle cx="${round(originX + s.x * scale)}" cy="${round(originY - s.y * scale)}" r="4" fill="${c.strobe}"/>`)
      }
      // Equal intervals are the lesson: the spacing is what shows the acceleration.
      const step = times.length > 1 ? times[1] - times[0] : result.duration
      parts.push(`<text x="${width - 24}" y="20" fill="${c.text}" font-size="11" text-anchor="end">Δt = ${round(step)} s</text>`)
    }
    if (show.includes("vectors")) {
      for (const time of times.filter((_, i) => i % 2 === 0)) {
        const s: Sample = result.samples(time)
        const speed = Math.hypot(s.vx, s.vy)
        if (speed < 1e-9) continue
        const length = Math.min(38, 8 + speed * 1.6)
        const to = { x: originX + s.x * scale + (s.vx / speed) * length, y: originY - s.y * scale - (s.vy / speed) * length }
        parts.push(`<line x1="${round(originX + s.x * scale)}" y1="${round(originY - s.y * scale)}" x2="${round(to.x)}" y2="${round(to.y)}" stroke="${c.vector}" stroke-width="1.6" marker-end="url(#mv)"/>`)
      }
    }
  }

  const described = conclusionText(definition, locale)
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"`,
    ` role="img" aria-label="${escapeHtml(described)}" data-aigui-motion="${definition.motion}">`,
    `<defs>${marker}</defs>`,
    parts.join(""),
    "</svg>",
  ].join("")
}
