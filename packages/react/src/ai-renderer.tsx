import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react"
import { collectNodeRenderers, type ActionRuntime, type AIGuiPlugin, type ASTNode, type CardRegistry, type CardStore, type DebugEventListener, type FeedOptions, type FeedSource, type RendererOptions } from "@ai-gui/core"
import { useAIRenderer } from "./use-ai-renderer"
import { renderNode, type RenderContext } from "./render-node"

export interface AIRendererHandle {
  readonly debugSource: "renderer"
  subscribeDebug: (listener: DebugEventListener) => () => void
  push: (chunk: string) => void
  feed: (source: FeedSource, options?: FeedOptions) => Promise<void>
  reset: () => void
}

export interface AIRendererProps {
  /**
   * The whole text to render, as a controlled component.
   *
   * Streaming a model's answer means re-rendering with a longer string, and only the added part
   * is new. Working that out is the renderer's job: pass the full text on every update and it
   * pushes the delta, or starts over when the new text is not a continuation of what it holds.
   * Leave it undefined to drive the renderer through the imperative handle instead.
   */
  text?: string
  registry?: CardRegistry
  cardStore?: CardStore
  sanitize?: RendererOptions["sanitize"]
  plugins?: AIGuiPlugin[]
  actionRuntime?: ActionRuntime
  onCardAction?: RenderContext["onCardAction"]
  /**
   * Called with the nodes currently on screen, whenever they change.
   *
   * What a model produced is only knowable from the parsed nodes: a host that wants to offer
   * "export this chart" or count the diagrams in an answer would otherwise have to watch the DOM
   * for the elements a plugin happened to create.
   */
  onRender?: (nodes: ASTNode[]) => void
  /**
   * The host's colour scheme, "light" or "dark" by convention, handed to every plugin.
   *
   * Charts and diagrams choose their own colours and cannot see the page they sit on, so an
   * answer rendered on a dark page comes back with white plot areas until the host says so.
   */
  theme?: string
  className?: string
  debug?: RendererOptions["debug"]
  onDebugEvent?: RendererOptions["onDebugEvent"]
}

interface ActionScope {
  controller: AbortController
  owner: object
}

function createActionScope(): ActionScope {
  return { controller: new AbortController(), owner: {} }
}

export const AIRenderer = forwardRef<AIRendererHandle, AIRendererProps>(function AIRenderer(props, ref) {
  const { text, registry, cardStore, sanitize, plugins, actionRuntime, onCardAction, onRender, theme, className, debug, onDebugEvent } = props
  const opts: Omit<RendererOptions, "onPatch"> = { registry, sanitize, plugins, debug, onDebugEvent }
  const { renderer, nodes, push, feed, reset: resetRenderer } = useAIRenderer(opts)
  const actionScope = useRef(createActionScope())
  const rendered = useRef("")
  useEffect(() => () => {
    actionScope.current.controller.abort()
    actionScope.current = createActionScope()
  }, [actionRuntime, registry, sanitize, plugins])
  const reset = useCallback(() => {
    actionScope.current.controller.abort()
    actionScope.current = createActionScope()
    rendered.current = ""
    resetRenderer()
  }, [resetRenderer])
  useEffect(() => {
    if (text === undefined || text === rendered.current) return
    if (text.startsWith(rendered.current)) push(text.slice(rendered.current.length))
    else {
      reset()
      push(text)
    }
    rendered.current = text
  }, [text, push, reset])
  const onRenderRef = useRef(onRender)
  onRenderRef.current = onRender
  useEffect(() => {
    onRenderRef.current?.(nodes)
  }, [nodes])
  useEffect(() => () => {
    // The session empties the renderer whenever its effects are torn down and run again —
    // StrictMode's development remount, Fast Refresh — so whatever was pushed is gone. Forget it
    // here too: React runs every cleanup before it re-runs any effect, so the sync above then
    // sends the whole text into the blank renderer instead of a delta it would never show.
    rendered.current = ""
  }, [renderer])
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
  useImperativeHandle(ref, () => ({ debugSource: "renderer" as const, subscribeDebug: (listener) => renderer.subscribeDebug(listener), push, feed, reset }), [renderer, push, feed, reset])
  const nodeRenderers = useMemo(() => collectNodeRenderers(plugins, { debugTarget: renderer }), [plugins, renderer])
  const ctx: RenderContext = { registry, cardStore, plugins, nodeRenderers, onCardAction: handleCardAction, sanitize, sanitized: true, theme }
  return (
    <div className={className} data-aigui-renderer>
      {nodes.map((n) => renderNode(n, ctx))}
    </div>
  )
})
