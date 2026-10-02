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

interface CdpSession {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>
  on(event: string, handler: (payload: { data: string; sessionId: number; metadata: { timestamp: number } }) => void): void
}

interface AnimPage {
  context(): { newCDPSession(page: unknown): Promise<CdpSession> }
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
      // Whole pixels: a fractional edge would cut a frame's rows short of whole RGBA pixels.
      return { x: Math.max(0, Math.floor(r.x)), y: Math.max(0, Math.floor(r.y)), width: Math.ceil(r.width), height: Math.min(1400, Math.ceil(r.height)) }
    })
    await page.setViewportSize({ width, height: Math.max(900, Math.ceil(box.y + box.height) + 16) })
    const fps = options.fps ?? 12
    const gif = GIFEncoder()
    const captured = await captureFrames(page, box, length, fps)
    // A frame the same as the one before only lengthens it: a step holding still is one frame
    // shown for longer, not a dozen identical ones.
    const same = (a: Frame, b: Frame) => a.width === b.width && a.height === b.height && Buffer.compare(Buffer.from(a.data.buffer, a.data.byteOffset, a.data.byteLength), Buffer.from(b.data.buffer, b.data.byteOffset, b.data.byteLength)) === 0
    const frames = captured.filter((frame, i) => i === 0 || !same(frame, captured[i - 1]))
    for (const [i, frame] of frames.entries()) {
      const palette = quantize(frame.data, 256)
      // Shown for as long as it was on screen, so the GIF runs at the page's own speed.
      const delay = i + 1 < frames.length ? frames[i + 1].at - frame.at : Math.max(1000 / fps, length - frame.at)
      gif.writeFrame(applyPalette(frame.data, palette), frame.width, frame.height, { palette, delay, repeat: 0 })
    }
    gif.finish()
    await writeFile(options.path, gif.bytes())
    return options.path
  } finally {
    if (!released) await lease.release()
    if (videoDir) await rm(videoDir, { recursive: true, force: true }).catch(() => {})
  }
}

interface Frame {
  data: Uint8Array
  width: number
  height: number
  /** Milliseconds since capture began. */
  at: number
}

/**
 * Frames of `box` for `length` ms, at most `fps` a second.
 *
 * The browser's own screencast where there is one: it pushes a frame each time the page paints,
 * at the page's speed, where a screenshot per frame costs a round trip and a full encode and fell
 * to two frames a second. Screenshots remain the fallback for a browser without one.
 */
async function captureFrames(page: AnimPage, box: { x: number; y: number; width: number; height: number }, length: number, fps: number): Promise<Frame[]> {
  const crop = (png: PNG): Frame => {
    const width = Math.floor(Math.min(box.width, png.width - box.x))
    const height = Math.floor(Math.min(box.height, png.height - box.y))
    const data = new Uint8Array(width * height * 4)
    for (let row = 0; row < height; row++) {
      const from = ((box.y + row) * png.width + box.x) * 4
      data.set(png.data.subarray(from, from + width * 4), row * width * 4)
    }
    return { data, width, height, at: 0 }
  }
  const frames: Frame[] = []
  const minGap = 1000 / fps
  let cdp: CdpSession | undefined
  try {
    cdp = await page.context().newCDPSession(page)
  } catch {
    cdp = undefined
  }
  if (cdp) {
    const session = cdp
    let start = 0
    let last = -Infinity
    session.on("Page.screencastFrame", (frame) => {
      void session.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {})
      const at = frame.metadata.timestamp * 1000
      if (!start) start = at
      if (at - last < minGap) return
      last = at
      const shot = crop(PNG.sync.read(Buffer.from(frame.data, "base64")))
      frames.push({ ...shot, at: at - start })
    })
    await session.send("Page.startScreencast", { format: "png", everyNthFrame: 1 })
    await page.waitForTimeout(length)
    await session.send("Page.stopScreencast").catch(() => {})
    // A page that painted nothing at all in that time still makes a one-frame picture.
    if (frames.length > 0) return frames
  }
  const start = Date.now()
  while (Date.now() - start < length) {
    const at = Date.now() - start
    frames.push({ ...crop(PNG.sync.read(await page.screenshot({ type: "png" }))), at })
    const wait = minGap - (Date.now() - start - at)
    if (wait > 0) await page.waitForTimeout(wait)
  }
  return frames
}
