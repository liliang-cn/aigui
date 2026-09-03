import type { AIGuiPlugin, ASTNode, NodeRenderContext, RenderOutput } from "@ai-gui/core"
import { parseFunction } from "./parse"
import { functionPromptSpec } from "./prompt"
import { initialScope } from "./plot"
import { renderFunctionSVG } from "./render"
import type { FunctionOptions } from "./types"

export { functionPromptSpec } from "./prompt"
export { parseFunction } from "./parse"
export { renderFunctionSVG } from "./render"
export { derivativeAt, evaluateConstant, ExprError, isPlottable, parseExpression } from "./expr"
export type { CompiledExpression } from "./expr"
export { autoView, compileCurves, derivativeCurve, initialScope, polylines, riemann, sample, tangent } from "./plot"
export type { Curve, Sample, TangentLine } from "./plot"
export type {
  CurveDef,
  Endpoint,
  FunctionDefinition,
  FunctionError,
  FunctionOptions,
  FunctionResult,
  MarkDef,
  ParamDef,
  Viewport,
} from "./types"

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export const functionCss = [
  "[data-aigui-function-params]{display:flex;flex-wrap:wrap;gap:0.75rem;justify-content:center;margin-top:0.4rem}",
  "[data-aigui-function-param]{display:flex;align-items:center;gap:0.4rem;font-size:0.8125rem}",
  "[data-aigui-function-param] input{width:9rem}",
  "[data-aigui-function-param] output{min-width:3.2rem;font-variant-numeric:tabular-nums;opacity:0.8}",
  "[data-aigui-function-figure]{max-width:100%;margin-block:0.75rem}",
  "[data-aigui-function-figure] svg{display:block;max-width:100%;height:auto}",
  "[data-aigui-function-caption]{margin-top:0.35rem;font-size:0.875rem;opacity:0.75;text-align:center}",
  "[data-aigui-function-loading]{min-height:6rem;border-radius:0.5rem;background:currentColor;opacity:0.06}",
  ":where([data-aigui-function-error]){padding:0.5rem 0.75rem;border-radius:0.5rem;font-size:0.875rem;background:color-mix(in srgb,currentColor 8%,transparent);border:1px solid color-mix(in srgb,currentColor 25%,transparent)}",
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
    const draw = (scope?: Record<string, number>) => renderFunctionSVG(definition, options, context?.theme, scope)
    let svg: string
    try {
      svg = draw()
    } catch {
      return { kind: "html", html: '<div data-aigui-function-error role="img" aria-label="Figure could not be drawn.">Figure could not be drawn.</div>', trusted: true }
    }
    const caption = definition.caption
      ? `<div data-aigui-function-caption>${escapeHtml(definition.caption)}</div>`
      : ""

    // A figure with no parameters stays a plain string, which is what keeps it server-renderable,
    // exportable and byte-identical between runs. Only a figure that asks for a slider needs a
    // living element, and even then every frame is `draw(values)` — a pure function of the
    // definition and one number per parameter, so any position is reproducible from that number.
    if (definition.params && definition.params.length > 0) {
      const params = definition.params
      return {
        kind: "mount",
        mount: (el) => {
          el.setAttribute("data-aigui-function-figure", "")
          const figure = document.createElement("div")
          figure.innerHTML = svg
          el.appendChild(figure)
          const scope = initialScope(definition)
          const controls = document.createElement("div")
          controls.setAttribute("data-aigui-function-params", "")
          const cleanups: Array<() => void> = []
          for (const param of params) {
            const wrap = document.createElement("label")
            wrap.setAttribute("data-aigui-function-param", "")
            const name = document.createElement("span")
            name.textContent = param.label ?? param.id
            const input = document.createElement("input")
            input.type = "range"
            input.min = String(param.from)
            input.max = String(param.to)
            input.step = String(param.step ?? (param.to - param.from) / 100)
            input.value = String(scope[param.id])
            const readout = document.createElement("output")
            readout.textContent = String(Math.round(scope[param.id] * 1000) / 1000)
            const onInput = () => {
              scope[param.id] = Number(input.value)
              readout.textContent = String(Math.round(scope[param.id] * 1000) / 1000)
              try {
                figure.innerHTML = draw(scope)
              } catch {
                // A value that makes the figure undrawable leaves the last good frame on screen
                // rather than blanking it mid-drag.
              }
            }
            input.addEventListener("input", onInput)
            cleanups.push(() => input.removeEventListener("input", onInput))
            wrap.append(name, input, readout)
            controls.appendChild(wrap)
          }
          el.appendChild(controls)
          if (definition.caption) {
            const text = document.createElement("div")
            text.setAttribute("data-aigui-function-caption", "")
            text.textContent = definition.caption
            el.appendChild(text)
          }
          return () => { for (const off of cleanups) off() }
        },
      }
    }

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
