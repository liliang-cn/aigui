import { collectNodeRenderers, sanitizeHtml, type AIGuiPlugin, type ASTNode, type CardRegistry, type NodeRenderer, type RendererOptions, type RenderOutput, type SanitizeHtmlOptions } from "@ai-gui/core"
import { renderOutputToElement, type ManagedElement } from "./render-output"

export interface DomRenderContext {
  registry?: CardRegistry
  onCardAction?: (action: { type: string; params?: unknown; cardType: string }) => void
  plugins?: AIGuiPlugin[]
  nodeRenderers?: Record<string, NodeRenderer>
  sanitize?: RendererOptions["sanitize"]
  sanitized?: boolean
}

export function renderNodeToElement(node: ASTNode, ctx: DomRenderContext): HTMLElement {
  const r = (ctx.nodeRenderers ?? collectNodeRenderers(ctx.plugins))[node.type]
  if (r) {
    try {
      const out = r(node)
      if (typeof (out as { then?: unknown })?.then === "function") {
        const host = document.createElement("div") as ManagedElement
        host.setAttribute("data-aigui-async-pending", "")
        void (out as Promise<RenderOutput>).then(
          (res) => {
            if (host.__aiguiDisposed) return
            host.removeAttribute("data-aigui-async-pending")
            host.replaceChildren(renderOutputToElement(res, ctx.sanitize))
          },
          () => {
            if (host.__aiguiDisposed) return
            host.removeAttribute("data-aigui-async-pending")
            host.setAttribute("data-aigui-async-error", "")
          },
        )
        return host
      }
      return renderOutputToElement(out as RenderOutput, ctx.sanitize)
    } catch {
      return renderFallback(node, ctx)
    }
  }
  switch (node.type) {
    case "heading": { const el = document.createElement(node.tag ?? "h1"); el.innerHTML = renderHtml(node.html ?? "", ctx); return el }
    case "paragraph": { const el = document.createElement("p"); el.innerHTML = renderHtml(node.html ?? "", ctx); return el }
    case "code": {
      const pre = document.createElement("pre"); if (node.attrs?.lang) pre.setAttribute("data-lang", node.attrs.lang)
      const code = document.createElement("code"); code.textContent = node.content ?? ""; pre.appendChild(code); return pre
    }
    case "hr": return document.createElement("hr")
    case "html": { const el = document.createElement("div"); el.innerHTML = renderHtml(node.content ?? "", ctx); return el }
    case "card": return renderCardElement(node, ctx)
    default: return renderFallback(node, ctx)
  }
}

function renderFallback(node: ASTNode, ctx: DomRenderContext): HTMLElement {
  const el = document.createElement("div")
  el.innerHTML = renderHtml(node.html ?? node.content ?? "", ctx)
  return el
}

function renderHtml(html: string, ctx: DomRenderContext): string {
  if (ctx.sanitized || ctx.sanitize === false) return html
  return sanitizeHtml(html, typeof ctx.sanitize === "object" ? ctx.sanitize as SanitizeHtmlOptions : undefined)
}

function renderCardElement(node: ASTNode, ctx: DomRenderContext): HTMLElement {
  const card = node.card
  if (!card) return document.createElement("div")
  if (!card.complete) { const el = document.createElement("div"); el.setAttribute("data-aigui-card-loading", ""); el.setAttribute("data-card-type", card.type); return el }
  if (!card.valid) { const pre = document.createElement("pre"); pre.setAttribute("data-aigui-card-invalid", ""); const c = document.createElement("code"); c.textContent = JSON.stringify(card.data, null, 2); pre.appendChild(c); return pre }
  const factory = ctx.registry?.getRender(card.type) as
    | ((data: unknown, api: { onAction: (a: { type: string; params?: unknown }) => void }) => HTMLElement)
    | undefined
  if (!factory) { const pre = document.createElement("pre"); pre.setAttribute("data-aigui-card-fallback", ""); const c = document.createElement("code"); c.textContent = JSON.stringify(card.data, null, 2); pre.appendChild(c); return pre }
  // Host the factory element inside a card container so the returned element wraps user content.
  const host = document.createElement("div"); host.setAttribute("data-aigui-card", card.type)
  host.appendChild(factory(card.data, { onAction: (a) => ctx.onCardAction?.({ ...a, cardType: card.type }) }))
  return host
}
