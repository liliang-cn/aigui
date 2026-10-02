import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
// gifenc ships CommonJS: Node's ES loader puts it under `default`, a bundler or vitest may not.
import * as gifencModule from "gifenc"
import { PNG } from "pngjs"
import { writeFile } from "node:fs/promises"
import { acquirePage, type PageLease } from "./browser"

// Its ES build has the named exports (and `default` is GIFEncoder itself); Node, loading the
// CommonJS build, has only `default`, holding them all.
const gifenc = ("GIFEncoder" in gifencModule ? gifencModule : (gifencModule as unknown as { default: typeof gifencModule }).default) as typeof gifencModule
const { GIFEncoder, applyPalette, quantize } = gifenc

interface AnimPage {
  setViewportSize(size: { width: number; height: number }): Promise<void>
  goto(url: string, options?: { timeout?: number }): Promise<unknown>
  waitForTimeout(ms: number): Promise<void>
  evaluate<R>(fn: () => R): Promise<R>
  screenshot(options: { clip?: { x: number; y: number; width: number; height: number }; type?: "png" }): Promise<Buffer>
  video(): { saveAs(path: string): Promise<void>; delete(): Promise<void> } | null
  close(): Promise<void>
}

export interface AnimationOptions {
  format: "gif" | "webm"
  path: string
  /** How long to capture. Default: one full play of the page's steps, from 4 s to 40 s. */
  durationMs?: number
  /** GIF frames per second. Default 8 — smooth enough for a dot on a link, small enough to send. */
  fps?: number
  width?: number
  theme?: "light" | "dark"
  timeoutMs?: number
}

/**
 * How long one play of the page takes: the longest of its step sequences — a topology's steps at
 * 2.4 s, a scene's at 2.6 s — plus a beat. A page with nothing that steps gets a few seconds of
 * whatever it does on its own: a wall counting up, orbits turning.
 */
function playLength(): number {
  const steps = (sel: string) => Array.from(document.querySelectorAll(sel)).map((bar) => Number(/\/(\d+)/.exec(bar.querySelector("[data-count]")?.textContent ?? "")?.[1] ?? 0))
  const topo = Math.max(0, ...steps("[data-aigui-topology-bar]")) * 2400
  const scene = Math.max(0, ...steps("[data-aigui-scene-bar]")) * 2600
  return Math.max(topo, scene)
}

/**
 * Record a page playing: as an animated GIF, captured frame by frame and encoded here with no
 * external tools, or as a WebM video recorded by the browser.
 *
 * What plays in a page — a topology's steps, a scene's, a wall counting up — is lost the moment it
 * becomes a picture. This is for the places a page cannot go but a GIF can: a chat, a slide, an
 * issue.
 */
export async function exportAnimation(url: string, options: AnimationOptions): Promise<string> {
  const width = options.width ?? 960
  const videoDir = options.format === "webm" ? await mkdtemp(join(tmpdir(), "aigui-video-")) : undefined
  const lease: PageLease = await acquirePage({
    deviceScaleFactor: 1,
    pageOptions: {
      colorScheme: options.theme ?? "light",
      viewport: { width, height: 900 },
      ...(videoDir ? { recordVideo: { dir: videoDir, size: { width, height: 900 } } } : {}),
    },
  })
  const page = lease.page as unknown as AnimPage
  let released = false
  try {
    await page.goto(url, { timeout: options.timeoutMs ?? 20_000 })
    // Let the packs load and the first frame draw before the clock starts.
    await page.waitForTimeout(1500)
    const length = options.durationMs ?? Math.min(40_000, Math.max(4_000, (await page.evaluate(playLength)) + 600))
    // Every player back to step 1, so the capture is one play from the start.
    await page.evaluate(() => document.dispatchEvent(new Event("aigui:restart")))
    if (options.format === "webm") {
      await page.waitForTimeout(length)
      const video = page.video()
      released = true
      await lease.release() // the video is written when its page closes
      if (!video) throw new Error("the browser did not record a video")
      await video.saveAs(options.path)
      return options.path
    }
    const box = await page.evaluate(() => {
      const r = document.getElementById("aigui-root")!.getBoundingClientRect()
      return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.ceil(r.width), height: Math.min(1400, Math.ceil(r.height)) }
    })
    await page.setViewportSize({ width, height: Math.max(900, Math.ceil(box.y + box.height) + 16) })
    const fps = options.fps ?? 8
    const interval = 1000 / fps
    const gif = GIFEncoder()
    const start = Date.now()
    let last = start
    let first = true
    while (Date.now() - start < length) {
      const shot = PNG.sync.read(await page.screenshot({ clip: box, type: "png" }))
      const now = Date.now()
      const palette = quantize(shot.data, 256)
      // Each frame shown for as long as it actually took to capture it, so the GIF runs at the
      // page's own speed even when a screenshot is slower than the frame interval.
      gif.writeFrame(applyPalette(shot.data, palette), shot.width, shot.height, { palette, delay: first ? interval : now - last, repeat: 0 })
      first = false
      last = now
      const wait = interval - (Date.now() - now)
      if (wait > 0) await page.waitForTimeout(wait)
    }
    gif.finish()
    await writeFile(options.path, gif.bytes())
    return options.path
  } finally {
    if (!released) await lease.release()
    if (videoDir) await rm(videoDir, { recursive: true, force: true }).catch(() => {})
  }
}
