import { defineComponent, h, onBeforeUnmount, shallowRef, watch, type PropType } from "vue"
import { collectNodeRenderers, type AIGuiPlugin, type CardRegistry, type FeedOptions, type FeedSource, type RendererOptions } from "@ai-gui/core"
import { useAIRenderer } from "./use-ai-renderer"
import { renderNode, type RenderContext } from "./render-node"

export const AIRenderer = defineComponent({
  name: "AIRenderer",
  emits: ["card-action"],
  props: {
    registry: { type: Object as PropType<CardRegistry>, default: undefined },
    plugins: { type: Array as PropType<AIGuiPlugin[]>, default: undefined },
    sanitize: { type: [Boolean, Object] as PropType<RendererOptions["sanitize"]>, default: undefined },
    onCardAction: { type: Function as PropType<RenderContext["onCardAction"]>, default: undefined },
  },
  setup(props, { emit, expose }) {
    const current = shallowRef(useAIRenderer({ registry: props.registry, sanitize: props.sanitize, plugins: props.plugins }))
    const nodeRenderers = shallowRef(collectNodeRenderers(props.plugins))
    watch(
      () => [props.registry, props.sanitize, props.plugins] as const,
      () => {
        current.value.destroy()
        current.value = useAIRenderer({ registry: props.registry, sanitize: props.sanitize, plugins: props.plugins })
        nodeRenderers.value = collectNodeRenderers(props.plugins)
      },
    )
    onBeforeUnmount(() => current.value.destroy())
    const push = (chunk: string) => current.value.push(chunk)
    const feed = (source: FeedSource, options?: FeedOptions) => current.value.feed(source, options)
    const reset = () => current.value.reset()
    expose({ push, feed, reset })
    return () => {
      const onCardAction: RenderContext["onCardAction"] = (action) => {
        props.onCardAction?.(action)
        emit("card-action", action)
      }
      const ctx: RenderContext = { registry: props.registry, plugins: props.plugins, nodeRenderers: nodeRenderers.value, onCardAction, sanitize: props.sanitize, sanitized: true }
      return h("div", { "data-aigui-renderer": "" }, current.value.nodes.value.map((n) => renderNode(n, ctx)))
    }
  },
})
