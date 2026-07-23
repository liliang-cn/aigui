import { h, markRaw, toRaw, type Component, type VNode } from "vue"
import { collectNodeRenderers, sanitizeHtml, type AIGuiPlugin, type ASTNode, type CardRegistry, type NodeRenderer, type RendererOptions, type RenderOutput, type SanitizeHtmlOptions } from "@ai-gui/core"
import { AsyncOutput, renderOutput } from "./render-output"

export interface RenderContext {
  registry?: CardRegistry
  plugins?: AIGuiPlugin[]
  nodeRenderers?: Record<string, NodeRenderer>
  onCardAction?: (action: { type: string; params?: unknown; cardType: string }) => void
  sanitize?: RendererOptions["sanitize"]
  sanitized?: boolean
}

export function renderNode(node: ASTNode, ctx: RenderContext): VNode {
  // Plugin node renderers win over built-in types.
  const r = (ctx.nodeRenderers ?? collectNodeRenderers(ctx.plugins))[node.type]
  if (r) {
    try {
      const out = r(node)
      if (out && typeof (out as { then?: unknown }).then === "function") {
        return h(AsyncOutput, { key: node.key, promise: out as Promise<RenderOutput>, sanitize: ctx.sanitize })
      }
      const vnode = renderOutput(out as RenderOutput, ctx.sanitize)
      vnode.key = node.key
      return vnode
    } catch {
      return renderFallback(node, ctx)
    }
  }
  switch (node.type) {
    case "heading": return h(node.tag ?? "h1", { key: node.key, innerHTML: renderHtml(node.html ?? "", ctx) })
    case "paragraph": return h("p", { key: node.key, innerHTML: renderHtml(node.html ?? "", ctx) })
    case "code": return h("pre", { key: node.key, "data-lang": node.attrs?.lang }, [h("code", node.content ?? "")])
    case "hr": return h("hr", { key: node.key })
    case "html": return h("div", { key: node.key, innerHTML: renderHtml(node.content ?? "", ctx) })
    case "card": return renderCard(node, ctx)
    default: return renderFallback(node, ctx)
  }
}

function renderCard(node: ASTNode, ctx: RenderContext): VNode {
  const card = node.card
  if (!card) return h("div", { key: node.key })
  if (!card.complete) return h("div", { key: node.key, "data-aigui-card-loading": "", "data-card-type": card.type })
  if (!card.valid) return h("pre", { key: node.key, "data-aigui-card-invalid": "" }, [h("code", JSON.stringify(card.data, null, 2))])
  const Comp = ctx.registry?.getRender(card.type) as Component | undefined
  if (!Comp) return h("pre", { key: node.key, "data-aigui-card-fallback": "" }, [h("code", JSON.stringify(card.data, null, 2))])
  return h(markRaw(toRaw(Comp)), { key: node.key, data: card.data, onAction: (a: { type: string; params?: unknown }) => ctx.onCardAction?.({ ...a, cardType: card.type }) })
}

function renderFallback(node: ASTNode, ctx: RenderContext): VNode {
  return h("div", { key: node.key, innerHTML: renderHtml(node.html ?? node.content ?? "", ctx) })
}

function renderHtml(html: string, ctx: RenderContext): string {
  if (ctx.sanitized || ctx.sanitize === false) return html
  return sanitizeHtml(html, typeof ctx.sanitize === "object" ? ctx.sanitize as SanitizeHtmlOptions : undefined)
}
