import type { AIGuiPlugin, ASTNode, NodeRenderContext, RenderOutput } from "@ai-gui/core"
import { parseMotion } from "./parse"
import { motionPromptSpec } from "./prompt"
import { conclusionText, renderMotionSVG } from "./render"

export { motionPromptSpec } from "./prompt"
export { parseMotion } from "./parse"
export type { MotionError, MotionResultOf } from "./parse"
export { conclusionText, renderMotionSVG } from "./render"
export { G, solve, strobeTimes } from "./motion"
export type { Body, MotionDefinition, MotionKind, MotionResult, Sample } from "./motion"

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export interface MotionOptions {
  width?: number
  height?: number
  maxSourceBytes?: number
}

export const motionCss = [
  "[data-aigui-motion-figure]{max-width:100%;margin-block:0.75rem}",
  "[data-aigui-motion-figure] svg{display:block;max-width:100%;height:auto;margin-inline:auto}",
  "[data-aigui-motion-result]{margin-top:0.3rem;font-size:0.9rem;text-align:center;font-weight:600}",
  "[data-aigui-motion-caption]{margin-top:0.2rem;font-size:0.875rem;opacity:0.7;text-align:center}",
  "[data-aigui-motion-loading]{min-height:6rem;border-radius:0.5rem;background:currentColor;opacity:0.06}",
  "[data-aigui-motion-error]{padding:0.5rem 0.75rem;border-radius:0.5rem;font-size:0.875rem;opacity:0.8;background:currentColor}",
].join("")

/**
 * Mechanics figures: the model gives the initial conditions, and the trajectory, the strobe marks
 * and the numbers underneath are computed from closed forms.
 *
 * Stroboscopic rather than animated, deliberately. It is how a textbook draws motion — equal time
 * intervals, with the spacing showing the acceleration — and it keeps the figure a pure function of
 * its definition. A stepping engine would answer a slightly different question than the idealised
 * one the problem asks, drifting in energy and jittering at rest, which is the kind of plausible
 * wrongness nobody catches.
 */
export function motion(options: MotionOptions = {}): AIGuiPlugin {
  const render = (node: ASTNode, context?: NodeRenderContext): RenderOutput => {
    if (node.complete === false) {
      return { kind: "html", html: '<div data-aigui-motion-loading aria-label="Loading figure"></div>' }
    }
    const parsed = parseMotion(node.content ?? "", options)
    if (!parsed.ok) {
      const message = escapeHtml(parsed.error.message)
      return { kind: "html", html: `<div data-aigui-motion-error role="img" aria-label="${message}">${message}</div>`, trusted: true }
    }
    let svg: string
    let result: string
    try {
      svg = renderMotionSVG(parsed.value, options, context?.theme, context?.locale)
      result = conclusionText(parsed.value, context?.locale)
    } catch {
      return { kind: "html", html: '<div data-aigui-motion-error role="img" aria-label="Figure could not be drawn.">Figure could not be drawn.</div>', trusted: true }
    }
    const caption = parsed.value.caption ? `<div data-aigui-motion-caption>${escapeHtml(parsed.value.caption)}</div>` : ""
    return {
      kind: "html",
      html: `<figure data-aigui-motion-figure>${svg}<div data-aigui-motion-result>${escapeHtml(result)}</div>${caption}</figure>`,
      trusted: true,
    }
  }

  return {
    name: "motion",
    css: motionCss,
    nodeRenderers: { motion: render },
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
    promptSpec: (locale) => motionPromptSpec(locale),
  }
}
