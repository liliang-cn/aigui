import { collectNodeRenderers, exportRenderedImages, Renderer, type ActionRuntime, type ASTNode, type CardStore, type DebugEventListener, type ExportedImage, type ExportImageOptions, type FeedOptions, type FeedSource, type Patch, type RendererOptions } from "@ai-gui/core"
import { type DomRenderContext } from "./render-node-dom"
import { createReconcileState, disposeEl, reconcile } from "./reconcile"

export interface CreateRendererOptions extends Omit<RendererOptions, "onPatch"> {
  actionRuntime?: ActionRuntime
  cardStore?: CardStore
  onCardAction?: DomRenderContext["onCardAction"]
  /** The host's colour scheme, handed to every plugin. Change it later with `setTheme`. */
  theme?: string
  /** Called with the nodes on screen whenever they change. */
  onRender?: (nodes: ASTNode[]) => void
}
export interface VanillaRenderer {
  readonly debugSource: "renderer"
  subscribeDebug: (listener: DebugEventListener) => () => void
  push: (chunk: string) => void
  /**
   * Render this whole text, pushing only what it adds to what is already on screen.
   *
   * Streaming an answer means calling this with a longer string each time. Working out the delta
   * is the renderer's job — a caller doing it itself has to remember what it sent and notice when
   * the next text is not a continuation.
   */
  setText: (text: string) => void
  /** Redraw the plugins for another colour scheme. */
  setTheme: (theme: string | undefined) => void
  feed: (source: FeedSource, options?: FeedOptions) => Promise<void>
  /** Export every drawing currently rendered, as PNG data URLs. */
  exportImages: (options?: ExportImageOptions) => Promise<ExportedImage[]>
  reset: () => void
  destroy: () => void
}

export function createRenderer(el: HTMLElement, options: CreateRendererOptions = {}): VanillaRenderer {
  const { actionRuntime, cardStore, onCardAction, theme, onRender, ...rendererOpts } = options
  let rendered = ""
  let latestNodes: ASTNode[] = []
  let actionScope = { owner: {}, controller: new AbortController() }
  const handleCardAction: DomRenderContext["onCardAction"] = (action) => {
    if (actionRuntime) {
      void actionRuntime.dispatch(
        { ...action, params: action.params },
        { owner: actionScope.owner, signal: actionScope.controller.signal },
      ).catch(() => {})
    }
    onCardAction?.(action)
  }
  const state = createReconcileState()
  let destroyed = false
  const renderer = new Renderer({
    ...rendererOpts,
    onPatch: (_patches: Patch[], nodes: ASTNode[]) => {
      if (destroyed) return
      latestNodes = nodes
      reconcile(el, nodes, ctx, state)
      onRender?.(nodes)
    },
  })
  const ctx: DomRenderContext = { registry: options.registry, cardStore, onCardAction: handleCardAction, plugins: options.plugins, nodeRenderers: collectNodeRenderers(options.plugins, { debugTarget: renderer }), sanitize: options.sanitize, sanitized: true, theme }
  // Run cleanup for every mounted widget before tearing down tracked elements.
  const disposeAll = () => { for (const entry of state.els.values()) disposeEl(entry.el) }
  const resetActionScope = () => {
    actionScope.controller.abort()
    actionScope = { owner: {}, controller: new AbortController() }
  }
  return {
    debugSource: "renderer",
    subscribeDebug: (listener) => renderer.subscribeDebug(listener),
    push: (c) => { if (!destroyed) { renderer.push(c); rendered += c } },
    setText: (text) => {
      if (destroyed || text === rendered) return
      if (text.startsWith(rendered)) renderer.push(text.slice(rendered.length))
      else {
        resetActionScope()
        disposeAll()
        renderer.reset()
        state.els.clear()
        el.replaceChildren()
        renderer.push(text)
      }
      rendered = text
    },
    setTheme: (next) => {
      if (destroyed || ctx.theme === next) return
      ctx.theme = next
      // The nodes have not changed, but the picture drawn for the old scheme is the wrong one, so
      // everything is rebuilt from the AST the renderer still holds.
      disposeAll()
      state.els.clear()
      el.replaceChildren()
      reconcile(el, latestNodes, ctx, state)
    },
    exportImages: (exportOptions) => exportRenderedImages(el, exportOptions),
    feed: (source, feedOptions) => destroyed ? Promise.resolve() : renderer.feed(source, feedOptions),
    reset: () => { if (!destroyed) { resetActionScope(); disposeAll(); renderer.reset(); state.els.clear(); el.replaceChildren(); rendered = "" } },
    destroy: () => { if (!destroyed) { destroyed = true; rendered = ""; actionScope.controller.abort(); renderer.reset(); disposeAll(); state.els.clear(); el.replaceChildren() } },
  }
}
