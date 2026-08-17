import { DEFAULT_IDLE_SHUTDOWN_MS, DEFAULT_SCALE } from "./types"

/** The slice of Playwright this package uses. Kept minimal so tests can supply a stand-in. */
export interface PageLike {
  close(): Promise<void>
}
export interface BrowserLike {
  /**
   * `deviceScaleFactor` can only be set when the page is created — `setViewportSize` does not
   * accept it. Getting this wrong is invisible in code review and obvious on a phone: the picture
   * arrives at half the resolution it should.
   */
  newPage(options?: { deviceScaleFactor?: number }): Promise<PageLike>
  close(): Promise<void>
}
export type Launcher = () => Promise<BrowserLike>

/** Playwright is an optional peer. Its absence is a configuration fact, not a bug. */
export class BrowserUnavailableError extends Error {
  constructor(cause: unknown) {
    super("Playwright is not installed. Run `pnpm add playwright` and `pnpm exec playwright install chromium`.")
    this.name = "BrowserUnavailableError"
    this.cause = cause
  }
}

export interface AcquireOptions {
  launcher?: Launcher
  idleShutdownMs?: number
  deviceScaleFactor?: number
}

export interface PageLease {
  page: PageLike
  release(): Promise<void>
}

const defaultLauncher: Launcher = async () => {
  const playwright = await import("playwright")
  return await playwright.chromium.launch({ args: ["--font-render-hinting=none"] })
}

let browser: BrowserLike | undefined
let leases = 0
let idleTimer: ReturnType<typeof setTimeout> | undefined

function cancelIdle(): void {
  if (idleTimer === undefined) return
  clearTimeout(idleTimer)
  idleTimer = undefined
}

/**
 * Close the browser once nobody has wanted one for a while.
 *
 * A gateway can go hours between charts, and a resident Chromium is a few hundred megabytes of
 * nothing. Launching costs about a second, which is affordable on the first chart of a burst and
 * free on the rest.
 */
function scheduleIdleShutdown(idleShutdownMs: number): void {
  cancelIdle()
  idleTimer = setTimeout(() => {
    if (leases > 0) return
    void closeBrowser()
  }, idleShutdownMs)
  // Node's timer has `.unref()` so it doesn't keep the event loop alive on its own; the DOM
  // `setTimeout` overload returns a plain number and has no such method. This package has no
  // dependency on @types/node, so `ReturnType<typeof setTimeout>` resolves to whichever ambient
  // overload the consuming tsconfig's `lib` picks — cast defensively rather than assume either one.
  ;(idleTimer as unknown as { unref?: () => void }).unref?.()
}

export async function acquirePage(options: AcquireOptions = {}): Promise<PageLease> {
  const launcher = options.launcher ?? defaultLauncher
  const idleShutdownMs = options.idleShutdownMs ?? DEFAULT_IDLE_SHUTDOWN_MS
  cancelIdle()
  if (!browser) {
    try {
      browser = await launcher()
    } catch (error) {
      throw new BrowserUnavailableError(error)
    }
  }
  let page: PageLike
  try {
    page = await browser.newPage({ deviceScaleFactor: options.deviceScaleFactor ?? DEFAULT_SCALE })
  } catch (error) {
    // The cached browser is dead — a crash, or an OOM kill. Keeping the handle would fail every
    // render from here on, so drop it and let the next call launch a fresh one.
    browser = undefined
    throw error
  }
  leases++
  let released = false
  return {
    page,
    async release() {
      if (released) return
      released = true
      leases--
      await page.close().catch(() => {})
      if (leases === 0) scheduleIdleShutdown(idleShutdownMs)
    },
  }
}

export async function closeBrowser(): Promise<void> {
  cancelIdle()
  const current = browser
  browser = undefined
  await current?.close().catch(() => {})
}

/** Drops all module state. Tests only. */
export async function __resetBrowserForTests(): Promise<void> {
  leases = 0
  await closeBrowser()
}
