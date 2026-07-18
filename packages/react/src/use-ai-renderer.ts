import { useCallback, useMemo, useState } from "react"
import { Renderer, type ASTNode, type Patch, type RendererOptions } from "@aigui/core"

export interface UseAIRendererResult {
  nodes: ASTNode[]
  push: (chunk: string) => void
  feed: (source: AsyncIterable<string> | ReadableStream) => Promise<void>
  reset: () => void
}

export function useAIRenderer(options: Omit<RendererOptions, "onPatch"> = {}): UseAIRendererResult {
  const [nodes, setNodes] = useState<ASTNode[]>([])

  const renderer = useMemo(() => {
    return new Renderer({
      ...options,
      onPatch: (_patches: Patch[], nextNodes: ASTNode[]) => setNodes(nextNodes),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.registry, options.sanitize, options.plugins])

  const push = useCallback((chunk: string) => renderer.push(chunk), [renderer])
  const feed = useCallback(
    (source: AsyncIterable<string> | ReadableStream) => renderer.feed(source as never),
    [renderer],
  )
  const reset = useCallback(() => {
    renderer.reset()
    setNodes([])
  }, [renderer])

  return { nodes, push, feed, reset }
}
