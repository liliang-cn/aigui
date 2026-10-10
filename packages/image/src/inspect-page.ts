import { acquirePage, type PageLease } from "./browser"
import { inspectRendered, type Issue } from "./page/inspect"

/** The Playwright page surface this module drives. */
interface InspectPage {
  screenshot(options: { path: string; fullPage?: boolean }): Promise<unknown>
  pdf(options: { path: string; printBackground?: boolean; format?: string; margin?: Record<string, string> }): Promise<unknown>
  emulateMedia(options: { media?: "screen" | "print" | null; colorScheme?: "light" | "dark" | null }): Promise<void>
  setViewportSize(size: { width: number; height: number }): Promise<void>
  goto(url: string, options?: { timeout?: number }): Promise<unknown>
  evaluate<R, A>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>
  $eval<R, A>(selector: string, fn: (el: Element, arg: A) => R, arg: A): Promise<R>
  locator(selector: string): { screenshot(options?: { type?: "png"; timeout?: number }): Promise<Uint8Array> }
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
    // A page that animates — a topology playing its steps — never goes quiet. Waiting for quiet
    // alone hung aigui_open; past the deadline, what is on screen is what gets looked at.
    const hard = window.setTimeout(() => {
      observer.disconnect()
      window.clearTimeout(timer)
      resolve()
    }, Math.max(0, deadline - Date.now()))
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
      window.clearTimeout(hard)
      resolve()
    }
    observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true })
    schedule()
  })
  await document.fonts.ready
  if (root.querySelector("canvas")) await new Promise((resolve) => window.setTimeout(resolve, arg.canvasMs))
}

/** The page drawn as a picture: a viewer that knows `?still` plays nothing. */
const still = (url: string) => `${url}${url.includes("?") ? "&" : "?"}still`

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
    await page.goto(still(url), { timeout: options.timeoutMs ?? 20_000 })
    // Quiet for 300ms, or — for a page that animates — 4s of drawing, whichever comes first.
    await page.evaluate(settle, { selector, quietMs: 300, maxMs: 4_000, canvasMs: 1200 })
    return await page.$eval(selector, inspectRendered, 12)
  } finally {
    await lease.release()
  }
}

export interface ExportPageOptions {
  format: "png" | "pdf"
  /** Where the file is written. */
  path: string
  /** Colour scheme the page is drawn in, for a page that follows the system. Default light. */
  theme?: "light" | "dark"
  width?: number
  timeoutMs?: number
  acquire?: () => Promise<PageLease>
}

/**
 * Save a page as one PNG of its whole length, or as a PDF.
 *
 * The page is opened, left to draw — charts, 3D, a topology mid-play is caught where it is — and
 * captured the way it looks on screen. The PDF uses the page's print styles, which drop the
 * buttons a sheet of paper cannot press.
 */
export async function exportPage(url: string, options: ExportPageOptions): Promise<string> {
  const lease = await (options.acquire ?? (() => acquirePage() as unknown as Promise<PageLease>))()
  const page = lease.page as unknown as InspectPage
  try {
    await page.emulateMedia({ colorScheme: options.theme ?? "light" })
    await page.setViewportSize({ width: options.width ?? 1100, height: 900 })
    await page.goto(still(url), { timeout: options.timeoutMs ?? 20_000 })
    await page.evaluate(settle, { selector: "body", quietMs: 300, maxMs: 4_000, canvasMs: 1500 })
    if (options.format === "png") await page.screenshot({ path: options.path, fullPage: true })
    else await page.pdf({ path: options.path, printBackground: true, format: "A4", margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" } })
    return options.path
  } finally {
    // The shared page is reused: leave it as other renders expect to find it.
    await page.emulateMedia({ colorScheme: null }).catch(() => {})
    await lease.release()
  }
}

export interface ExportBlockOptions {
  /** Which top-level block, counted from 1 as the page's comments count them. */
  block: number
  theme?: "light" | "dark"
  width?: number
  timeoutMs?: number
  acquire?: () => Promise<PageLease>
}

/**
 * One block of a page as a PNG, at the shared page's device scale (2× by default): what a
 * reader's Save button asks for. The whole page is drawn still and left to settle first, so a
 * chart, a WebGL scene or a topology comes out as it looks, which a browser's own canvas export
 * cannot promise for every kind.
 */
export async function exportBlock(url: string, options: ExportBlockOptions): Promise<Uint8Array> {
  const lease = await (options.acquire ?? (() => acquirePage() as unknown as Promise<PageLease>))()
  const page = lease.page as unknown as InspectPage
  try {
    await page.emulateMedia({ colorScheme: options.theme ?? "light" })
    await page.setViewportSize({ width: options.width ?? 1100, height: 900 })
    await page.goto(still(url), { timeout: options.timeoutMs ?? 20_000 })
    await page.evaluate(settle, { selector: "body", quietMs: 300, maxMs: 4_000, canvasMs: 1500 })
    const index = Math.max(1, Math.trunc(options.block))
    return await page.locator(`#aigui-root > :nth-child(${index})`).screenshot({ type: "png", timeout: options.timeoutMs ?? 20_000 })
  } finally {
    await page.emulateMedia({ colorScheme: null }).catch(() => {})
    await lease.release()
  }
}
