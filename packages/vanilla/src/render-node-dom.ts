import { collectNodeRenderers, sanitizeHtml, type AIGuiPlugin, type ASTNode, type CardAction, type CardRegistry, type CardStore, type MountedCardSlot, type MountCardSlotRequest, type NodeRenderer, type RendererOptions, type RenderMountContext, type RenderOutput, type SanitizeHtmlOptions } from "@ai-gui/core"
import { renderOutputToElement, type ManagedElement } from "./render-output"

export interface VanillaCardAction {
  type: string
  params?: unknown
}

export interface VanillaCardUpdateContext {
  state: CardAction
  onAction: (action: VanillaCardAction) => void
}

export interface VanillaCardInstance {
  element: HTMLElement
  update: (data: unknown, context: VanillaCardUpdateContext) => void
  destroy?: () => void
}

export type VanillaCardFactory = (
  data: unknown,
  context: VanillaCardUpdateContext,
) => HTMLElement | VanillaCardInstance

export interface DomRenderContext {
  registry?: CardRegistry
  cardStore?: CardStore
  onCardAction?: (action: { type: string; params?: unknown; cardType: string; cardId?: string }) => void
  plugins?: AIGuiPlugin[]
  nodeRenderers?: Record<string, NodeRenderer>
  sanitize?: RendererOptions["sanitize"]
  sanitized?: boolean
  /** The host's colour scheme, handed to every plugin that renders a node. */
  theme?: string
}

export function renderNodeToElement(node: ASTNode, ctx: DomRenderContext): HTMLElement {
  const r = (ctx.nodeRenderers ?? collectNodeRenderers(ctx.plugins))[node.type]
  if (r) {
    if (node.complete === false) {
      const loading = document.createElement("div")
      loading.setAttribute("data-aigui-block-loading", "")
      loading.setAttribute("data-block-type", node.type)
      return loading
    }
    try {
      const out = r(node, { theme: ctx.theme })
      if (typeof (out as { then?: unknown })?.then === "function") {
        const host = document.createElement("div") as ManagedElement
        host.setAttribute("data-aigui-async-pending", "")
        void (out as Promise<RenderOutput>).then(
          (res) => {
            if (host.__aiguiDisposed) return
            host.removeAttribute("data-aigui-async-pending")
            host.replaceChildren(renderOutputToElement(res, ctx.sanitize, createRenderMountContext(ctx)))
          },
          () => {
            if (host.__aiguiDisposed) return
            host.removeAttribute("data-aigui-async-pending")
            host.setAttribute("data-aigui-async-error", "")
          },
        )
        return host
      }
      return renderOutputToElement(out as RenderOutput, ctx.sanitize, createRenderMountContext(ctx))
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
  const factory = ctx.registry?.getRender(card.type) as VanillaCardFactory | undefined
  if (!factory) return createCardFallback(card, ctx)
  // Host the factory element inside a card container so the returned element wraps user content.
  const host = document.createElement("div") as CardHostElement
  host.setAttribute("data-aigui-card", card.type)
  const controller = createCardController(host, card, factory, ctx)
  host.__aiguiCardController = controller
  host.__aiguiCleanup = () => controller.destroy()
  return host
}

interface CardHostElement extends ManagedElement {
  __aiguiCardController?: CardController
}

interface CardController {
  updateNode: (node: ASTNode) => boolean
  destroy: () => void
}

interface VanillaMountedCardSlot extends MountedCardSlot {
  element: () => HTMLElement | undefined
}

function createRenderMountContext(ctx: DomRenderContext): RenderMountContext {
  return {
    mountCard(host, request) {
      return mountCardSlot(host, request, ctx)
    },
  }
}

function mountCardSlot(host: HTMLElement, request: MountCardSlotRequest, ctx: DomRenderContext): MountedCardSlot | undefined {
  const factory = ctx.registry?.getRender(request.type) as VanillaCardFactory | undefined
  if (!factory) return undefined
  return createVanillaCardSlot(
    host,
    request.data,
    factory,
    () => ({
      state: { status: "idle" },
      onAction: (action) => ctx.onCardAction?.({ ...action, cardType: request.type }),
    }),
  )
}

function createVanillaCardSlot(
  host: HTMLElement,
  initialData: unknown,
  factory: VanillaCardFactory,
  context: () => VanillaCardUpdateContext,
): VanillaMountedCardSlot {
  let destroyed = false
  let instance: VanillaCardInstance | undefined
  let element: HTMLElement | undefined

  const mount = (data: unknown) => {
    const rendered = factory(data, context())
    if (isVanillaCardInstance(rendered)) {
      instance = rendered
      element = rendered.element
    } else {
      instance = undefined
      element = rendered
    }
    host.replaceChildren(element)
  }

  mount(initialData)
  return {
    element: () => element,
    update(data) {
      if (destroyed) return
      if (instance) instance.update(data, context())
      else mount(data)
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      instance?.destroy?.()
      instance = undefined
    },
  }
}

function createCardFallback(card: NonNullable<ASTNode["card"]>, ctx: DomRenderContext): HTMLElement {
  const pre = document.createElement("pre") as ManagedElement
  pre.setAttribute("data-aigui-card-fallback", "")
  const code = document.createElement("code")
  pre.appendChild(code)
  const render = (data: unknown) => {
    pre.removeAttribute("data-aigui-card-missing")
    code.textContent = JSON.stringify(data, null, 2)
  }
  const missing = () => {
    pre.setAttribute("data-aigui-card-missing", "")
    code.textContent = "Card data is unavailable"
  }

  let unsubscribe = () => {}
  if (card.id !== undefined && ctx.cardStore) {
    try {
      const record = ctx.cardStore.register({ id: card.id, type: card.type, data: card.data })
      render(record.data)
    } catch (error) {
      pre.setAttribute("data-aigui-card-store-error", "")
      code.textContent = error instanceof Error ? error.message : "Card registration failed"
    }
    unsubscribe = ctx.cardStore.subscribe(card.id, (next) => {
      if (!next || next.type !== card.type) missing()
      else {
        pre.removeAttribute("data-aigui-card-store-error")
        render(next.data)
      }
    })
    pre.__aiguiCleanup = unsubscribe
  } else {
    render(card.data)
  }
  return pre
}

export function updateCardElement(el: HTMLElement, node: ASTNode): boolean {
  return (el as CardHostElement).__aiguiCardController?.updateNode(node) ?? false
}

function createCardController(
  host: CardHostElement,
  initialCard: NonNullable<ASTNode["card"]>,
  factory: VanillaCardFactory,
  ctx: DomRenderContext,
): CardController {
  let card = initialCard
  let destroyed = false
  let unsubscribe = () => {}
  let slot: VanillaMountedCardSlot | undefined
  let missing = false
  const id = card.id
  const onAction = (action: VanillaCardAction) => ctx.onCardAction?.({
    ...action,
    cardType: card.type,
    ...(id === undefined ? {} : { cardId: id }),
  })

  let data = card.data
  let state: CardAction = { status: "idle" }
  let registrationError: unknown
  if (id !== undefined && ctx.cardStore) {
    try {
      const record = ctx.cardStore.register({ id, type: card.type, data })
      data = record.data
      state = record.action
    } catch (error) {
      registrationError = error
    }
  }

  const mount = (nextData: unknown) => {
    slot = createVanillaCardSlot(host, nextData, factory, () => ({ state, onAction }))
  }
  const update = (nextData: unknown, nextState: CardAction) => {
    if (destroyed) return
    data = nextData
    state = nextState
    host.removeAttribute("data-aigui-card-store-error")
    if (missing) {
      missing = false
      host.removeAttribute("data-aigui-card-missing")
      const element = slot?.element()
      if (element) host.replaceChildren(element)
    }
    if (slot) slot.update(data)
    else mount(data)
  }
  const showMissing = () => {
    if (destroyed || missing) return
    missing = true
    host.removeAttribute("data-aigui-card-store-error")
    host.setAttribute("data-aigui-card-missing", "")
    const fallback = document.createElement("code")
    fallback.textContent = "Card data is unavailable"
    host.replaceChildren(fallback)
  }

  if (registrationError === undefined) {
    mount(data)
  } else {
    host.setAttribute("data-aigui-card-store-error", "")
    const code = document.createElement("code")
    code.textContent = registrationError instanceof Error ? registrationError.message : "Card registration failed"
    host.replaceChildren(code)
  }
  if (id !== undefined && ctx.cardStore) {
    unsubscribe = ctx.cardStore.subscribe(id, (record) => {
      if (!record || record.type !== card.type) {
        showMissing()
        return
      }
      update(record.data, record.action)
    })
  }

  return {
    updateNode(node) {
      const next = node.card
      if (!next?.complete || !next.valid || next.type !== card.type || next.id !== id) return false
      card = next
      if (id === undefined || !ctx.cardStore) update(next.data, state)
      return true
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      unsubscribe()
      unsubscribe = () => {}
      slot?.destroy()
      slot = undefined
    },
  }
}

function isVanillaCardInstance(value: HTMLElement | VanillaCardInstance): value is VanillaCardInstance {
  return !(value instanceof HTMLElement)
    && value !== null
    && typeof value === "object"
    && value.element instanceof HTMLElement
    && typeof value.update === "function"
}
