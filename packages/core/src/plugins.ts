import type { AIGuiPlugin, NodeRenderer } from "./types"
import { DebugEmitter } from "./debug-events"
import type { DebugOptions } from "./debug-events"

/** Merge every plugin's `nodeRenderers` into a single map (later plugins win). */
export function collectNodeRenderers(plugins: AIGuiPlugin[] = [], debugOptions: DebugOptions = {}): Record<string, NodeRenderer> {
  const map: Record<string, NodeRenderer> = {}
  const debug = new DebugEmitter("renderer", debugOptions)
  for (const p of plugins) {
    for (const [k, render] of Object.entries(p.nodeRenderers ?? {})) {
      map[k] = (node) => {
        if (node.complete === false) {
          return { kind: "html", html: `<div data-aigui-block-loading="" data-block-type="${escapeAttr(node.type)}"></div>` }
        }
        if (!debug.active) return render(node)
        debug.emit("plugin-render-started", { plugin: p.name, nodeType: node.type, nodeKey: node.key })
        try {
          const output = render(node)
          if (isPromise(output)) {
            return output.then(
              (resolved) => {
                debug.emit("async-output-resolved", { plugin: p.name, nodeType: node.type, nodeKey: node.key, outputKind: resolved.kind })
                debug.emit("plugin-render-completed", { plugin: p.name, nodeType: node.type, nodeKey: node.key, outputKind: resolved.kind })
                return resolved
              },
              (error) => {
                debug.emit("async-output-rejected", { plugin: p.name, nodeType: node.type, nodeKey: node.key, error })
                debug.emit("plugin-render-failed", { plugin: p.name, nodeType: node.type, nodeKey: node.key, error })
                throw error
              },
            )
          }
          debug.emit("plugin-render-completed", { plugin: p.name, nodeType: node.type, nodeKey: node.key, outputKind: output.kind })
          return output
        } catch (error) {
          debug.emit("plugin-render-failed", { plugin: p.name, nodeType: node.type, nodeKey: node.key, error })
          throw error
        }
      }
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

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T>)?.then === "function"
}
