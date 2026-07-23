import type { ASTNode } from "@ai-gui/core"
import { renderNodeToElement, type DomRenderContext } from "./render-node-dom"
import type { ManagedElement } from "./render-output"

export interface ReconcileState { els: Map<string, { el: HTMLElement; hash: string }> }

export function createReconcileState(): ReconcileState { return { els: new Map() } }

/** Run a mounted widget's cleanup (if any) before the element leaves the DOM. */
export function disposeEl(el: HTMLElement): void {
  for (const child of el.querySelectorAll<HTMLElement>("*")) disposeManagedEl(child)
  disposeManagedEl(el)
}

function disposeManagedEl(el: HTMLElement): void {
  const managed = el as ManagedElement
  if (managed.__aiguiDisposed) return
  managed.__aiguiDisposed = true
  managed.__aiguiCleanup?.()
  managed.__aiguiCleanup = undefined
}

export function reconcile(container: HTMLElement, nodes: ASTNode[], ctx: DomRenderContext, state: ReconcileState): void {
  const nextKeys = new Set(nodes.map((n) => n.key))
  // remove stale
  for (const [key, entry] of state.els) {
    if (!nextKeys.has(key)) { disposeEl(entry.el); entry.el.remove(); state.els.delete(key) }
  }
  // create/update and order
  let prev: HTMLElement | null = null
  for (const node of nodes) {
    const hash = JSON.stringify(node)
    let entry = state.els.get(node.key)
    if (!entry) {
      const el = renderNodeToElement(node, ctx); entry = { el, hash }; state.els.set(node.key, entry)
    } else if (entry.hash !== hash) {
      // Reuse the same element instance when the node type/shape is unchanged
      // (e.g. streaming text grows), so callers keep stable references. Only
      // swap in a fresh element when in-place update is not possible.
      if (updateElementInPlace(entry.el, node, ctx)) {
        entry.hash = hash
      } else {
        disposeEl(entry.el); const el = renderNodeToElement(node, ctx); entry.el.replaceWith(el); entry.el = el; entry.hash = hash
      }
    }
    // ensure position: insert after prev
    const ref: ChildNode | null = prev ? prev.nextSibling : container.firstChild
    if (entry.el !== ref) container.insertBefore(entry.el, ref)
    prev = entry.el
  }
}

/** Mutate an existing element to reflect the node without replacing it. Returns false when a fresh element is required. */
function updateElementInPlace(el: HTMLElement, node: ASTNode, ctx: DomRenderContext): boolean {
  // Plugin renderers own their complete gate, async state, sanitization, and mount lifecycle.
  if (ctx.nodeRenderers?.[node.type]) return false
  switch (node.type) {
    case "heading":
      if (el.tagName !== (node.tag ?? "h1").toUpperCase()) return false
      el.innerHTML = node.html ?? ""; return true
    case "paragraph":
      if (el.tagName !== "P") return false
      el.innerHTML = node.html ?? ""; return true
    case "code": {
      if (el.tagName !== "PRE") return false
      if (node.attrs?.lang) el.setAttribute("data-lang", node.attrs.lang)
      let code = el.querySelector("code")
      if (!code) { code = document.createElement("code"); el.appendChild(code) }
      code.textContent = node.content ?? ""; return true
    }
    case "hr":
      return el.tagName === "HR"
    case "html":
      if (el.tagName !== "DIV") return false
      el.innerHTML = node.content ?? ""; return true
    case "card":
      // Cards can change state (loading -> valid) or host user factory output; rebuild.
      return false
    default:
      if (el.tagName !== "DIV") return false
      el.innerHTML = node.html ?? node.content ?? ""; return true
  }
}
