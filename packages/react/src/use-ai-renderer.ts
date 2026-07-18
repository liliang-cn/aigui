import { useCallback, useMemo, useRef, useState } from "react"
import { Renderer, type ASTNode, type Patch, type RendererOptions } from "@aigui/core"
import { applyPatches } from "./apply-patches"

export interface UseAIRendererResult {
  nodes: ASTNode[]
  push: (chunk: string) => void
  feed: (source: AsyncIterable<string> | ReadableStream) => Promise<void>
  reset: () => void
}

export function useAIRenderer(options: Omit<RendererOptions, "onPatch"> = {}): UseAIRendererResult {
  const [nodes, setNodes] = useState<ASTNode[]>([])
  const rendererRef = useRef<Renderer | null>(null)

  const renderer = useMemo(() => {
    const r = new Renderer({
      ...options,
      onPatch: (patches: Patch[]) => setNodes((prev) => applyPatches(prev, patches)),
    })
    rendererRef.current = r
    return r
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.registry, options.sanitize])

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
