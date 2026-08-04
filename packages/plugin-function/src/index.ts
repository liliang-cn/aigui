import type { AIGuiPlugin, ASTNode, NodeRenderContext, RenderOutput } from "@ai-gui/core"
import { parseFunction } from "./parse"
import { functionPromptSpec } from "./prompt"
import { renderFunctionSVG } from "./render"
import type { FunctionOptions } from "./types"

export { functionPromptSpec } from "./prompt"
export { parseFunction } from "./parse"
export { renderFunctionSVG } from "./render"
export { derivativeAt, evaluateConstant, ExprError, isPlottable, parseExpression } from "./expr"
export type { CompiledExpression } from "./expr"
export { autoView, compileCurves, derivativeCurve, polylines, riemann, sample, tangent } from "./plot"
export type { Curve, Sample, TangentLine } from "./plot"
export type {
  CurveDef,
  Endpoint,
  FunctionDefinition,
  FunctionError,
  FunctionOptions,
  FunctionResult,
  MarkDef,
  Viewport,
} from "./types"

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export const functionCss = [
  "[data-aigui-function-figure]{max-width:100%;margin-block:0.75rem}",
  "[data-aigui-function-figure] svg{display:block;max-width:100%;height:auto}",
  "[data-aigui-function-caption]{margin-top:0.35rem;font-size:0.875rem;opacity:0.75;text-align:center}",
  "[data-aigui-function-loading]{min-height:6rem;border-radius:0.5rem;background:currentColor;opacity:0.06}",
  "[data-aigui-function-error]{padding:0.5rem 0.75rem;border-radius:0.5rem;font-size:0.875rem;opacity:0.8;background:currentColor}",
].join("")

/**
 * Function and calculus figures: the model writes `y = f(x)` and an interval, and the curve, its
 * tangents, the area under it and its Riemann rectangles are computed here.
 *
 * The division of labour is the whole design. A model asked for the slope of a tangent, the value
 * of an integral or the shape of a curve gets them wrong often enough to matter, and a figure drawn
 * from those answers is wrong in a way a student cannot see. Asked only for the expression and the
 * point, its arithmetic never reaches the picture. Sampled points are refused outright for the same
 * reason.
 *
 * Output is a plain SVG string: no plotting library, no canvas, nothing to load. The figure is a
 * pure function of the definition, so it renders the same on a server, in a test and in a browser.
 */
export function fn(options: FunctionOptions = {}): AIGuiPlugin {
  const render = (node: ASTNode, context?: NodeRenderContext): RenderOutput => {
    if (node.complete === false) {
      return { kind: "html", html: '<div data-aigui-function-loading aria-label="Loading figure"></div>' }
    }
    const parsed = parseFunction(node.content ?? "", options)
    if (!parsed.ok) {
      // The reason is shown rather than swallowed: these are the model's mistakes, and a blank box
      // tells neither the reader nor whoever is tuning the prompt anything.
      const message = escapeHtml(parsed.error.message)
      return { kind: "html", html: `<div data-aigui-function-error role="img" aria-label="${message}">${message}</div>`, trusted: true }
    }
    const definition = parsed.value
    let svg: string
    try {
      svg = renderFunctionSVG(definition, options, context?.theme)
    } catch {
      return { kind: "html", html: '<div data-aigui-function-error role="img" aria-label="Figure could not be drawn.">Figure could not be drawn.</div>', trusted: true }
    }
    const caption = definition.caption
      ? `<div data-aigui-function-caption>${escapeHtml(definition.caption)}</div>`
      : ""
    // Built here from the definition, not markup the model wrote: the only strings from the model
    // that reach the page are escaped labels.
    return { kind: "html", html: `<figure data-aigui-function-figure>${svg}${caption}</figure>`, trusted: true }
  }

  return {
    name: "function",
    css: functionCss,
    nodeRenderers: { function: render },
    // A half-written JSON object is not a figure; without this the reader watches a curve redraw as
    // each field lands.
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
    promptSpec: (locale) => functionPromptSpec(locale),
  }
}
