import { sanitizeHtml, type ASTNode, type CardRegistry } from "@aigui/core"

export interface DomRenderContext {
  registry?: CardRegistry
  onCardAction?: (action: { type: string; params?: unknown; cardType: string }) => void
}

export function renderNodeToElement(node: ASTNode, ctx: DomRenderContext): HTMLElement {
  switch (node.type) {
    case "heading": { const el = document.createElement(node.tag ?? "h1"); el.innerHTML = node.html ?? ""; return el }
    case "paragraph": { const el = document.createElement("p"); el.innerHTML = node.html ?? ""; return el }
    case "code": {
      const pre = document.createElement("pre"); if (node.attrs?.lang) pre.setAttribute("data-lang", node.attrs.lang)
      const code = document.createElement("code"); code.textContent = node.content ?? ""; pre.appendChild(code); return pre
    }
    case "hr": return document.createElement("hr")
    case "html": { const el = document.createElement("div"); el.innerHTML = node.content ?? ""; return el }
    case "card": return renderCardElement(node, ctx)
    default: { const el = document.createElement("div"); el.innerHTML = node.html ?? sanitizeHtml(node.content ?? ""); return el }
  }
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
