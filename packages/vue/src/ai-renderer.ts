import { defineComponent, h, onBeforeUnmount, shallowRef, watch, type PropType } from "vue"
import { collectNodeRenderers, type ActionRuntime, type AIGuiPlugin, type CardRegistry, type CardStore, type FeedOptions, type FeedSource, type RendererOptions } from "@ai-gui/core"
import { useAIRenderer } from "./use-ai-renderer"
import { renderNode, type RenderContext } from "./render-node"

export const AIRenderer = defineComponent({
  name: "AIRenderer",
  emits: ["card-action"],
  props: {
    registry: { type: Object as PropType<CardRegistry>, default: undefined },
    plugins: { type: Array as PropType<AIGuiPlugin[]>, default: undefined },
    sanitize: { type: [Boolean, Object] as PropType<RendererOptions["sanitize"]>, default: undefined },
    actionRuntime: { type: Object as PropType<ActionRuntime>, default: undefined },
    cardStore: { type: Object as PropType<CardStore>, default: undefined },
    debug: { type: Boolean, default: false },
    onDebugEvent: { type: Function as PropType<NonNullable<RendererOptions["onDebugEvent"]>>, default: undefined },
  },
  setup(props, { emit, expose }) {
    const current = shallowRef(useAIRenderer({ registry: props.registry, sanitize: props.sanitize, plugins: props.plugins, debug: props.debug, onDebugEvent: props.onDebugEvent }))
    const nodeRenderers = shallowRef(collectNodeRenderers(props.plugins, { debugTarget: current.value.renderer }))
    let actionScope = { controller: new AbortController(), owner: {} }
    const resetActionScope = () => {
      actionScope.controller.abort()
      actionScope = { controller: new AbortController(), owner: {} }
    }
    watch(
      () => [props.registry, props.sanitize, props.plugins, props.debug, props.onDebugEvent] as const,
      () => {
        resetActionScope()
        current.value.destroy()
        current.value = useAIRenderer({ registry: props.registry, sanitize: props.sanitize, plugins: props.plugins, debug: props.debug, onDebugEvent: props.onDebugEvent })
        nodeRenderers.value = collectNodeRenderers(props.plugins, { debugTarget: current.value.renderer })
      },
    )
    watch(() => props.actionRuntime, resetActionScope)
    onBeforeUnmount(() => {
      resetActionScope()
      current.value.destroy()
    })
    const push = (chunk: string) => current.value.push(chunk)
    const feed = (source: FeedSource, options?: FeedOptions) => current.value.feed(source, options)
    const reset = () => {
      resetActionScope()
      current.value.reset()
    }
    expose({ debugSource: "renderer", subscribeDebug: (listener: Parameters<typeof current.value.renderer.subscribeDebug>[0]) => current.value.renderer.subscribeDebug(listener), push, feed, reset })
    return () => {
      const onCardAction: RenderContext["onCardAction"] = (action) => {
        if (props.actionRuntime) {
          const request = { type: action.type, params: action.params, cardType: action.cardType, ...(action.cardId === undefined ? {} : { cardId: action.cardId }) }
          void props.actionRuntime.dispatch(
            request,
            { signal: actionScope.controller.signal, owner: actionScope.owner },
          ).catch(() => {})
        }
        emit("card-action", action)
      }
      const ctx: RenderContext = { registry: props.registry, cardStore: props.cardStore, plugins: props.plugins, nodeRenderers: nodeRenderers.value, onCardAction, sanitize: props.sanitize, sanitized: true }
      return h("div", { "data-aigui-renderer": "" }, current.value.nodes.value.map((n) => renderNode(n, ctx)))
    }
  },
})
