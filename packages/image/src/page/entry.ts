import { createRenderer } from "@ai-gui/vanilla"
import { imagePlugins } from "../plugins"

declare global {
  interface Window {
    __aiguiRenderBlock: (
      source: string,
      options?: { width?: number; quietMs?: number },
    ) => Promise<{ width: number; height: number; failed: boolean }>
  }
}

/** A plugin whose promise has not resolved yet. `render-node-dom.ts:52` sets this marker. */
const PENDING = "[data-aigui-async-pending]"
/** A plugin whose promise rejected. `render-node-dom.ts:62` sets this one. */
const FAILED = "[data-aigui-async-error]"

/**
 * Wait until the block has actually finished drawing.
 *
 * AIGUI's node renderers are invoked synchronously but what they start is not: Mermaid renders
 * through an async queue and swaps its SVG in later. There is no settled signal to await, so the
 * subtree is watched and declared finished once it has been still for a beat.
 *
 * Quiet alone is not enough, and that distinction is the whole point. The observer is attached
 * after `push()`, so it never sees the synchronous placeholder the renderer leaves behind — only
 * the later swap. A Mermaid diagram that takes longer than one quiet window would therefore be
 * declared finished while its host was still an empty `data-aigui-async-pending` div, and the
 * screenshot would capture nothing. So a still subtree that still contains a pending marker
 * restarts the clock instead of resolving. The Node side's hard timeout bounds the wait.
 */
function quiescent(root: HTMLElement, quietMs: number): Promise<void> {
  return new Promise((resolve) => {
    let timer = 0
    const observer = new MutationObserver(schedule)
    function schedule(): void {
      window.clearTimeout(timer)
      timer = window.setTimeout(check, quietMs)
    }
    function check(): void {
      if (root.querySelector(PENDING)) {
        schedule()
        return
      }
      observer.disconnect()
      resolve()
    }
    observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true })
    schedule()
  })
}

function frame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
}

window.__aiguiRenderBlock = async (source, options = {}) => {
  const root = document.getElementById("root") as HTMLElement
  root.replaceChildren()
  const renderer = createRenderer(root, { plugins: imagePlugins(options.width) })
  renderer.push(source)
  await quiescent(root, options.quietMs ?? 150)
  await document.fonts.ready
  await frame()
  await frame()
  const box = root.getBoundingClientRect()
  // A plugin that threw leaves an empty host behind. Saying so lets the caller keep the block as
  // text rather than sending a blank picture, which is the worse of the two failures.
  return {
    width: Math.ceil(box.width),
    height: Math.ceil(box.height),
    failed: root.querySelector(FAILED) !== null,
  }
}
