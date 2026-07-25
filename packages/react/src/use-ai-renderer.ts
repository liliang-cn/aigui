import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Renderer, type ASTNode, type FeedOptions, type FeedSource, type Patch, type RendererOptions } from "@ai-gui/core"
import { applyPatches } from "./apply-patches"

export interface UseAIRendererResult {
  renderer: Renderer
  nodes: ASTNode[]
  push: (chunk: string) => void
  feed: (source: FeedSource, options?: FeedOptions) => Promise<void>
  reset: () => void
}

export function useAIRenderer(options: Omit<RendererOptions, "onPatch"> = {}): UseAIRendererResult {
  const [nodes, setNodes] = useState<ASTNode[]>([])
  const active = useRef<object | null>(null)

  const session = useMemo(() => {
    const token = {}
    const renderer = new Renderer({
      ...options,
      onPatch: (patches: Patch[]) => {
        if (active.current === token) setNodes((current) => applyPatches(current, patches))
      },
    })
    active.current = token
    return { renderer, token }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.registry, options.sanitize, options.plugins, options.scheduler, options.debug, options.onDebugEvent])

  useEffect(() => {
    // Re-arm on every mount, not just when the session is created: StrictMode's development
    // remount (and Fast Refresh) tears this effect down and runs it again on the same session,
    // and without this the cleanup below would leave the renderer permanently deaf to push/feed.
    active.current = session.token
    setNodes([])
    return () => {
      session.renderer.reset()
      if (active.current === session.token) {
        active.current = null
      }
    }
  }, [session])

  const push = useCallback((chunk: string) => {
    if (active.current === session.token) session.renderer.push(chunk)
  }, [session])
  const feed = useCallback((source: FeedSource, feedOptions?: FeedOptions) => (
    active.current === session.token ? session.renderer.feed(source, feedOptions) : Promise.resolve()
  ), [session])
  const reset = useCallback(() => {
    session.renderer.reset()
    setNodes([])
  }, [session])

  return { renderer: session.renderer, nodes, push, feed, reset }
}
