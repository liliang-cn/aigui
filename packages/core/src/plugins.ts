import type { AIGuiPlugin, NodeRenderer } from "./types"
import { DebugEmitter } from "./debug-events"
import type { DebugInstrumentationTarget, DebugOptions } from "./debug-events"

export interface CollectNodeRendererOptions extends DebugOptions {
  debugTarget?: DebugInstrumentationTarget
}

/** A function that produces the plugins, loading them first if they are not in the bundle yet. */
export type PluginsLoader = () => AIGuiPlugin[] | Promise<AIGuiPlugin[]>

/**
 * Either the plugins themselves or a function that loads them.
 *
 * Diagrams, maths and charts are the heaviest thing a page carrying them loads, and an answer that
 * never draws one should not pay for them. A loader lets the host defer the import: the renderer
 * shows plain markdown until it resolves and reparses what has arrived by then, so the host does
 * not have to hold the stream or replay it.
 */
export type PluginSource = AIGuiPlugin[] | PluginsLoader

/**
 * Resolve a plugin source to what the caller can act on now: the array itself, or a promise of it.
 *
 * The array form must stay synchronous. Deferring it by a microtask would render the first chunk
 * of every answer under the plain-markdown grammar and then redraw it, which is a visible flash
 * for a host that had its plugins all along.
 */
export function loadPlugins(source?: PluginSource): AIGuiPlugin[] | Promise<AIGuiPlugin[]> {
  if (!source) return []
  return Array.isArray(source) ? source : source()
}

/**
 * Whether two lists hold the same plugins in the same order.
 *
 * `plugins={[chart, katex]}` is a new array on every render and the same two plugins every time.
 * What matters is the members, not the array.
 */
export function samePlugins(a?: AIGuiPlugin[], b?: AIGuiPlugin[]): boolean {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  return a.every((plugin, index) => plugin === b[index])
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
