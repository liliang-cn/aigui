export { collectNodeRenderers, pluginNodeTypes } from "@ai-gui/core"
export type {
  AIGuiPlugin,
  ASTNode,
  CardDef,
  CollectNodeRendererOptions,
  JSONSchema,
  NodeRenderer,
  MountCardSlotRequest,
  MountedCardSlot,
  PluginCommitContext,
  RenderMountContext,
  RenderOutput,
} from "@ai-gui/core"

import type { AIGuiPlugin, ASTNode, NodeRenderer, RenderMountContext, RenderOutput } from "@ai-gui/core"

/** Define a plugin while preserving the concrete type of its configuration. */
export function definePlugin<const TPlugin extends AIGuiPlugin>(plugin: TPlugin): TPlugin {
  return plugin
}

/** Create a complete plugin node with deterministic defaults for tests. */
export function createTestNode(type: string, overrides: Omit<Partial<ASTNode>, "type"> = {}): ASTNode {
  return { key: `test:${type}`, type, complete: true, ...overrides }
}

/** Return a plugin renderer or throw when the node type is not registered. */
export function getPluginRenderer(plugin: AIGuiPlugin, nodeType: string): NodeRenderer {
  const renderer = plugin.nodeRenderers?.[nodeType]
  if (!renderer) {
    throw new Error(`Plugin "${plugin.name}" does not define a renderer for node type "${nodeType}".`)
  }
  return renderer
}

/** Render a node through its plugin renderer and normalize sync output to a promise. */
export async function renderPluginNode(plugin: AIGuiPlugin, node: ASTNode): Promise<RenderOutput> {
  return getPluginRenderer(plugin, node.type)(node)
}

/** Mount a mount output into a supplied element and return an idempotent cleanup. */
export function mountOutputForTest(output: RenderOutput, element: HTMLElement, context: RenderMountContext = {}): () => void {
  if (output.kind !== "mount") {
    throw new Error(`Expected a "mount" render output, received "${output.kind}".`)
  }

  const dispose = output.mount(element, context)
  let cleaned = false
  return () => {
    if (cleaned) return
    cleaned = true
    dispose?.()
  }
}
