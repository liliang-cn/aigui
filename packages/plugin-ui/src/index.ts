import { translator, type AIGuiPlugin, type ASTNode, type NodeRenderContext, type RenderOutput } from "@ai-gui/core"
import { uiCss } from "./css"
import { UI_MESSAGES, format } from "./messages"
import { UIDocumentError } from "./errors"
import { mountUIDocument } from "./mount"
import { uiPromptSpec } from "./prompt"
import { parseUIDocument } from "./validate"
import type { UIPluginOptions } from "./types"

export { uiCss } from "./css"
export { UI_MESSAGES } from "./messages"
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
  const render = (node: ASTNode, context?: NodeRenderContext): RenderOutput => {
    const cached = outputs.get(node)
    if (cached) return cached
    // An explicit plugin locale pins the language; otherwise the renderer's.
    const locale = options.locale ?? context?.locale
    const theme = options.theme ?? context?.theme
    let output: RenderOutput
    if (!node.complete) output = { kind: "html", html: '<div data-aigui-block-loading="" data-block-type="ui"></div>' }
    else if (rejected.has(node)) output = invalidOutput(locale, "invalid.duplicate")
    else {
      try {
        const document = parseUIDocument(node.content ?? "", options)
        output = { kind: "mount", mount: (host, mountContext) => mountUIDocument(host, document, { actionRuntime: options.actionRuntime, mountContext, locale, theme }) }
      } catch (error) {
        output = invalidOutput(locale, undefined, error)
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
    promptSpec: (locale) => uiPromptSpec(options.registry, options.actionRuntime, options.limits, options.locale ?? locale),
    css: uiCss,
  }
}

/**
 * The line shown in place of a block that will not render.
 *
 * It carries the reason when there is a safe one. A UIDocumentError's issues
 * are this plugin's own sentences about the document's shape — "$.root.children[4].text
 * is not allowed." — naming JSON paths and field names, never a value the model
 * wrote and never anything from the host, so they are safe to show and are the
 * only way a reader or an author can tell a typo from a limit. Any other throw
 * is unlabelled: it did not come from the validator and its message is not
 * ours to publish.
 *
 * Written into the DOM as text, not markup, because a path can contain any
 * character the model put in a key.
 */
function invalidOutput(locale?: string, key?: string, error?: unknown): RenderOutput {
  const t = translator(UI_MESSAGES, locale)
  const reason = error instanceof UIDocumentError ? error.issues[0] : undefined
  const text = key ? t(key) : reason ? format(t("invalid.reason"), { reason }) : t("invalid")
  const host = globalThis.document?.createElement?.("div")
  if (!host) return { kind: "html", html: `<div data-aigui-ui-invalid="" role="alert">${escapeText(text)}</div>` }
  host.setAttribute("data-aigui-ui-invalid", "")
  host.setAttribute("role", "alert")
  host.textContent = text
  return { kind: "html", html: host.outerHTML, trusted: true }
}

function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character)
}
