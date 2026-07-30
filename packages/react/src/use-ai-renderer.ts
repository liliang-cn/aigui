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
  // `plugins={[chart, katex]}` is a new array on every render but the same two plugins. What
  // matters is the members, so a fresh array holding the same ones must not count as a change.
  const pluginList = useStableList(options.plugins)

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
  }, [options.registry, options.sanitize, options.rawHtml, options.scheduler, options.debug, options.onDebugEvent])

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

  // Plugins are the one part of the configuration that does not need a new session: the renderer
  // swaps the grammar and reparses the text it already holds. That is what lets a deferred import
  // resolve mid-answer without the host holding the stream back or replaying what it pushed. It
  // runs after the session effect above so the patches land on an armed renderer.
  useEffect(() => {
    session.renderer.setPlugins(pluginList)
  }, [session, pluginList])

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

/** Keep the same array reference for as long as it holds the same members in the same order. */
function useStableList<T>(list: T[] | undefined): T[] | undefined {
  const held = useRef(list)
  const current = held.current
  const same = list === current
    || (!!list && !!current && list.length === current.length && list.every((item, index) => item === current[index]))
  if (!same) held.current = list
  return held.current
}
