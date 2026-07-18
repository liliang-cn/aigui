import type { AIGuiPlugin, NodeRenderer } from "./types"

/** Merge every plugin's `nodeRenderers` into a single map (later plugins win). */
export function collectNodeRenderers(plugins: AIGuiPlugin[] = []): Record<string, NodeRenderer> {
  const map: Record<string, NodeRenderer> = {}
  for (const p of plugins) for (const [k, v] of Object.entries(p.nodeRenderers ?? {})) map[k] = v
  return map
}

/** The set of node types claimed by the given plugins. */
export function pluginNodeTypes(plugins: AIGuiPlugin[] = []): Set<string> {
  return new Set(Object.keys(collectNodeRenderers(plugins)))
}
