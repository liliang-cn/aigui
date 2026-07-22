import { forwardRef, useImperativeHandle } from "react"
import type { AIGuiPlugin, CardRegistry, RendererOptions } from "@ai-gui/core"
import { useAIRenderer } from "./use-ai-renderer"
import { renderNode, type RenderContext } from "./render-node"

export interface AIRendererHandle {
  push: (chunk: string) => void
  feed: (source: AsyncIterable<string> | ReadableStream) => Promise<void>
  reset: () => void
}

export interface AIRendererProps {
  registry?: CardRegistry
  sanitize?: boolean
  plugins?: AIGuiPlugin[]
  onCardAction?: RenderContext["onCardAction"]
  className?: string
}

export const AIRenderer = forwardRef<AIRendererHandle, AIRendererProps>(function AIRenderer(props, ref) {
  const { registry, sanitize, plugins, onCardAction, className } = props
  const opts: Omit<RendererOptions, "onPatch"> = { registry, sanitize, plugins }
  const { nodes, push, feed, reset } = useAIRenderer(opts)
  useImperativeHandle(ref, () => ({ push, feed, reset }), [push, feed, reset])
  const ctx: RenderContext = { registry, plugins, onCardAction }
  return (
    <div className={className} data-aigui-renderer>
      {nodes.map((n) => renderNode(n, ctx))}
    </div>
  )
})
