import { defineComponent, h, type PropType } from "vue"
import type { AIGuiPlugin, CardRegistry } from "@aigui/core"
import { useAIRenderer } from "./use-ai-renderer"
import { renderNode, type RenderContext } from "./render-node"

export const AIRenderer = defineComponent({
  name: "AIRenderer",
  props: {
    registry: { type: Object as PropType<CardRegistry>, default: undefined },
    plugins: { type: Array as PropType<AIGuiPlugin[]>, default: undefined },
    sanitize: { type: Boolean, default: undefined },
    onCardAction: { type: Function as PropType<RenderContext["onCardAction"]>, default: undefined },
  },
  setup(props, { expose }) {
    const { nodes, push, feed, reset } = useAIRenderer({ registry: props.registry, sanitize: props.sanitize, plugins: props.plugins })
    expose({ push, feed, reset })
    return () => {
      const ctx: RenderContext = { registry: props.registry, plugins: props.plugins, onCardAction: props.onCardAction }
      return h("div", { "data-aigui-renderer": "" }, nodes.value.map((n) => renderNode(n, ctx)))
    }
  },
})
