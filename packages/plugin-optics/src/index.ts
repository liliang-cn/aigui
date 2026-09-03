import type { AIGuiPlugin, ASTNode, NodeRenderContext, RenderOutput } from "@ai-gui/core"
import { parseOptics } from "./parse"
import { opticsPromptSpec } from "./prompt"
import { conclusionText, renderOpticsSVG } from "./render"
import type { OpticsOptions } from "./types"

export { opticsPromptSpec } from "./prompt"
export { parseOptics } from "./parse"
export { conclusionText, renderOpticsSVG } from "./render"
export { focalPoints, imageOf, lensRays, mirrorRays, refract } from "./optics"
export type { ImageResult, ImagingElement, Point, Ray, RefractionResult } from "./optics"
export type { OpticsDefinition, OpticsElement, OpticsError, OpticsOptions, OpticsResult } from "./types"

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export const opticsCss = [
  "[data-aigui-optics-figure]{max-width:100%;margin-block:0.75rem}",
  "[data-aigui-optics-figure] svg{display:block;max-width:100%;height:auto;margin-inline:auto}",
  "[data-aigui-optics-conclusion]{margin-top:0.3rem;font-size:0.9rem;text-align:center;font-weight:600}",
  "[data-aigui-optics-caption]{margin-top:0.2rem;font-size:0.875rem;opacity:0.7;text-align:center}",
  "[data-aigui-optics-loading]{min-height:6rem;border-radius:0.5rem;background:currentColor;opacity:0.06}",
  ":where([data-aigui-optics-error]){padding:0.5rem 0.75rem;border-radius:0.5rem;font-size:0.875rem;background:color-mix(in srgb,currentColor 8%,transparent);border:1px solid color-mix(in srgb,currentColor 25%,transparent)}",
].join("")

/**
 * Ray-optics figures: the model names the element and the object, and the image, the rays and the
 * conclusion are computed here.
 *
 * The conclusion under the figure is the part that makes this different from the other two figure
 * plugins. Where the image lands is one thing a model gets wrong; saying "倒立缩小实像" when it is
 * upright and enlarged is worse, because that sentence is what a reader takes away. It is generated
 * from the same numbers the rays are drawn from, so the two cannot disagree.
 */
export function optics(options: OpticsOptions = {}): AIGuiPlugin {
  const render = (node: ASTNode, context?: NodeRenderContext): RenderOutput => {
    if (node.complete === false) {
      return { kind: "html", html: '<div data-aigui-optics-loading aria-label="Loading figure"></div>' }
    }
    const parsed = parseOptics(node.content ?? "", options)
    if (!parsed.ok) {
      const message = escapeHtml(parsed.error.message)
      return { kind: "html", html: `<div data-aigui-optics-error role="img" aria-label="${message}">${message}</div>`, trusted: true }
    }
    const definition = parsed.value
    let svg: string
    let conclusion: string
    try {
      svg = renderOpticsSVG(definition, options, context?.theme, context?.locale)
      conclusion = conclusionText(definition, context?.locale)
    } catch {
      return { kind: "html", html: '<div data-aigui-optics-error role="img" aria-label="Figure could not be drawn.">Figure could not be drawn.</div>', trusted: true }
    }
    const caption = definition.caption ? `<div data-aigui-optics-caption>${escapeHtml(definition.caption)}</div>` : ""
    return {
      kind: "html",
      html: `<figure data-aigui-optics-figure>${svg}<div data-aigui-optics-conclusion>${escapeHtml(conclusion)}</div>${caption}</figure>`,
      trusted: true,
    }
  }

  return {
    name: "optics",
    css: opticsCss,
    nodeRenderers: { optics: render },
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
    promptSpec: (locale) => opticsPromptSpec(locale),
  }
}
