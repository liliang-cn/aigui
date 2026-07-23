import { defineComponent, h, markRaw, onBeforeUnmount, onMounted, shallowRef, toRaw, watch, type Component, type PropType, type VNode, type WatchStopHandle } from "vue"
import { collectNodeRenderers, sanitizeHtml, type AIGuiPlugin, type ASTNode, type CardRecord, type CardRegistry, type CardStore, type NodeRenderer, type RendererOptions, type RenderOutput, type SanitizeHtmlOptions } from "@ai-gui/core"
import { AsyncOutput, renderOutput } from "./render-output"

export interface RenderContext {
  registry?: CardRegistry
  cardStore?: CardStore
  plugins?: AIGuiPlugin[]
  nodeRenderers?: Record<string, NodeRenderer>
  onCardAction?: (action: { type: string; params?: unknown; cardType: string; cardId?: string }) => void
  sanitize?: RendererOptions["sanitize"]
  sanitized?: boolean
}

export function renderNode(node: ASTNode, ctx: RenderContext): VNode {
  // Plugin node renderers win over built-in types.
  const r = (ctx.nodeRenderers ?? collectNodeRenderers(ctx.plugins))[node.type]
  if (r) {
    if (node.complete === false) return h("div", { key: node.key, "data-aigui-block-loading": "", "data-block-type": node.type })
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
  if (card.id && ctx.cardStore) {
    return h(CardHost, {
      key: node.key,
      component: Comp ? markRaw(toRaw(Comp)) : undefined,
      store: ctx.cardStore,
      cardId: card.id,
      cardType: card.type,
      initialData: card.data,
      onAction: (a: { type: string; params?: unknown }) => ctx.onCardAction?.({ ...a, cardType: card.type, cardId: card.id }),
    })
  }
  if (!Comp) return h("pre", { key: node.key, "data-aigui-card-fallback": "" }, [h("code", JSON.stringify(card.data, null, 2))])
  return h(markRaw(toRaw(Comp)), { key: node.key, data: card.data, onAction: (a: { type: string; params?: unknown }) => ctx.onCardAction?.({ ...a, cardType: card.type }) })
}

const CardHost = defineComponent({
  name: "AIGuiCardHost",
  props: {
    component: { type: [Object, Function] as PropType<Component>, default: undefined },
    store: { type: Object as PropType<CardStore>, required: true },
    cardId: { type: String, required: true },
    cardType: { type: String, required: true },
    initialData: { type: null, required: true },
  },
  emits: ["action"],
  setup(props, { emit }) {
    const record = shallowRef<CardRecord>()
    const failed = shallowRef(false)
    let unsubscribe: undefined | (() => void)
    let stopWatch: undefined | WatchStopHandle

    const bind = ([store, cardId, cardType, initialData]: readonly [CardStore, string, string, unknown]) => {
      unsubscribe?.()
      unsubscribe = undefined
      failed.value = false
      record.value = undefined
      unsubscribe = store.subscribe(cardId, (next) => {
        if (!next || next.type !== cardType) {
          failed.value = true
          record.value = undefined
          return
        }
        failed.value = false
        record.value = next
      })
      try {
        const current = store.register({ id: cardId, type: cardType, data: initialData })
        if (current.type !== cardType) throw new Error(`Card type mismatch for "${cardId}"`)
        record.value = current
      } catch {
        failed.value = true
        record.value = undefined
      }
    }

    onMounted(() => {
      stopWatch = watch(() => [props.store, props.cardId, props.cardType, props.initialData] as const, bind, { immediate: true })
    })
    onBeforeUnmount(() => {
      stopWatch?.()
      unsubscribe?.()
    })

    return () => {
      if (failed.value || !record.value || !props.component) {
        return h("pre", { "data-aigui-card-fallback": "" }, [h("code", JSON.stringify(record.value?.data ?? props.initialData, null, 2))])
      }
      return h(markRaw(toRaw(props.component)), {
        data: record.value.data,
        state: record.value.action,
        onAction: (action: { type: string; params?: unknown }) => emit("action", action),
      })
    }
  },
})

function renderFallback(node: ASTNode, ctx: RenderContext): VNode {
  return h("div", { key: node.key, innerHTML: renderHtml(node.html ?? node.content ?? "", ctx) })
}

function renderHtml(html: string, ctx: RenderContext): string {
  if (ctx.sanitized || ctx.sanitize === false) return html
  return sanitizeHtml(html, typeof ctx.sanitize === "object" ? ctx.sanitize as SanitizeHtmlOptions : undefined)
}
