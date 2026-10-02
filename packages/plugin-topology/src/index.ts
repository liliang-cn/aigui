import type { AIGuiPlugin, ASTNode, NodeRenderContext, RenderOutput } from "@ai-gui/core"
import { layoutTopology, lengthOf, pointAlong } from "./layout"
import { parseTopology } from "./parse"
import { topologyPromptSpec } from "./prompt"
import { frameAt, palette, routeFor, svgFor, svgShell } from "./render"
import type { TopologyDefinition, TopologyOptions } from "./types"

export { parseTopology, NODE_KINDS, NODE_STATES } from "./parse"
export { layoutTopology } from "./layout"
export { frameAt, svgFor, STATE_COLOURS } from "./render"
export { topologyPromptSpec } from "./prompt"
export type * from "./types"

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

export const topologyCss = [
  "[data-aigui-topology]{margin-block:0.75rem;max-width:100%}",
  "[data-aigui-topology] svg{overflow:visible}",
  "[data-aigui-topology-title]{font-weight:600;margin-bottom:0.35rem}",
  "[data-aigui-topology-caption]{margin-top:0.35rem;font-size:0.875rem;opacity:0.75;text-align:center}",
  "[data-aigui-topology-steps]{margin:0.5rem 0 0;padding-left:1.4rem;font-size:0.875rem}",
  "[data-aigui-topology-steps] li{margin:0.15rem 0}",
  "[data-aigui-topology-bar]{display:flex;align-items:center;gap:0.5rem;margin-top:0.5rem;font-size:0.875rem}",
  "[data-aigui-topology-bar] button{font:inherit;border:1px solid color-mix(in srgb,currentColor 25%,transparent);background:transparent;color:inherit;border-radius:6px;padding:0.1rem 0.55rem;cursor:pointer}",
  "[data-aigui-topology-bar] [data-count]{opacity:0.6;font-variant-numeric:tabular-nums;min-width:3ch}",
  "[data-aigui-topology-bar] [data-caption]{flex:1}",
  ":where([data-aigui-topology-error]){padding:0.5rem 0.75rem;border-radius:0.5rem;font-size:0.875rem;border:1px solid color-mix(in srgb,currentColor 25%,transparent)}",
].join("")

/**
 * Infrastructure topologies — and the processes that run over them.
 *
 * The model names nodes, the hosts or racks they sit in, and the links between them; the layout is
 * computed, so it never writes a coordinate and never has to make room for a label. `steps` turn a
 * diagram into a process: each step says what is sent where and which states change, and the page
 * plays them — a write going to the primary, the replication to its peer, the peer taking over when
 * the primary fails. Drawn still, every step is on the one picture, numbered, with its caption below.
 */
export function topology(options: TopologyOptions = {}): AIGuiPlugin {
  const animate = options.animate ?? true
  const stepMs = options.stepMs ?? 2400

  const render = (node: ASTNode, context?: NodeRenderContext): RenderOutput => {
    if (node.complete === false) return { kind: "html", html: '<div data-aigui-topology-loading style="min-height:6rem;border-radius:.5rem;background:currentColor;opacity:.06"></div>' }
    const parsed = parseTopology(node.content ?? "", options)
    if (!parsed.ok) return { kind: "html", html: `<div data-aigui-topology-error role="img" aria-label="${esc(parsed.error)}">${esc(parsed.error)}</div>`, trusted: true }
    const definition = parsed.value
    return { kind: "mount", mount: (el) => mountTopology(el, definition, context?.theme, animate, stepMs) }
  }

  return {
    name: "topology",
    css: topologyCss,
    nodeRenderers: { topology: render },
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
    promptSpec: (locale) => topologyPromptSpec(locale),
  }
}

function mountTopology(el: HTMLElement, definition: TopologyDefinition, theme: string | undefined, animate: boolean, stepMs: number): () => void {
  const colours = palette(theme)
  // Without a stated direction, whichever way draws larger in the space there is: a long chain laid
  // left to right in a narrow column is scaled down until its badges are unreadable.
  const room = el.clientWidth || el.parentElement?.clientWidth || 0
  const across = layoutTopology(definition)
  const down = definition.direction || !room ? undefined : layoutTopology({ ...definition, direction: "TB" })
  const scale = (l: typeof across) => Math.min(1, room / l.width)
  const layout = down && scale(down) > scale(across) + 0.05 ? down : across
  const steps = definition.steps ?? []
  el.setAttribute("data-aigui-topology", String(definition.nodes.length))
  if (definition.title) {
    const title = document.createElement("div")
    title.setAttribute("data-aigui-topology-title", "")
    title.textContent = definition.title
    el.appendChild(title)
  }
  const figure = document.createElement("div")
  el.appendChild(figure)
  if (definition.nodes.length > 40) el.setAttribute("data-aigui-issue", `${definition.nodes.length} nodes in one topology — too many to read; split it, or group the repeated ones`)

  const label = definition.title ?? definition.caption ?? "Topology"
  const draw = (index: number | "all", moving?: { t: number }) => {
    // In flight, the states are still the previous step's — they change when the messages land —
    // but what is moving and what is lit belong to this step.
    const frame = moving && typeof index === "number" ? { ...frameAt(definition, index - 1), messages: frameAt(definition, index).messages, highlight: frameAt(definition, index).highlight } : frameAt(definition, index)
    let svg = svgShell(layout, label) + svgFor(definition, layout, frame, colours, index === "all")
    if (moving) {
      for (const message of frame.messages) {
        const route = routeFor(definition, layout, message)
        const at = pointAlong(route, moving.t)
        const text = message.label ? `<text x="${at.x + 10}" y="${at.y - 8}" font-size="11" font-weight="600" fill="${colours.accent}" stroke="${colours.halo}" stroke-width="3" paint-order="stroke">${esc(message.label)}</text>` : ""
        svg += `<circle cx="${at.x}" cy="${at.y}" r="6" fill="${colours.accent}" stroke="${colours.halo}" stroke-width="2"/>${text}`
      }
    }
    figure.innerHTML = `${svg}</svg>`
  }

  if (definition.caption) {
    const caption = document.createElement("div")
    caption.setAttribute("data-aigui-topology-caption", "")
    caption.textContent = definition.caption
    el.appendChild(caption)
  }

  // No steps, or a still picture: one drawing, the steps listed under it.
  if (steps.length === 0 || !animate) {
    draw(steps.length === 0 ? -1 : "all")
    if (steps.length > 0) {
      const ol = document.createElement("ol")
      ol.setAttribute("data-aigui-topology-steps", "")
      // A name shared by two nodes — the same resource on two hosts — is told apart by its group.
      const name = (id: string) => {
        const node = definition.nodes.find((n) => n.id === id)
        const shown = node?.label ?? id
        const shared = definition.nodes.filter((n) => (n.label ?? n.id) === shown).length > 1
        const group = shared && node?.group ? definition.groups?.find((g) => g.id === node.group) : undefined
        return group ? `${shown} (${group.label ?? group.id})` : shown
      }
      for (const step of steps) {
        const li = document.createElement("li")
        const carried = (step.messages ?? []).map((m) => `${m.label ? `${m.label}: ` : ""}${name(m.from)} → ${name(m.to)}`)
        li.textContent = carried.length > 0 ? `${step.caption} (${carried.join("; ")})` : step.caption
        ol.appendChild(li)
      }
      el.appendChild(ol)
    }
    return () => el.replaceChildren()
  }

  // Playing: each step's messages travel for most of its time, then its state changes hold.
  const bar = document.createElement("div")
  bar.setAttribute("data-aigui-topology-bar", "")
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
  let playing = true
  let started = performance.now()
  let frameId = 0
  const travel = Math.min(1400, stepMs * 0.6)
  const show = (now: number) => {
    const elapsed = now - started
    const t = Math.min(1, elapsed / travel)
    const hasMessages = (steps[index].messages ?? []).length > 0
    // States of this step land when its messages arrive; until then the previous step's hold.
    draw(index, hasMessages && t < 1 ? { t: ease(t) } : undefined)
    count.textContent = `${index + 1}/${steps.length}`
    caption.textContent = steps[index].caption
  }
  const tick = (now: number) => {
    if (playing && now - started >= stepMs) {
      index = (index + 1) % steps.length
      started = now
    }
    show(now)
    // Nothing moving and nothing to wait for: stop asking for frames until something changes.
    if (playing || now - started < travel) frameId = requestAnimationFrame(tick)
    else frameId = 0
  }
  const restart = () => {
    started = performance.now()
    if (!frameId) frameId = requestAnimationFrame(tick)
  }
  back.onclick = () => {
    index = (index - 1 + steps.length) % steps.length
    restart()
  }
  next.onclick = () => {
    index = (index + 1) % steps.length
    restart()
  }
  play.onclick = () => {
    playing = !playing
    play.textContent = playing ? "⏸" : "⏵"
    play.setAttribute("aria-label", playing ? "Pause" : "Play")
    restart()
  }
  frameId = requestAnimationFrame(tick)
  // A recording (`aigui_export` as GIF or video) asks every player to start over, so the capture
  // holds one play from step 1 rather than whatever step loading happened to end on.
  const restartAll = () => {
    index = 0
    playing = true
    play.textContent = "⏸"
    restart()
  }
  document.addEventListener("aigui:restart", restartAll)
  return () => {
    document.removeEventListener("aigui:restart", restartAll)
    cancelAnimationFrame(frameId)
    el.replaceChildren()
  }
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

export { lengthOf }
