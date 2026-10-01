import type { AIGuiPlugin, ASTNode, NodeRenderContext, RenderOutput } from "@ai-gui/core"
import { parseScene } from "./parse"
import { scenePromptSpec } from "./prompt"
import type { SceneOptions } from "./types"

export { scenePromptSpec } from "./prompt"
export { parseScene, modelOriginAllowed, COLOR_NAMES } from "./parse"
export { sceneBounds, centerOf, halfExtents, framingDistance } from "./bounds"
export { sceneStateAt } from "./steps"
export { layoutLabels, LABEL_FONT_PX, type LabelRequest, type PlacedLabel, type Rect } from "./labels"
export type {
  Anchor,
  Bounds,
  LabelSide,
  SceneStep,
  Material,
  ParsedScene,
  RefusedModel,
  SceneCamera,
  SceneDefinition,
  SceneError,
  SceneObject,
  SceneOptions,
  SceneResult,
  ShapeKind,
  Vec3,
} from "./types"

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

function loading(): RenderOutput {
  return { kind: "html", html: '<div data-aigui-scene-loading aria-label="Loading scene"></div>' }
}

function failedHtml(message: string): string {
  return `<div data-aigui-scene-error role="img" aria-label="${escapeHtml(message)}">${escapeHtml(message)}</div>`
}

/**
 * What a scene that cannot be built looks like.
 *
 * The reason is shown rather than swallowed: these are the model's mistakes, and a blank box tells
 * neither the reader nor whoever is tuning the prompt anything. It is never the model's own markup
 * — the message is this plugin's, escaped.
 */
function failed(message: string): RenderOutput {
  return { kind: "html", html: failedHtml(message), trusted: true }
}

/**
 * The bar under a scene that plays its steps: back, pause, forward, where it is, what is happening.
 * Plays on its own, looping; a reader who steps by hand pauses it.
 */
function playSteps(el: HTMLElement, captions: string[], stepMs: number, show: (index: number) => void): () => void {
  const bar = document.createElement("div")
  bar.setAttribute("data-aigui-scene-bar", "")
  const button = (text: string, name: string) => {
    const b = document.createElement("button")
    b.type = "button"
    b.textContent = text
    b.setAttribute("aria-label", name)
    bar.appendChild(b)
    return b
  }
  const back = button("◀", "Previous step")
  const play = button("⏸", "Pause")
  const next = button("▶", "Next step")
  const count = document.createElement("span")
  count.setAttribute("data-count", "")
  const caption = document.createElement("span")
  caption.setAttribute("data-caption", "")
  bar.append(count, caption)
  el.appendChild(bar)

  let index = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let playing = true
  const go = (to: number) => {
    index = (to + captions.length) % captions.length
    show(index)
    count.textContent = `${index + 1}/${captions.length}`
    caption.textContent = captions[index]
    clearTimeout(timer)
    if (playing) timer = setTimeout(() => go(index + 1), stepMs)
  }
  const pause = () => {
    playing = false
    play.textContent = "⏵"
    play.setAttribute("aria-label", "Play")
  }
  back.onclick = () => {
    pause()
    go(index - 1)
  }
  next.onclick = () => {
    pause()
    go(index + 1)
  }
  play.onclick = () => {
    playing = !playing
    play.textContent = playing ? "⏸" : "⏵"
    play.setAttribute("aria-label", playing ? "Pause" : "Play")
    go(playing ? index + 1 : index)
  }
  go(0)
  return () => clearTimeout(timer)
}

export const sceneCss = [
  "[data-aigui-scene]{max-width:100%;margin-block:0.75rem}",
  "[data-aigui-scene] canvas{display:block;max-width:100%;touch-action:none;cursor:grab}",
  "[data-aigui-scene] canvas:active{cursor:grabbing}",
  "[data-aigui-scene-caption]{margin-top:0.35rem;font-size:0.875rem;opacity:0.75;text-align:center}",
  "[data-aigui-scene-loading]{min-height:6rem;border-radius:0.5rem;background:currentColor;opacity:0.06}",
  ":where([data-aigui-scene-error]){padding:0.5rem 0.75rem;border-radius:0.5rem;font-size:0.875rem;background:color-mix(in srgb,currentColor 8%,transparent);border:1px solid color-mix(in srgb,currentColor 25%,transparent)}",
  "[data-aigui-scene-model-error]{margin-top:0.25rem;font-size:0.8rem;opacity:0.7}",
  "[data-aigui-scene-steps]{margin:0.5rem 0 0;padding-left:1.4rem;font-size:0.875rem}",
  "[data-aigui-scene-bar]{display:flex;align-items:center;gap:0.5rem;margin-top:0.5rem;font-size:0.875rem}",
  "[data-aigui-scene-bar] button{font:inherit;border:1px solid color-mix(in srgb,currentColor 25%,transparent);background:transparent;color:inherit;border-radius:6px;padding:0.1rem 0.55rem;cursor:pointer}",
  "[data-aigui-scene-bar] [data-count]{opacity:0.6;font-variant-numeric:tabular-nums}",
].join("")

/**
 * 3D scenes the model builds from primitives — and, where the host allows it, from glTF files.
 *
 * The protocol is a flat list of placed shapes rather than a scene graph, because a model writes a
 * flat list correctly far more often than it nests transforms; `anchor: "bottom"` and a `model`
 * file's `size` take the two sums it most often got wrong out of its hands. Nothing in a fence can
 * make the page fetch anything: a `model` URL is refused unless its exact origin is in
 * `allowedModelOrigins`, which only the host sets.
 */
export function scene(options: SceneOptions = {}): AIGuiPlugin {
  const height = options.height ?? 360
  const animate = options.animate ?? true
  const stepMs = options.stepMs ?? 2600
  const render = async (node: ASTNode, context?: NodeRenderContext): Promise<RenderOutput> => {
    if (node.complete === false) return loading()
    const parsed = parseScene(node.content ?? "", options)
    if (!parsed.ok) return failed(parsed.error.message)
    const { definition, refused } = parsed.value
    return {
      kind: "mount",
      mount: (el) => {
        el.setAttribute("data-aigui-scene", String(definition.objects.length))
        const canvasHost = document.createElement("div")
        el.appendChild(canvasHost)
        if (definition.caption) {
          const caption = document.createElement("div")
          caption.setAttribute("data-aigui-scene-caption", "")
          caption.textContent = definition.caption
          el.appendChild(caption)
        }
        for (const model of refused) {
          const line = document.createElement("div")
          line.setAttribute("data-aigui-scene-model-error", "")
          line.textContent = model.message
          el.appendChild(line)
        }
        let mounted: { destroy(): void } | undefined
        let disposed = false
        void import("./render")
          .then(({ mountScene }) =>
            mountScene(canvasHost, definition, {
              height,
              theme: context?.theme,
              onModelError: (object) => {
                // The rest of the scene stays up; a file that would not load is named under it.
                const line = document.createElement("div")
                line.setAttribute("data-aigui-scene-model-error", "")
                line.textContent = `Model could not be loaded from ${new URL(object.src).origin}.`
                el.appendChild(line)
              },
            }),
          )
          .then((handle) => {
            // Torn down while the engine was still loading: nothing on screen should own a WebGL
            // context that no longer has a home.
            if (disposed) {
              handle.destroy()
              return
            }
            const steps = definition.steps ?? []
            if (steps.length === 0) {
              mounted = handle
              return
            }
            if (!animate) {
              // A still picture: the scene as the last step leaves it, the steps listed in order.
              handle.goTo(steps.length - 1, true)
              const ol = document.createElement("ol")
              ol.setAttribute("data-aigui-scene-steps", "")
              for (const step of steps) {
                const li = document.createElement("li")
                li.textContent = step.caption
                ol.appendChild(li)
              }
              el.appendChild(ol)
              mounted = handle
              return
            }
            const stop = playSteps(el, steps.map((s) => s.caption), stepMs, (index) => handle.goTo(index))
            mounted = {
              destroy() {
                stop()
                handle.destroy()
              },
            }
          })
          .catch(() => {
            canvasHost.replaceChildren()
            canvasHost.innerHTML = failedHtml("Scene could not be drawn.")
          })
        return () => {
          disposed = true
          mounted?.destroy()
        }
      },
    }
  }

  return {
    name: "scene",
    css: sceneCss,
    nodeRenderers: { scene: render },
    // A half-streamed JSON object is not a scene; without this the reader watches objects appear
    // one at a time and the camera jump as each one lands.
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
    promptSpec: (locale) => scenePromptSpec(locale),
  }
}
