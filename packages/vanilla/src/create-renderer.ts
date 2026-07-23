import { collectNodeRenderers, Renderer, type ASTNode, type FeedOptions, type FeedSource, type Patch, type RendererOptions } from "@ai-gui/core"
import { type DomRenderContext } from "./render-node-dom"
import { createReconcileState, disposeEl, reconcile } from "./reconcile"

export interface CreateRendererOptions extends Omit<RendererOptions, "onPatch"> {
  onCardAction?: DomRenderContext["onCardAction"]
}
export interface VanillaRenderer {
  push: (chunk: string) => void
  feed: (source: FeedSource, options?: FeedOptions) => Promise<void>
  reset: () => void
  destroy: () => void
}

export function createRenderer(el: HTMLElement, options: CreateRendererOptions = {}): VanillaRenderer {
  const { onCardAction, ...rendererOpts } = options
  const ctx: DomRenderContext = { registry: options.registry, onCardAction, plugins: options.plugins, nodeRenderers: collectNodeRenderers(options.plugins), sanitize: options.sanitize, sanitized: true }
  const state = createReconcileState()
  let destroyed = false
  const renderer = new Renderer({
    ...rendererOpts,
    onPatch: (_patches: Patch[], nodes: ASTNode[]) => { if (!destroyed) reconcile(el, nodes, ctx, state) },
  })
  // Run cleanup for every mounted widget before tearing down tracked elements.
  const disposeAll = () => { for (const entry of state.els.values()) disposeEl(entry.el) }
  return {
    push: (c) => { if (!destroyed) renderer.push(c) },
    feed: (source, feedOptions) => destroyed ? Promise.resolve() : renderer.feed(source, feedOptions),
    reset: () => { if (!destroyed) { disposeAll(); renderer.reset(); state.els.clear(); el.replaceChildren() } },
    destroy: () => { if (!destroyed) { destroyed = true; renderer.reset(); disposeAll(); state.els.clear(); el.replaceChildren() } },
  }
}
