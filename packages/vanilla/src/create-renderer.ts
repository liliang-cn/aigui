import { Renderer, type ASTNode, type Patch, type RendererOptions } from "@ai-gui/core"
import { type DomRenderContext } from "./render-node-dom"
import { createReconcileState, disposeEl, reconcile } from "./reconcile"

export interface CreateRendererOptions extends Omit<RendererOptions, "onPatch"> {
  onCardAction?: DomRenderContext["onCardAction"]
}
export interface VanillaRenderer {
  push: (chunk: string) => void
  feed: (source: AsyncIterable<string> | ReadableStream) => Promise<void>
  reset: () => void
  destroy: () => void
}

export function createRenderer(el: HTMLElement, options: CreateRendererOptions = {}): VanillaRenderer {
  const { onCardAction, ...rendererOpts } = options
  const ctx: DomRenderContext = { registry: options.registry, onCardAction, plugins: options.plugins }
  const state = createReconcileState()
  const renderer = new Renderer({
    ...rendererOpts,
    onPatch: (_patches: Patch[], nodes: ASTNode[]) => reconcile(el, nodes, ctx, state),
  })
  // Run cleanup for every mounted widget before tearing down tracked elements.
  const disposeAll = () => { for (const entry of state.els.values()) disposeEl(entry.el) }
  return {
    push: (c) => renderer.push(c),
    feed: (s) => renderer.feed(s as never),
    reset: () => { disposeAll(); renderer.reset(); state.els.clear(); el.replaceChildren() },
    destroy: () => { disposeAll(); state.els.clear(); el.replaceChildren() },
  }
}
