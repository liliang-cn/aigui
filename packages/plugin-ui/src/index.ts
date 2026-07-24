import type { AIGuiPlugin, ASTNode, RenderOutput } from "@ai-gui/core"
import { uiCss } from "./css"
import { mountUIDocument } from "./mount"
import { uiPromptSpec } from "./prompt"
import { parseUIDocument } from "./validate"
import type { UIPluginOptions } from "./types"

export { uiCss } from "./css"
export { UIDocumentError, UILimitError } from "./errors"
export { DEFAULT_UI_LIMITS, resolveUILimits } from "./limits"
export { mountUIDocument } from "./mount"
export { uiPromptSpec } from "./prompt"
export { parseUIDocument, resolveBoundJSON, validateUIDocument } from "./validate"
export type * from "./types"

export function ui(options: UIPluginOptions): AIGuiPlugin {
  if (!options?.registry || !options?.actionRuntime) throw new TypeError("ui() requires registry and actionRuntime.")
  const outputs = new WeakMap<ASTNode, RenderOutput>()
  const rejected = new WeakSet<ASTNode>()
  const render = (node: ASTNode): RenderOutput => {
    const cached = outputs.get(node)
    if (cached) return cached
    let output: RenderOutput
    if (!node.complete) output = { kind: "html", html: '<div data-aigui-block-loading="" data-block-type="ui"></div>' }
    else if (rejected.has(node)) output = invalidOutput()
    else {
      try {
        const document = parseUIDocument(node.content ?? "", options)
        output = { kind: "mount", mount: (host, mountContext) => mountUIDocument(host, document, { actionRuntime: options.actionRuntime, mountContext }) }
      } catch {
        output = invalidOutput()
      }
    }
    outputs.set(node, output)
    return output
  }
  return {
    name: "ui",
    nodeRenderers: { ui: render },
    onASTCommit: (nodes) => {
      let accepted = false
      for (const node of nodes) {
        if (node.type !== "ui" || !node.complete) continue
        if (accepted) rejected.add(node)
        else accepted = true
      }
    },
    promptSpec: () => uiPromptSpec(options.registry, options.actionRuntime, options.limits),
    css: uiCss,
  }
}

function invalidOutput(): RenderOutput {
  return { kind: "html", html: '<div data-aigui-ui-invalid="" role="alert">Invalid UI.</div>' }
}
