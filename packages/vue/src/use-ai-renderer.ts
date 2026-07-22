import { shallowRef, type ShallowRef } from "vue"
import { Renderer, type ASTNode, type Patch, type RendererOptions } from "@ai-gui/core"

export interface UseAIRendererResult {
  nodes: ShallowRef<ASTNode[]>
  push: (chunk: string) => void
  feed: (source: AsyncIterable<string> | ReadableStream) => Promise<void>
  reset: () => void
}

export function useAIRenderer(options: Omit<RendererOptions, "onPatch"> = {}): UseAIRendererResult {
  const nodes = shallowRef<ASTNode[]>([])
  const renderer = new Renderer({
    ...options,
    plugins: options.plugins,
    onPatch: (_patches: Patch[], snapshot: ASTNode[]) => { nodes.value = snapshot },
  })
  return {
    nodes,
    push: (c) => renderer.push(c),
    feed: (s) => renderer.feed(s as never),
    reset: () => { renderer.reset(); nodes.value = [] },
  }
}
