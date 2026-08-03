import type { AIGuiPlugin, ASTNode, NodeRenderContext, RenderOutput } from "@ai-gui/core"
import { parseSolid } from "./parse"
import { solidPromptSpec } from "./prompt"
import type { SolidOptions } from "./types"

export { solidPromptSpec } from "./prompt"
export { parseSolid } from "./parse"
export type { ParsedSolid } from "./parse"
export { buildFigure, resolvePoints, sectionPolygon } from "./geometry"
export type {
  Figure,
  HighlightDef,
  PointDef,
  SegmentDef,
  ShowFlag,
  SolidDefinition,
  SolidError,
  SolidKind,
  SolidOptions,
  SolidResult,
  Vec3,
} from "./types"

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

function loading(): RenderOutput {
  return { kind: "html", html: '<div data-aigui-solid-loading aria-label="Loading figure"></div>' }
}

/**
 * What a figure that cannot be drawn looks like.
 *
 * The reason is shown rather than swallowed: these are the model's mistakes, and a blank box tells
 * neither the reader nor whoever is tuning the prompt anything. It is never the model's own markup
 * — the message is this plugin's, escaped.
 */
function failed(message: string): RenderOutput {
  return {
    kind: "html",
    html: `<div data-aigui-solid-error role="img" aria-label="${escapeHtml(message)}">${escapeHtml(message)}</div>`,
    trusted: true,
  }
}

export const solidCss = [
  "[data-aigui-solid]{max-width:100%;margin-block:0.75rem}",
  "[data-aigui-solid] canvas{display:block;max-width:100%;touch-action:none;cursor:grab}",
  "[data-aigui-solid] canvas:active{cursor:grabbing}",
  "[data-aigui-solid-caption]{margin-top:0.35rem;font-size:0.875rem;opacity:0.75;text-align:center}",
  "[data-aigui-solid-loading]{min-height:6rem;border-radius:0.5rem;background:currentColor;opacity:0.06}",
  "[data-aigui-solid-error]{padding:0.5rem 0.75rem;border-radius:0.5rem;font-size:0.875rem;opacity:0.8;background:currentColor}",
].join("")

/**
 * Solid-geometry figures for teaching: the model names a solid and the conditions on it, and the
 * figure is computed from those.
 *
 * The protocol is the textbook's own vocabulary — 正方体 ABCD-A1B1C1D1, 过 A、B1、D1 的截面 — rather
 * than a mesh, because that is the notation a model is fluent in. It also keeps the model's
 * arithmetic out of the picture: it supplies the three points, the section polygon is computed
 * here, and a model that would have miscounted the sides cannot draw a wrong figure.
 */
export function solid(options: SolidOptions = {}): AIGuiPlugin {
  const height = options.height ?? 320
  const render = async (node: ASTNode, context?: NodeRenderContext): Promise<RenderOutput> => {
    if (node.complete === false) return loading()
    const parsed = parseSolid(node.content ?? "", options)
    if (!parsed.ok) return failed(parsed.error.message)
    const { definition, figure } = parsed.value
    return {
      kind: "mount",
      mount: (el) => {
        el.setAttribute("data-aigui-solid", definition.solid)
        const canvasHost = document.createElement("div")
        el.appendChild(canvasHost)
        if (definition.caption) {
          const caption = document.createElement("div")
          caption.setAttribute("data-aigui-solid-caption", "")
          caption.textContent = definition.caption
          el.appendChild(caption)
        }
        let mounted: { destroy(): void } | undefined
        let disposed = false
        void import("./render")
          .then(({ mountFigure }) => mountFigure(canvasHost, definition, figure, { height, theme: context?.theme }))
          .then((figureHandle) => {
            // Torn down while the engine was still loading: nothing on screen should own a WebGL
            // context that no longer has a home.
            if (disposed) figureHandle.destroy()
            else mounted = figureHandle
          })
          .catch(() => {
            canvasHost.replaceChildren()
            canvasHost.innerHTML = failedHtml("Figure could not be drawn.")
          })
        return () => {
          disposed = true
          mounted?.destroy()
        }
      },
    }
  }

  return {
    name: "solid",
    css: solidCss,
    nodeRenderers: { solid: render },
    // A half-streamed JSON object is not a figure; without this the reader watches a cube appear
    // one field at a time and jump as each one lands.
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
    promptSpec: (locale) => solidPromptSpec(locale),
  }
}

function failedHtml(message: string): string {
  return `<div data-aigui-solid-error role="img" aria-label="${escapeHtml(message)}">${escapeHtml(message)}</div>`
}
