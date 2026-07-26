import type { AIGuiPlugin, NodeRenderer } from "./types"
import { DebugEmitter } from "./debug-events"
import type { DebugInstrumentationTarget, DebugOptions } from "./debug-events"

export interface CollectNodeRendererOptions extends DebugOptions {
  debugTarget?: DebugInstrumentationTarget
}

/** Merge every plugin's `nodeRenderers` into a single map (later plugins win). */
export function collectNodeRenderers(plugins: AIGuiPlugin[] = [], debugOptions: CollectNodeRendererOptions = {}): Record<string, NodeRenderer> {
  const map: Record<string, NodeRenderer> = {}
  const target = debugOptions.debugTarget
  const debug = target ? undefined : debugOptions.debug === true ? new DebugEmitter("renderer", debugOptions) : undefined
  for (const p of plugins) {
    for (const [k, render] of Object.entries(p.nodeRenderers ?? {})) {
      if (!(target?.debugEnabled || debugOptions.debug === true)) {
        map[k] = render
        continue
      }
      map[k] = (node, context) => {
        const emit = (type: string, data: Record<string, unknown>) => target?.emitDebug(type, data) ?? debug?.emit(type, data)
        emit("plugin-render-started", { plugin: p.name, nodeType: node.type, nodeKey: node.key })
        try {
          const output = render(node, context)
          if (isPromise(output)) {
            return output.then(
              (resolved) => {
                emit("async-output-resolved", { plugin: p.name, nodeType: node.type, nodeKey: node.key, outputKind: resolved.kind })
                emit("plugin-render-completed", { plugin: p.name, nodeType: node.type, nodeKey: node.key, outputKind: resolved.kind })
                return resolved
              },
              (error) => {
                emit("async-output-rejected", { plugin: p.name, nodeType: node.type, nodeKey: node.key, error })
                emit("plugin-render-failed", { plugin: p.name, nodeType: node.type, nodeKey: node.key, error })
                throw error
              },
            )
          }
          emit("plugin-render-completed", { plugin: p.name, nodeType: node.type, nodeKey: node.key, outputKind: output.kind })
          return output
        } catch (error) {
          emit("plugin-render-failed", { plugin: p.name, nodeType: node.type, nodeKey: node.key, error })
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

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T>)?.then === "function"
}
