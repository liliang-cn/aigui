import type { AIGuiPlugin, NodeRenderer } from "./types"

/** Merge every plugin's `nodeRenderers` into a single map (later plugins win). */
export function collectNodeRenderers(plugins: AIGuiPlugin[] = []): Record<string, NodeRenderer> {
  const map: Record<string, NodeRenderer> = {}
  for (const p of plugins) {
    for (const [k, render] of Object.entries(p.nodeRenderers ?? {})) {
      map[k] = (node) => node.complete === false
        ? { kind: "html", html: `<div data-aigui-block-loading="" data-block-type="${escapeAttr(node.type)}"></div>` }
        : render(node)
    }
  }
  return map
}

/** The set of node types claimed by the given plugins. */
export function pluginNodeTypes(plugins: AIGuiPlugin[] = []): Set<string> {
  return new Set(Object.keys(collectNodeRenderers(plugins)))
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
}
