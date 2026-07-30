import { useEffect, useState } from "react"
import type { AIGuiPlugin, PluginSource, PluginsLoader } from "@ai-gui/core"

export interface UsePluginsResult {
  /** The plugins in force now: an array source as given, a loader's plugins once they arrive. */
  plugins?: AIGuiPlugin[]
  /** Why the loader failed, if it did. The answer keeps rendering as plain markdown. */
  error?: unknown
}

/**
 * Resolve a plugin source, loading it if it is a function.
 *
 * Diagrams, maths and charts are the heaviest thing a page carrying them loads, and an answer that
 * draws none should not pay for them. An array is returned as it came — deferring it by a
 * microtask would draw the first chunk of every answer twice — while a loader's plugins arrive
 * later and the renderer reparses what it has buffered by then.
 *
 * Pass a stable loader: it runs again whenever its identity changes, so define it outside the
 * component or wrap it in `useCallback`.
 */
export function usePlugins(source?: PluginSource): UsePluginsResult {
  const loader = typeof source === "function" ? source : undefined
  const [loaded, setLoaded] = useState<{ loader: PluginsLoader; plugins?: AIGuiPlugin[]; error?: unknown }>()
  useEffect(() => {
    if (!loader) return
    let live = true
    void Promise.resolve()
      .then(loader)
      .then(
        (plugins) => { if (live) setLoaded({ loader, plugins }) },
        (error) => { if (live) setLoaded({ loader, error }) },
      )
    return () => { live = false }
  }, [loader])
  if (!loader) return { plugins: source as AIGuiPlugin[] | undefined }
  // A result belonging to the previous loader is not this one's answer.
  return loaded?.loader === loader ? { plugins: loaded.plugins, error: loaded.error } : {}
}
