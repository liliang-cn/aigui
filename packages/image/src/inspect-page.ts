import { acquirePage, type PageLease } from "./browser"
import { inspectRendered, type Issue } from "./page/inspect"

/** The Playwright page surface this module drives. */
interface InspectPage {
  setViewportSize(size: { width: number; height: number }): Promise<void>
  goto(url: string, options?: { timeout?: number }): Promise<unknown>
  evaluate<R, A>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>
  $eval<R, A>(selector: string, fn: (el: Element, arg: A) => R, arg: A): Promise<R>
}

/**
 * Wait in the page until `selector` has stopped changing and nothing in it is still loading.
 *
 * Self-contained for the same reason as `inspectRendered`: Playwright sends its source text.
 */
async function settle(arg: { selector: string; quietMs: number; maxMs: number; canvasMs: number }): Promise<void> {
  const deadline = Date.now() + arg.maxMs
  const root = document.querySelector(arg.selector)
  if (!root) return
  await new Promise<void>((resolve) => {
    let timer = 0
    const observer = new MutationObserver(schedule)
    function schedule(): void {
      window.clearTimeout(timer)
      timer = window.setTimeout(check, arg.quietMs)
    }
    function check(): void {
      if (root!.querySelector("[data-aigui-async-pending]") && Date.now() < deadline) {
        schedule()
        return
      }
      observer.disconnect()
      resolve()
    }
    observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true })
    schedule()
  })
  await document.fonts.ready
  if (root.querySelector("canvas")) await new Promise((resolve) => window.setTimeout(resolve, arg.canvasMs))
}

export interface InspectPageOptions {
  /** The element whose blocks are looked over. Default `#aigui-root`, the MCP viewer's. */
  selector?: string
  /** Viewport width the page is laid out at. Default 1100, a laptop browser window. */
  width?: number
  timeoutMs?: number
  /** Injected in tests; defaults to the shared headless browser. */
  acquire?: () => Promise<PageLease>
}

/**
 * Open a page the way a reader's browser would, let it draw, and say what a reader would trip
 * over — the same checks a rendered picture gets, for a page nobody has looked at yet.
 */
export async function inspectPage(url: string, options: InspectPageOptions = {}): Promise<Issue[]> {
  const lease = await (options.acquire ?? (() => acquirePage() as unknown as Promise<PageLease>))()
  const page = lease.page as unknown as InspectPage
  const selector = options.selector ?? "#aigui-root"
  try {
    await page.setViewportSize({ width: options.width ?? 1100, height: 900 })
    await page.goto(url, { timeout: options.timeoutMs ?? 20_000 })
    await page.evaluate(settle, { selector, quietMs: 300, maxMs: options.timeoutMs ?? 20_000, canvasMs: 1200 })
    return await page.$eval(selector, inspectRendered, 12)
  } finally {
    await lease.release()
  }
}
