import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, type MouseEvent } from "react"
import { collectNodeRenderers, exportRenderedImages, type ActionRuntime, type ASTNode, type CardRegistry, type CardStore, type DebugEventListener, type ExportedImage, type ExportImageOptions, type FeedOptions, type FeedSource, type NodeRenderer, type PluginSource, type RendererOptions } from "@ai-gui/core"
import { usePluginStyles } from "./use-plugin-styles"
import { usePlugins } from "./use-plugins"
import { useAIRenderer } from "./use-ai-renderer"
import { renderNode, type RenderContext } from "./render-node"

export interface AIRendererHandle {
  readonly debugSource: "renderer"
  subscribeDebug: (listener: DebugEventListener) => () => void
  push: (chunk: string) => void
  feed: (source: FeedSource, options?: FeedOptions) => Promise<void>
  /**
   * Export every drawing currently rendered, as PNG data URLs.
   *
   * The element the drawings live in belongs to the renderer, so a host offering "save this chart"
   * would otherwise have to wrap it in one of its own just to find them.
   */
  exportImages: (options?: ExportImageOptions) => Promise<ExportedImage[]>
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
  rawHtml?: RendererOptions["rawHtml"]
  /**
   * The plugins, or a function that loads them.
   *
   * Diagrams, maths and charts are the heaviest thing a page carrying them loads, and an answer
   * that draws none should not pay for them:
   * `plugins={() => import("@ai-gui/plugin-mermaid").then((m) => [m.mermaid()])}`. Until the import
   * resolves the answer renders as plain markdown; when it lands the renderer reparses the text it
   * has buffered, so nothing already streamed is lost. Keep the loader stable — define it outside
   * the component or wrap it in `useCallback` — as it runs again whenever its identity changes.
   */
  plugins?: PluginSource
  actionRuntime?: ActionRuntime
  onCardAction?: RenderContext["onCardAction"]
  /**
   * Renderers for individual node types, overriding whatever the plugins supply.
   *
   * A host that wants its own code block — with its copy button, its theme — otherwise has to
   * drop the plugin that claims `code` and reimplement everything else it rendered. Keep the
   * object stable across renders, as with `plugins`.
   */
  nodeRenderers?: Record<string, NodeRenderer>
  /**
   * Called with the nodes currently on screen, whenever they change.
   *
   * What a model produced is only knowable from the parsed nodes: a host that wants to offer
   * "export this chart" or count the diagrams in an answer would otherwise have to watch the DOM
   * for the elements a plugin happened to create.
   */
  onRender?: (nodes: ASTNode[]) => void
  /**
   * Called when a click lands inside a rendered block, with the node that block came from.
   *
   * What the reader clicked is only meaningful against the model's output: an absolute path in
   * inline code that should reveal a file, a citation that should open its source, a code block
   * with a copy button. Without this a host listens on a container of its own and guesses from the
   * DOM — `closest("code")` and the like — which reads a structure the renderer rebuilds as it
   * streams and never promised. `event.target` is the exact element clicked inside the block.
   */
  onNodeClick?: (node: ASTNode, event: MouseEvent<HTMLElement>) => void
  /**
   * The host's colour scheme, "light" or "dark" by convention, handed to every plugin.
   *
   * Charts and diagrams choose their own colours and cannot see the page they sit on, so an
   * answer rendered on a dark page comes back with white plot areas until the host says so.
   */
  theme?: string
  /**
   * The host's locale as a BCP-47 tag, e.g. "zh-CN".
   *
   * Handed to every plugin so the chrome it draws — a Copy button, an error line — is in the
   * page's language. English is the fallback for anything untranslated.
   */
  locale?: string
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
  const { text, registry, cardStore, sanitize, rawHtml, plugins: pluginSource, actionRuntime, onCardAction, nodeRenderers: hostNodeRenderers, onRender, onNodeClick, theme, locale, className, debug, onDebugEvent } = props
  const { plugins, error: pluginsError } = usePlugins(pluginSource)
  usePluginStyles(plugins)
  const opts: Omit<RendererOptions, "onPatch"> = { registry, sanitize, rawHtml, plugins, debug, onDebugEvent }
  const { renderer, nodes, push, feed, reset: resetRenderer } = useAIRenderer(opts)
  useEffect(() => {
    // A chunk that fails to load — offline, a bad deploy — leaves the answer as plain markdown
    // rather than taking the page down, but it should not do so silently.
    if (pluginsError !== undefined) renderer.emitDebug("plugins-load-failed", { error: pluginsError })
  }, [renderer, pluginsError])
  const actionScope = useRef(createActionScope())
  const rendered = useRef("")
  const root = useRef<HTMLDivElement>(null)
  // Plugins are deliberately absent: a deferred import landing mid-answer is not a configuration
  // change, and aborting the card action the reader just triggered because a diagram library
  // finished loading is never what a host meant.
  useEffect(() => () => {
    actionScope.current.controller.abort()
    actionScope.current = createActionScope()
  }, [actionRuntime, registry, sanitize])
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
  const exportImages = useCallback(
    (options?: ExportImageOptions) => root.current ? exportRenderedImages(root.current, options) : Promise.resolve([]),
    [],
  )
  useImperativeHandle(ref, () => ({ debugSource: "renderer" as const, subscribeDebug: (listener) => renderer.subscribeDebug(listener), push, feed, exportImages, reset }), [renderer, push, feed, exportImages, reset])
  // Host renderers win: overriding one node type must not mean giving up the plugin that
  // renders the rest.
  const nodeRenderers = useMemo(
    () => ({ ...collectNodeRenderers(plugins, { debugTarget: renderer }), ...hostNodeRenderers }),
    [plugins, renderer, hostNodeRenderers],
  )
  const ctx: RenderContext = { registry, cardStore, plugins, nodeRenderers, onCardAction: handleCardAction, sanitize, sanitized: true, theme, locale }
  return (
    <div className={className} data-aigui-renderer ref={root}>
      {nodes.map((n) => onNodeClick
        ? (
          // `display: contents` so a block that reports its clicks lays out exactly as one that
          // does not. The wrapper is what makes the mapping from click to node exact — a plugin
          // owns the markup inside it, and nothing about that markup is promised.
          <div key={n.key} data-aigui-node={n.key} style={NODE_CLICK_WRAPPER} onClick={(event) => onNodeClick(n, event)}>
            {renderNode(n, ctx)}
          </div>
        )
        : renderNode(n, ctx))}
    </div>
  )
})

const NODE_CLICK_WRAPPER = { display: "contents" } as const
