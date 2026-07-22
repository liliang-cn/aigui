import { sanitizeHtml, type RenderOutput } from "@ai-gui/core"

/** Translate a framework-neutral RenderOutput (from a plugin node renderer) into a DOM element. */
export function renderOutputToElement(out: RenderOutput): HTMLElement {
  switch (out.kind) {
    case "html": {
      const el = document.createElement("div")
      el.innerHTML = sanitizeHtml(out.html)
      return el
    }
    case "element": {
      const el = document.createElement(out.tag)
      for (const [key, value] of Object.entries(out.props ?? {})) {
        if (key === "class" || key === "className") el.className = String(value)
        else el.setAttribute(key, String(value))
      }
      for (const child of out.children ?? []) el.appendChild(renderOutputToElement(child))
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
        const c = out.mount(el)
        if (typeof c === "function") (el as { __aiguiCleanup?: () => void }).__aiguiCleanup = c
      })
      return el
    }
  }
}
