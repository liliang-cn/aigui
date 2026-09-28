import { afterEach, describe, expect, it, vi } from "vitest"
import { BrowserUnavailableError, LAUNCH_ARGS, __resetBrowserForTests, acquirePage, browserCandidates, closeBrowser, launchFirstAvailable } from "./browser"

function fakeLauncher() {
  const closed = { browser: 0, page: 0 }
  const newPage = vi.fn(async (_options?: { deviceScaleFactor?: number }) => ({
    close: async () => {
      closed.page++
    },
  }))
  const launch = vi.fn(async () => ({
    close: async () => {
      closed.browser++
    },
    newPage,
  }))
  return { launch, newPage, closed }
}

afterEach(async () => {
  await __resetBrowserForTests()
})

describe("acquirePage", () => {
  it("launches once and reuses the browser across leases", async () => {
    const { launch } = fakeLauncher()
    const first = await acquirePage({ launcher: launch })
    await first.release()
    const second = await acquirePage({ launcher: launch })
    await second.release()
    expect(launch).toHaveBeenCalledTimes(1)
  })

  it("closes the page after every lease", async () => {
    const { launch, closed } = fakeLauncher()
    const lease = await acquirePage({ launcher: launch })
    await lease.release()
    expect(closed.page).toBe(1)
  })

  it("shuts the browser down once it has been idle", async () => {
    vi.useFakeTimers()
    const { launch, closed } = fakeLauncher()
    const lease = await acquirePage({ launcher: launch, idleShutdownMs: 1000 })
    await lease.release()
    await vi.advanceTimersByTimeAsync(1001)
    expect(closed.browser).toBe(1)
    vi.useRealTimers()
  })

  it("does not shut down while a lease is open", async () => {
    vi.useFakeTimers()
    const { launch, closed } = fakeLauncher()
    await acquirePage({ launcher: launch, idleShutdownMs: 1000 })
    await vi.advanceTimersByTimeAsync(5000)
    expect(closed.browser).toBe(0)
    vi.useRealTimers()
  })

  it("creates the page at the requested pixel density", async () => {
    const { launch, newPage } = fakeLauncher()
    const lease = await acquirePage({ launcher: launch, deviceScaleFactor: 3 })
    await lease.release()
    expect(newPage).toHaveBeenCalledWith({ deviceScaleFactor: 3 })
  })

  it("defaults to 2x, which is what a phone screen wants", async () => {
    const { launch, newPage } = fakeLauncher()
    const lease = await acquirePage({ launcher: launch })
    await lease.release()
    expect(newPage).toHaveBeenCalledWith({ deviceScaleFactor: 2 })
  })

  it("reports a missing Playwright as its own error type", async () => {
    const launcher = async () => {
      throw new Error("Cannot find module 'playwright'")
    }
    await expect(acquirePage({ launcher })).rejects.toBeInstanceOf(BrowserUnavailableError)
  })

  it("relaunches after the browser was closed", async () => {
    const { launch } = fakeLauncher()
    const lease = await acquirePage({ launcher: launch })
    await lease.release()
    await closeBrowser()
    const next = await acquirePage({ launcher: launch })
    await next.release()
    expect(launch).toHaveBeenCalledTimes(2)
  })

  it("does not keep handing out pages from a browser that died", async () => {
    let alive = false
    const launch = vi.fn(async () => ({
      close: async () => {},
      newPage: async () => {
        if (!alive) throw new Error("Target page, context or browser has been closed")
        return { close: async () => {} }
      },
    }))
    await expect(acquirePage({ launcher: launch })).rejects.toThrow("has been closed")
    alive = true
    const lease = await acquirePage({ launcher: launch })
    await lease.release()
    // A dead handle must not be cached, or every render after one crash fails forever.
    expect(launch).toHaveBeenCalledTimes(2)
  })

  it("launches once when two renders arrive together", async () => {
    const { launch } = fakeLauncher()
    const slow = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return launch()
    })
    const [a, b] = await Promise.all([acquirePage({ launcher: slow }), acquirePage({ launcher: slow })])
    await a.release()
    await b.release()
    // Two conversations replying at once must not orphan a Chromium that nothing can close.
    expect(slow).toHaveBeenCalledTimes(1)
  })

  it("does not leak a lease when the page cannot be created", async () => {
    const launch = vi.fn(async () => ({
      close: async () => {},
      newPage: async () => {
        throw new Error("nope")
      },
    }))
    await expect(acquirePage({ launcher: launch })).rejects.toThrow("nope")
    // A leaked lease count would keep the idle shutdown from ever firing.
    const { launch: healthy, closed } = fakeLauncher()
    vi.useFakeTimers()
    const lease = await acquirePage({ launcher: healthy, idleShutdownMs: 1000 })
    await lease.release()
    await vi.advanceTimersByTimeAsync(1001)
    expect(closed.browser).toBe(1)
    vi.useRealTimers()
  })
})

describe("choosing a browser", () => {
  const browser = { close: async () => {}, newPage: async () => ({ close: async () => {} }) }

  it("tries Playwright's Chromium, then Chrome, then Edge", () => {
    expect(browserCandidates({})).toEqual([undefined, "chrome", "msedge"])
  })

  it("lets the host pin one", () => {
    expect(browserCandidates({ AIGUI_BROWSER_CHANNEL: "msedge" })).toEqual(["msedge"])
    expect(browserCandidates({ AIGUI_BROWSER_CHANNEL: "chromium" })).toEqual([undefined])
  })

  it("falls through to the system Chrome when the bundled Chromium was never downloaded", async () => {
    // This is what `npx` gives a first-time user: Playwright installed, its browser not.
    const launch = vi.fn(async (options: { args: string[]; channel?: string }) => {
      if (!options.channel) throw new Error("Executable doesn't exist at ~/.cache/ms-playwright/chromium")
      return browser
    })
    await expect(launchFirstAvailable(launch, [undefined, "chrome", "msedge"])).resolves.toBe(browser)
    expect(launch.mock.calls.map(([options]) => options.channel)).toEqual([undefined, "chrome"])
    // The WebGL flags go to whichever browser is used, or the 3D blocks come out blank.
    expect(launch.mock.calls[1][0].args).toEqual(LAUNCH_ARGS)
  })

  it("reports the first failure when nothing launches, since that one names the missing download", async () => {
    const launch = vi.fn(async (options: { channel?: string }) => {
      throw new Error(options.channel ? `no ${options.channel}` : "run npx playwright install chromium")
    })
    await expect(launchFirstAvailable(launch, [undefined, "chrome"])).rejects.toThrow("playwright install chromium")
  })
})
