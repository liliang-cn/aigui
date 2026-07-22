import { h, type Component, type VNode } from "vue"
import { collectNodeRenderers, sanitizeHtml, type AIGuiPlugin, type ASTNode, type CardRegistry, type RenderOutput } from "@ai-gui/core"
import { AsyncOutput, renderOutput } from "./render-output"

export interface RenderContext {
  registry?: CardRegistry
  plugins?: AIGuiPlugin[]
  onCardAction?: (action: { type: string; params?: unknown; cardType: string }) => void
}

export function renderNode(node: ASTNode, ctx: RenderContext): VNode {
  // Plugin node renderers win over built-in types.
  const r = collectNodeRenderers(ctx.plugins)[node.type]
  if (r) {
    const out = r(node)
    if (out && typeof (out as { then?: unknown }).then === "function") {
      return h(AsyncOutput, { key: node.key, promise: out as Promise<RenderOutput> })
    }
    return renderOutput(out as RenderOutput)
  }
  switch (node.type) {
    case "heading": return h(node.tag ?? "h1", { key: node.key, innerHTML: node.html ?? "" })
    case "paragraph": return h("p", { key: node.key, innerHTML: node.html ?? "" })
    case "code": return h("pre", { key: node.key, "data-lang": node.attrs?.lang }, [h("code", node.content ?? "")])
    case "hr": return h("hr", { key: node.key })
    case "html": return h("div", { key: node.key, innerHTML: node.content ?? "" })
    case "card": return renderCard(node, ctx)
    default: return h("div", { key: node.key, innerHTML: node.html ?? sanitizeHtml(node.content ?? "") })
  }
}

function renderCard(node: ASTNode, ctx: RenderContext): VNode {
  const card = node.card
  if (!card) return h("div", { key: node.key })
  if (!card.complete) return h("div", { key: node.key, "data-aigui-card-loading": "", "data-card-type": card.type })
  if (!card.valid) return h("pre", { key: node.key, "data-aigui-card-invalid": "" }, [h("code", JSON.stringify(card.data, null, 2))])
  const Comp = ctx.registry?.getRender(card.type) as Component | undefined
  if (!Comp) return h("pre", { key: node.key, "data-aigui-card-fallback": "" }, [h("code", JSON.stringify(card.data, null, 2))])
  return h(Comp, { key: node.key, data: card.data, onAction: (a: { type: string; params?: unknown }) => ctx.onCardAction?.({ ...a, cardType: card.type }) })
}
