import { Renderer, type ASTNode, type Patch, type RendererOptions } from "@aigui/core"
import { type DomRenderContext } from "./render-node-dom"
import { createReconcileState, reconcile } from "./reconcile"

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
  return {
    push: (c) => renderer.push(c),
    feed: (s) => renderer.feed(s as never),
    reset: () => { renderer.reset(); state.els.clear(); el.replaceChildren() },
    destroy: () => { state.els.clear(); el.replaceChildren() },
  }
}
