import { collectNodeRenderers, Renderer, type ActionRuntime, type ASTNode, type CardStore, type FeedOptions, type FeedSource, type Patch, type RendererOptions } from "@ai-gui/core"
import { type DomRenderContext } from "./render-node-dom"
import { createReconcileState, disposeEl, reconcile } from "./reconcile"

export interface CreateRendererOptions extends Omit<RendererOptions, "onPatch"> {
  actionRuntime?: ActionRuntime
  cardStore?: CardStore
  onCardAction?: DomRenderContext["onCardAction"]
}
export interface VanillaRenderer {
  push: (chunk: string) => void
  feed: (source: FeedSource, options?: FeedOptions) => Promise<void>
  reset: () => void
  destroy: () => void
}

export function createRenderer(el: HTMLElement, options: CreateRendererOptions = {}): VanillaRenderer {
  const { actionRuntime, cardStore, onCardAction, ...rendererOpts } = options
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
  const ctx: DomRenderContext = { registry: options.registry, cardStore, onCardAction: handleCardAction, plugins: options.plugins, nodeRenderers: collectNodeRenderers(options.plugins), sanitize: options.sanitize, sanitized: true }
  const state = createReconcileState()
  let destroyed = false
  const renderer = new Renderer({
    ...rendererOpts,
    onPatch: (_patches: Patch[], nodes: ASTNode[]) => { if (!destroyed) reconcile(el, nodes, ctx, state) },
  })
  // Run cleanup for every mounted widget before tearing down tracked elements.
  const disposeAll = () => { for (const entry of state.els.values()) disposeEl(entry.el) }
  const resetActionScope = () => {
    actionScope.controller.abort()
    actionScope = { owner: {}, controller: new AbortController() }
  }
  return {
    push: (c) => { if (!destroyed) renderer.push(c) },
    feed: (source, feedOptions) => destroyed ? Promise.resolve() : renderer.feed(source, feedOptions),
    reset: () => { if (!destroyed) { resetActionScope(); disposeAll(); renderer.reset(); state.els.clear(); el.replaceChildren() } },
    destroy: () => { if (!destroyed) { destroyed = true; actionScope.controller.abort(); renderer.reset(); disposeAll(); state.els.clear(); el.replaceChildren() } },
  }
}
