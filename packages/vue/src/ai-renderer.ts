import { defineComponent, h, onBeforeUnmount, shallowRef, watch, type PropType } from "vue"
import { collectNodeRenderers, exportRenderedImages, type ActionRuntime, type AIGuiPlugin, type CardRegistry, type CardStore, type ExportImageOptions, type FeedOptions, type FeedSource, type RendererOptions } from "@ai-gui/core"
import { useAIRenderer } from "./use-ai-renderer"
import { renderNode, type RenderContext } from "./render-node"

export const AIRenderer = defineComponent({
  name: "AIRenderer",
  emits: ["card-action", "render"],
  props: {
    /**
     * The whole text to render, as a controlled component.
     *
     * Streaming an answer means passing a longer string each time, and only the added part is new.
     * Working that out belongs here, not in every host.
     */
    text: { type: String, default: undefined },
    /** The host's colour scheme, "light" or "dark" by convention, handed to every plugin. */
    theme: { type: String, default: undefined },
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
    const root = shallowRef<HTMLElement>()
    // Immediate, and registered before the text is synced: the first push happens during setup, so
    // a watcher added afterwards would never see the nodes it produced and the host would hear
    // nothing about the answer already on screen.
    watch(() => current.value.nodes.value, (nodes) => emit("render", nodes), { immediate: true })
    let rendered = ""
    const syncText = () => {
      const text = props.text
      if (text === undefined || text === rendered) return
      if (text.startsWith(rendered)) current.value.push(text.slice(rendered.length))
      else {
        resetActionScope()
        current.value.reset()
        current.value.push(text)
      }
      rendered = text
    }
    watch(() => props.text, syncText, { immediate: true })
    // A new session starts empty, so what was already sent has to be forgotten or the next update
    // would push a delta into a blank renderer.
    watch(current, () => { rendered = ""; syncText() })
    const push = (chunk: string) => current.value.push(chunk)
    const feed = (source: FeedSource, options?: FeedOptions) => current.value.feed(source, options)
    const reset = () => {
      resetActionScope()
      rendered = ""
      current.value.reset()
    }
    const exportImages = (options?: ExportImageOptions) => root.value ? exportRenderedImages(root.value, options) : Promise.resolve([])
    expose({ debugSource: "renderer", subscribeDebug: (listener: Parameters<typeof current.value.renderer.subscribeDebug>[0]) => current.value.renderer.subscribeDebug(listener), push, feed, reset, exportImages })
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
      const ctx: RenderContext = { registry: props.registry, cardStore: props.cardStore, plugins: props.plugins, nodeRenderers: nodeRenderers.value, onCardAction, sanitize: props.sanitize, sanitized: true, theme: props.theme }
      return h("div", { "data-aigui-renderer": "", ref: root }, current.value.nodes.value.map((n) => renderNode(n, ctx)))
    }
  },
})
