import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react"
import { collectNodeRenderers, type ActionRuntime, type AIGuiPlugin, type CardRegistry, type CardStore, type FeedOptions, type FeedSource, type RendererOptions } from "@ai-gui/core"
import { useAIRenderer } from "./use-ai-renderer"
import { renderNode, type RenderContext } from "./render-node"

export interface AIRendererHandle {
  push: (chunk: string) => void
  feed: (source: FeedSource, options?: FeedOptions) => Promise<void>
  reset: () => void
}

export interface AIRendererProps {
  registry?: CardRegistry
  cardStore?: CardStore
  sanitize?: RendererOptions["sanitize"]
  plugins?: AIGuiPlugin[]
  actionRuntime?: ActionRuntime
  onCardAction?: RenderContext["onCardAction"]
  className?: string
}

interface ActionScope {
  controller: AbortController
  owner: object
}

function createActionScope(): ActionScope {
  return { controller: new AbortController(), owner: {} }
}

export const AIRenderer = forwardRef<AIRendererHandle, AIRendererProps>(function AIRenderer(props, ref) {
  const { registry, cardStore, sanitize, plugins, actionRuntime, onCardAction, className } = props
  const opts: Omit<RendererOptions, "onPatch"> = { registry, sanitize, plugins }
  const { nodes, push, feed, reset: resetRenderer } = useAIRenderer(opts)
  const actionScope = useRef(createActionScope())
  useEffect(() => () => {
    actionScope.current.controller.abort()
    actionScope.current = createActionScope()
  }, [actionRuntime, registry, sanitize, plugins])
  const reset = useCallback(() => {
    actionScope.current.controller.abort()
    actionScope.current = createActionScope()
    resetRenderer()
  }, [resetRenderer])
  const handleCardAction = useCallback<NonNullable<RenderContext["onCardAction"]>>((action) => {
    if (actionRuntime) {
      const scope = actionScope.current
      void actionRuntime.dispatch(
        { type: action.type, params: action.params, cardType: action.cardType, cardId: action.cardId },
        { signal: scope.controller.signal, owner: scope.owner },
      ).catch(() => {})
    }
    onCardAction?.(action)
  }, [actionRuntime, onCardAction])
  useImperativeHandle(ref, () => ({ push, feed, reset }), [push, feed, reset])
  const nodeRenderers = useMemo(() => collectNodeRenderers(plugins), [plugins])
  const ctx: RenderContext = { registry, cardStore, plugins, nodeRenderers, onCardAction: handleCardAction, sanitize, sanitized: true }
  return (
    <div className={className} data-aigui-renderer>
      {nodes.map((n) => renderNode(n, ctx))}
    </div>
  )
})
