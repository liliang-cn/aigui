/**
 * The Comment button a served page carries: pick a block, say what should change, send it to the
 * agent, which reads it with `aigui_feedback`.
 *
 * Only on a page served by the agent's own session — a page opened from disk, or one whose
 * session has ended, has nowhere to send a comment, and shows no button that would pretend to.
 */
export async function enableComments(root: HTMLElement): Promise<void> {
  if (!location.protocol.startsWith("http")) return
  const ok = await fetch("/ping").then((r) => r.ok).catch(() => false)
  if (!ok) return

  const style = document.createElement("style")
  style.textContent = [
    "[data-aigui-comment-bar]{position:fixed;top:12px;right:12px;z-index:50;display:flex;gap:8px;font:13px/1.4 system-ui,sans-serif}",
    "[data-aigui-comment-bar] button{font:inherit;border:1px solid var(--rule,#ccc);background:var(--bg,#fff);color:var(--fg,#111);border-radius:6px;padding:4px 10px;cursor:pointer}",
    "[data-aigui-commenting] #aigui-root>*:hover{outline:2px dashed #0ea5e9;outline-offset:4px;cursor:pointer}",
    "[data-aigui-comment-box]{position:fixed;z-index:51;right:12px;top:48px;width:min(360px,calc(100vw - 24px));background:var(--bg,#fff);color:var(--fg,#111);border:1px solid var(--rule,#ccc);border-radius:8px;padding:10px;box-shadow:0 6px 24px rgba(0,0,0,.15);font:13px/1.4 system-ui,sans-serif}",
    "[data-aigui-comment-box] textarea{width:100%;box-sizing:border-box;min-height:84px;font:inherit;margin:6px 0}",
    "[data-aigui-comment-box] .row{display:flex;gap:8px;justify-content:flex-end}",
    "[data-aigui-comment-toast]{position:fixed;bottom:16px;right:16px;z-index:52;background:#0f172a;color:#fff;padding:8px 12px;border-radius:6px;font:13px system-ui,sans-serif}",
    "@media print{[data-aigui-comment-bar],[data-aigui-comment-box]{display:none}}",
  ].join("")
  document.head.appendChild(style)

  const toggle = document.createElement("button")
  toggle.type = "button"
  toggle.textContent = "Comment"
  // Beside the page's own buttons when it has them; floating in the corner when it does not.
  const nav = document.querySelector("header nav")
  if (nav) nav.prepend(toggle)
  else {
    const bar = document.createElement("div")
    bar.setAttribute("data-aigui-comment-bar", "")
    bar.appendChild(toggle)
    document.body.appendChild(bar)
  }

  const toast = (text: string) => {
    const t = document.createElement("div")
    t.setAttribute("data-aigui-comment-toast", "")
    t.textContent = text
    document.body.appendChild(t)
    setTimeout(() => t.remove(), 2600)
  }
  const kindOf = (el: Element): string => {
    for (const node of [el, ...Array.from(el.querySelectorAll("*")).slice(0, 40)]) {
      for (const name of node.getAttributeNames()) {
        const m = /^data-aigui-([a-z0-9]+)$/.exec(name)
        if (m && !["issue", "renderer", "mount", "style", "node", "block"].includes(m[1])) return m[1]
      }
    }
    return el.tagName.toLowerCase() === "pre" ? "code" : "markdown"
  }

  let picking = false
  const setPicking = (on: boolean) => {
    picking = on
    toggle.textContent = on ? "Pick a block…" : "Comment"
    document.documentElement.toggleAttribute("data-aigui-commenting", on)
  }
  toggle.onclick = () => setPicking(!picking)

  root.addEventListener(
    "click",
    (event) => {
      if (!picking) return
      const block = (event.target as Element).closest("#aigui-root > *")
      if (!block) return
      event.preventDefault()
      event.stopPropagation()
      setPicking(false)
      const index = Array.from(root.children).indexOf(block) + 1
      const kind = kindOf(block)
      const excerpt = (block.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80)
      document.querySelector("[data-aigui-comment-box]")?.remove()
      const box = document.createElement("div")
      box.setAttribute("data-aigui-comment-box", "")
      const head = document.createElement("div")
      head.textContent = `Block ${index} · ${kind}`
      const area = document.createElement("textarea")
      area.placeholder = "What should change?"
      const row = document.createElement("div")
      row.className = "row"
      const cancel = document.createElement("button")
      cancel.type = "button"
      cancel.textContent = "Cancel"
      const send = document.createElement("button")
      send.type = "button"
      send.textContent = "Send to agent"
      row.append(cancel, send)
      box.append(head, area, row)
      document.body.appendChild(box)
      area.focus()
      cancel.onclick = () => box.remove()
      send.onclick = async () => {
        const comment = area.value.trim()
        if (!comment) return
        const page = decodeURIComponent(location.pathname.split("/").pop() ?? "")
        const res = await fetch("/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ page, block: index, kind, excerpt, comment }) }).catch(() => undefined)
        box.remove()
        toast(res?.ok ? "Sent — ask the agent to read your comments." : "Could not send: the agent's session may have ended.")
      }
    },
    true,
  )
}
