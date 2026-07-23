import { sanitizeHtml, type RendererOptions, type RenderOutput, type SanitizeHtmlOptions } from "@ai-gui/core"

export interface ManagedElement extends HTMLElement {
  __aiguiCleanup?: () => void
  __aiguiDisposed?: boolean
}

/** Translate a framework-neutral RenderOutput (from a plugin node renderer) into a DOM element. */
export function renderOutputToElement(out: RenderOutput, sanitize?: RendererOptions["sanitize"]): HTMLElement {
  switch (out.kind) {
    case "html": {
      const el = document.createElement("div")
      el.innerHTML = sanitizeOutput(out.html, sanitize)
      return el
    }
    case "element": {
      const el = document.createElement(out.tag)
      for (const [key, value] of Object.entries(out.props ?? {})) {
        if (key === "class" || key === "className") el.className = String(value)
        else el.setAttribute(key, String(value))
      }
      for (const child of out.children ?? []) el.appendChild(renderOutputToElement(child, sanitize))
      return el
    }
    case "card": {
      const pre = document.createElement("pre")
      pre.setAttribute("data-aigui-card-fallback", "")
      const code = document.createElement("code")
      code.textContent = JSON.stringify(out.data, null, 2)
      pre.appendChild(code)
      return pre
    }
    case "mount": {
      // Host a live widget. Defer mount(el) to a microtask so the reconciler
      // appends this element to the DOM before the widget initializes. Any
      // returned cleanup is stored on the element for the reconcile lifecycle.
      const el = document.createElement("div")
      el.setAttribute("data-aigui-mount", "")
      queueMicrotask(() => {
        if ((el as ManagedElement).__aiguiDisposed) return
        const c = out.mount(el)
        if (typeof c === "function") {
          if ((el as ManagedElement).__aiguiDisposed) c()
          else (el as ManagedElement).__aiguiCleanup = c
        }
      })
      return el
    }
  }
}

function sanitizeOutput(html: string, sanitize: RendererOptions["sanitize"]): string {
  if (sanitize === false) return html
  return sanitizeHtml(html, typeof sanitize === "object" ? sanitize as SanitizeHtmlOptions : undefined)
}
