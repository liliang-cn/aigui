import { assertPlugins, collectNodeRenderers, exportRenderedImages, injectPluginStyles, loadPlugins, Renderer, samePlugins, type ActionRuntime, type AIGuiPlugin, type ASTNode, type CardStore, type DebugEventListener, type ExportedImage, type ExportImageOptions, type FeedOptions, type FeedSource, type NodeRenderer, type Patch, type PluginSource, type RendererOptions } from "@ai-gui/core"
import { type DomRenderContext } from "./render-node-dom"
import { createReconcileState, disposeEl, reconcile } from "./reconcile"

export interface CreateRendererOptions extends Omit<RendererOptions, "onPatch" | "plugins"> {
  /**
   * The plugins, or a function that loads them.
   *
   * Diagrams, maths and charts are the heaviest thing a page carrying them loads, and an answer
   * that draws none should not pay for them:
   * `plugins: () => import("@ai-gui/plugin-mermaid").then((m) => [m.mermaid()])`. Until the import
   * resolves the answer renders as plain markdown; when it lands the renderer reparses the text it
   * has buffered, so the host neither holds the stream back nor replays it.
   */
  plugins?: PluginSource
  actionRuntime?: ActionRuntime
  cardStore?: CardStore
  onCardAction?: DomRenderContext["onCardAction"]
  /**
   * Renderers for individual node types, overriding whatever the plugins supply.
   *
   * Lets a host replace one block — its own code block, say — without dropping the plugin that
   * renders everything else.
   */
  nodeRenderers?: Record<string, NodeRenderer>
  /** The host's colour scheme, handed to every plugin. Change it later with `setTheme`. */
  theme?: string
  /**
   * The host's locale as a BCP-47 tag, e.g. "zh-CN".
   *
   * Handed to every plugin so the chrome it draws — a Copy button, an error line — is in the
   * page's language. English is the fallback for anything untranslated.
   */
  locale?: string
  /** Called with the nodes on screen whenever they change. */
  onRender?: (nodes: ASTNode[]) => void
  /**
   * Called when a click lands inside a rendered block, with the node that block came from.
   *
   * What the reader clicked is only meaningful against the model's output: an absolute path in
   * inline code that should reveal a file, a citation that should open its source, a code block
   * with a copy button. Without this a host listens on its own container and guesses from the DOM
   * — `closest("code")` and the like — which reads a structure the renderer rebuilds as it streams
   * and never promised. The event is the original one, so `event.target` is the exact element
   * clicked inside the block.
   */
  onNodeClick?: (node: ASTNode, event: MouseEvent) => void
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
  /**
   * Swap the plugins in and redraw the answer already on screen.
   *
   * The `plugins` loader calls this itself when its import resolves; a host only needs it to change
   * plugins later — enabling diagrams from a setting, say. Handing it the same plugins is a no-op.
   */
  setPlugins: (plugins: AIGuiPlugin[] | undefined) => void
  feed: (source: FeedSource, options?: FeedOptions) => Promise<void>
  /** Export every drawing currently rendered, as PNG data URLs. */
  exportImages: (options?: ExportImageOptions) => Promise<ExportedImage[]>
  reset: () => void
  destroy: () => void
}

export function createRenderer(el: HTMLElement, options: CreateRendererOptions = {}): VanillaRenderer {
  const { actionRuntime, cardStore, onCardAction, nodeRenderers: hostNodeRenderers, theme, locale, onRender, onNodeClick, plugins: pluginSource, ...rendererOpts } = options
  // A loader's plugins are not here yet; an array's are, and deferring those by even a microtask
  // would render the first chunk of every answer twice.
  const loading = loadPlugins(pluginSource)
  const initialPlugins = Array.isArray(loading) ? loading : undefined
  injectPluginStyles(initialPlugins, el.ownerDocument)
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
    plugins: initialPlugins,
    onPatch: (_patches: Patch[], nodes: ASTNode[]) => {
      if (destroyed) return
      latestNodes = nodes
      reconcile(el, nodes, ctx, state)
      onRender?.(nodes)
    },
  })
  const mergeNodeRenderers = (plugins: AIGuiPlugin[] | undefined) => ({
    ...collectNodeRenderers(plugins, { debugTarget: renderer }),
    ...hostNodeRenderers,
  })
  const ctx: DomRenderContext = { registry: options.registry, cardStore, onCardAction: handleCardAction, plugins: initialPlugins, nodeRenderers: mergeNodeRenderers(initialPlugins), sanitize: options.sanitize, sanitized: true, theme, locale }
  // Run cleanup for every mounted widget before tearing down tracked elements.
  const disposeAll = () => { for (const entry of state.els.values()) disposeEl(entry.el) }
  const setPlugins = (plugins: AIGuiPlugin[] | undefined) => {
    // Checked before anything is mutated: the renderer would reject these too, but only after the
    // context and the DOM below had already been torn down for a swap that cannot happen.
    assertPlugins(plugins)
    if (destroyed || samePlugins(ctx.plugins, plugins)) return
    ctx.plugins = plugins
    ctx.nodeRenderers = mergeNodeRenderers(plugins)
    injectPluginStyles(plugins, el.ownerDocument)
    // Nothing built under the old grammar can be updated into the new one — a paragraph that is now
    // a diagram is a different element — so the tracked elements go and the DOM is rebuilt from the
    // reparsed AST.
    disposeAll()
    state.els.clear()
    el.replaceChildren()
    renderer.setPlugins(plugins)
    // `setPlugins` dispatches patches only when the AST actually changed. Text holding no plugin
    // syntax parses to the same nodes, and those still have to go back on screen.
    reconcile(el, latestNodes, ctx, state)
  }
  const nodeAt = (target: EventTarget | null): ASTNode | undefined => {
    const clicked = target as Node | null
    if (!clicked || typeof clicked.nodeType !== "number") return undefined
    // The tracked elements are the blocks, and they are siblings, so at most one of them holds the
    // click. Asking them is exact — unlike walking the DOM for a shape the renderer never promised.
    for (const [key, entry] of state.els) {
      if (entry.el === clicked || entry.el.contains(clicked)) return latestNodes.find((node) => node.key === key)
    }
    return undefined
  }
  const handleClick = (event: MouseEvent) => {
    const node = nodeAt(event.target)
    if (node) onNodeClick?.(node, event)
  }
  if (onNodeClick) el.addEventListener("click", handleClick)
  if (!Array.isArray(loading)) {
    void loading.then(
      (plugins) => setPlugins(plugins),
      // A chunk that fails to load — offline, a bad deploy — leaves the answer as plain markdown
      // rather than taking the page down with it.
      (error) => renderer.emitDebug("plugins-load-failed", { error }),
    )
  }
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
    setPlugins,
    exportImages: (exportOptions) => exportRenderedImages(el, exportOptions),
    feed: (source, feedOptions) => destroyed ? Promise.resolve() : renderer.feed(source, feedOptions),
    reset: () => { if (!destroyed) { resetActionScope(); disposeAll(); renderer.reset(); state.els.clear(); el.replaceChildren(); rendered = "" } },
    destroy: () => { if (!destroyed) { destroyed = true; rendered = ""; el.removeEventListener("click", handleClick); actionScope.controller.abort(); renderer.reset(); disposeAll(); state.els.clear(); el.replaceChildren() } },
  }
}
