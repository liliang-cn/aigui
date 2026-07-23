import { shallowRef, type ShallowRef } from "vue"
import { Renderer, type ASTNode, type FeedOptions, type FeedSource, type Patch, type RendererOptions } from "@ai-gui/core"

export interface UseAIRendererResult {
  renderer: Renderer
  nodes: ShallowRef<ASTNode[]>
  push: (chunk: string) => void
  feed: (source: FeedSource, options?: FeedOptions) => Promise<void>
  reset: () => void
  destroy: () => void
}

export function useAIRenderer(options: Omit<RendererOptions, "onPatch"> = {}): UseAIRendererResult {
  const nodes = shallowRef<ASTNode[]>([])
  let active = true
  const renderer = new Renderer({
    ...options,
    plugins: options.plugins,
    onPatch: (_patches: Patch[], snapshot: ASTNode[]) => { if (active) nodes.value = snapshot },
  })
  return {
    renderer,
    nodes,
    push: (c) => { if (active) renderer.push(c) },
    feed: (source, feedOptions) => active ? renderer.feed(source, feedOptions) : Promise.resolve(),
    reset: () => { if (active) { renderer.reset(); nodes.value = [] } },
    destroy: () => { active = false; renderer.reset(); nodes.value = [] },
  }
}
