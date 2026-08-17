import { mkdir } from "node:fs/promises"
import { createRequire } from "node:module"
import { join } from "node:path"
import type { CardRegistry } from "@ai-gui/core"
import { selectRenderableBlocks, stripBlocks } from "./blocks"
import { acquirePage, type PageLease } from "./browser"
import { pageHtml } from "./page/html"
import {
  type BlockSelection,
  DEFAULT_SCALE,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_WIDTH,
  type RenderedImage,
  type RenderOptions,
  type RenderResult,
} from "./types"

/** The Playwright page surface this module drives. */
interface RenderPage {
  setViewportSize(size: { width: number; height: number }): Promise<void>
  setContent(html: string): Promise<void>
  addScriptTag(options: { path: string }): Promise<void>
  evaluate(fn: (arg: { source: string; width: number }) => unknown, arg: { source: string; width: number }): Promise<unknown>
  locator(selector: string): { screenshot(options: { path: string }): Promise<unknown> }
}

export interface InternalRenderOptions extends RenderOptions {
  registry?: CardRegistry
  /** Injected in tests. Defaults to the module's own lazy Chromium. */
  acquire?: (options: {
    idleShutdownMs?: number
    deviceScaleFactor?: number
  }) => Promise<{ page: unknown; release: () => Promise<void> }>
}

const require_ = createRequire(import.meta.url)

/** The built browser bundle that ships alongside this module. */
function pageBundlePath(): string {
  return join(require_.resolve("@ai-gui/image/package.json"), "..", "dist", "page", "entry.js")
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * Draw every renderable block in `markdown` and return the leftover text plus the pictures.
 *
 * A block that fails is left alone: its source stays in the text, so a reader gets the raw fence
 * rather than a silently missing answer. Only blocks that actually produced a file are stripped.
 */
export async function renderMarkdownToImages(
  markdown: string,
  options: InternalRenderOptions,
): Promise<RenderResult> {
  const selections = selectRenderableBlocks(markdown, {
    kinds: options.kinds,
    registry: options.registry,
    max: options.max,
  })
  if (selections.length === 0) return { text: markdown, images: [] }

  await mkdir(options.outDir, { recursive: true })
  const acquire = options.acquire ?? ((opts) => acquirePage(opts) as unknown as Promise<PageLease>)
  const width = options.width ?? DEFAULT_WIDTH
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const lease = await acquire({
    idleShutdownMs: options.idleShutdownMs,
    deviceScaleFactor: options.scale ?? DEFAULT_SCALE,
  })
  const page = lease.page as RenderPage

  const images: RenderedImage[] = []
  const rendered: BlockSelection[] = []
  try {
    await page.setViewportSize({ width, height: 800 })
    await page.setContent(pageHtml({ theme: options.theme, width }))
    await page.addScriptTag({ path: pageBundlePath() })

    for (const [index, selection] of selections.entries()) {
      const source = markdown.slice(selection.start, selection.end)
      const path = join(options.outDir, `aigui-${selection.kind}-${index}-${process.pid}-${images.length}.png`)
      try {
        const size = (await withTimeout(
          // A real function, not a string. Playwright evaluates a string as an *expression*: it
          // would produce the function object and never call it, so every render silently
          // returned undefined. Verified in a live browser — the fake page in the unit tests
          // cannot distinguish the two, which is exactly why it went unnoticed.
          page.evaluate(
            (arg) =>
              (window as unknown as {
                __aiguiRenderBlock: (
                  source: string,
                  options: { width: number },
                ) => Promise<{ width: number; height: number; failed: boolean }>
              }).__aiguiRenderBlock(arg.source, { width: arg.width }),
            { source, width },
          ) as Promise<{ width: number; height: number; failed: boolean }>,
          timeoutMs,
          `rendering ${selection.kind}`,
        )) as { width: number; height: number; failed: boolean }
        // The plugin threw inside the page. Screenshotting now would attach a blank picture and
        // drop the source that explained it; leaving the block as text is the better failure.
        if (size.failed) throw new Error(`${selection.kind} failed to draw`)
        await withTimeout(
          page.locator("#root").screenshot({ path }) as Promise<unknown>,
          timeoutMs,
          `screenshotting ${selection.kind}`,
        )
        images.push({ kind: selection.kind, path, width: size.width, height: size.height })
        rendered.push(selection)
      } catch {
        // This block stays as text. The others are unaffected.
      }
    }
  } finally {
    await lease.release()
  }

  return { text: stripBlocks(markdown, rendered), images }
}
