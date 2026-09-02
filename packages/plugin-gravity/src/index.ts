import type { AIGuiPlugin, ASTNode, NodeRenderContext, RenderOutput } from "@ai-gui/core"
import { parseGravity } from "./parse"
import { gravityPromptSpec } from "./prompt"
import { conclusionText, renderGravitySVG, type RenderedGravity } from "./render"
import { simulate } from "./simulate"
import type { GravityOptions } from "./types"

export { gravityPromptSpec } from "./prompt"
export { parseGravity, COLOR_NAMES } from "./parse"
export type { ParsedGravity } from "./parse"
export { simulate, resolveInitial, totalEnergy } from "./simulate"
export { conclusionText, renderGravitySVG, fmt } from "./render"
export type { RenderedGravity } from "./render"
export { UNITS, gravitationalConstant } from "./units"
export type {
  BodyDefinition,
  BodyState,
  CollisionEvent,
  CollisionRule,
  GravityDefinition,
  GravityError,
  GravityOptions,
  GravityResult,
  OrbitSpec,
  Sample,
  Simulation,
  UnitSystem,
  Vec2,
} from "./types"

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export const gravityCss = [
  "[data-aigui-gravity-figure]{max-width:100%;margin-block:0.75rem}",
  "[data-aigui-gravity-figure] svg{display:block;max-width:100%;height:auto;margin-inline:auto}",
  "[data-aigui-gravity-result]{margin-top:0.3rem;font-size:0.9rem;text-align:center;font-weight:600}",
  "[data-aigui-gravity-caption]{margin-top:0.2rem;font-size:0.875rem;opacity:0.7;text-align:center}",
  "[data-aigui-gravity-loading]{min-height:6rem;border-radius:0.5rem;background:currentColor;opacity:0.06}",
  "[data-aigui-gravity-error]{padding:0.5rem 0.75rem;border-radius:0.5rem;font-size:0.875rem;opacity:0.8;background:currentColor}",
].join("")

function failed(message: string): RenderOutput {
  const text = escapeHtml(message)
  return { kind: "html", html: `<div data-aigui-gravity-error role="img" aria-label="${text}">${text}</div>`, trusted: true }
}

/** How long one pass of the animation takes on screen, whatever `duration` is in the scene. */
const LOOP_MS = 10_000

/**
 * Move the bodies along their trails.
 *
 * The trails are already drawn; the animation only moves the circles, so pausing it (or a
 * reader who prefers reduced motion, or a screenshot) still shows the whole story.
 */
function animate(root: HTMLElement, rendered: RenderedGravity): () => void {
  const groups = Array.from(root.querySelectorAll<SVGGElement>("[data-gravity-body]"))
  const circles = groups.map((group) => ({ group, circle: group.querySelector("circle"), label: group.querySelector("text"), index: Number(group.dataset.gravityBody) }))
  const frames = rendered.frames
  if (frames.length < 2 || typeof requestAnimationFrame !== "function") return () => {}
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {}
  let handle = 0
  const start = performance.now()
  const tick = (now: number) => {
    handle = requestAnimationFrame(tick)
    // The first frame's timestamp can precede the `performance.now()` taken at mount, and a
    // negative remainder would index the frame before the first.
    const progress = (Math.max(0, now - start) % LOOP_MS) / LOOP_MS
    const frame = frames[Math.min(frames.length - 1, Math.floor(progress * (frames.length - 1)))]
    for (const { group, circle, label, index } of circles) {
      const p = frame[index]
      if (!p) {
        group.setAttribute("visibility", "hidden")
        continue
      }
      group.removeAttribute("visibility")
      const r = rendered.radii[index]
      circle?.setAttribute("cx", String(p[0]))
      circle?.setAttribute("cy", String(p[1]))
      label?.setAttribute("x", String(p[0] + r + 4))
      label?.setAttribute("y", String(p[1] - r - 2))
    }
  }
  handle = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(handle)
}

/**
 * Gravity and collisions: the model states masses, orbits and speeds, and the trails, the
 * speeds, the periods and the collisions are computed.
 *
 * A leapfrog integrator rather than a physics engine, because the question a lesson asks is the
 * idealised one — point masses, exact Newton, elastic contact — and a symplectic step answers it
 * with an energy error that oscillates instead of growing. The figure is a pure function of its
 * definition: the same block draws the same orbit every time.
 */
export function gravity(options: GravityOptions = {}): AIGuiPlugin {
  const render = (node: ASTNode, context?: NodeRenderContext): RenderOutput => {
    if (node.complete === false) {
      return { kind: "html", html: '<div data-aigui-gravity-loading aria-label="Loading figure"></div>' }
    }
    const parsed = parseGravity(node.content ?? "", options)
    if (!parsed.ok) return failed(parsed.error.message)
    const { definition, initial } = parsed.value
    let rendered: RenderedGravity
    let result: string
    try {
      const simulation = simulate(definition, initial, { maxSteps: options.maxSteps })
      rendered = renderGravitySVG(definition, simulation, options, context?.theme)
      result = conclusionText(definition, simulation, context?.locale)
    } catch {
      return failed("Figure could not be drawn.")
    }
    const caption = definition.caption ? `<div data-aigui-gravity-caption>${escapeHtml(definition.caption)}</div>` : ""
    const html = `<figure data-aigui-gravity-figure>${rendered.svg}<div data-aigui-gravity-result>${escapeHtml(result)}</div>${caption}</figure>`
    if (!definition.animate) return { kind: "html", html, trusted: true }
    return {
      kind: "mount",
      mount: (el) => {
        el.innerHTML = html
        return animate(el, rendered)
      },
    }
  }

  return {
    name: "gravity",
    css: gravityCss,
    nodeRenderers: { gravity: render },
    isBlockComplete: (_type, raw) => {
      const text = raw.trim()
      if (!text.startsWith("{") || !text.endsWith("}")) return false
      try {
        JSON.parse(text)
        return true
      } catch {
        return false
      }
    },
    promptSpec: (locale) => gravityPromptSpec(locale),
  }
}
