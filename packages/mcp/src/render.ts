import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { BrowserUnavailableError, DEFAULT_KINDS, renderMarkdownToImages, selectRenderableBlocks, type InternalRenderOptions } from "@ai-gui/image"
import { awaitSetup, type BrowserSetup } from "./browser"
import { outputRoot } from "./paths"

export interface RenderedContent {
  [key: string]: unknown
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: "image/png" }>
  isError?: boolean
}

/**
 * The advice a failed launch gets.
 *
 * A browser that is not there is the one failure a first-time user will certainly hit, and the
 * agent relays whatever this says — so it says what to run, not what went wrong inside Playwright.
 */
export const NO_BROWSER = [
  "No browser could be started to draw the picture.",
  "Install Google Chrome or Microsoft Edge, or run `npx playwright install chromium` once.",
  "Meanwhile aigui_open still works: it draws in the browser the user already has.",
].join(" ")

/**
 * Draw every picture-capable block in `markdown` and return the PNGs as MCP image content.
 *
 * The images go back inline so the agent sees what it drew and can fix it; the paths go back too,
 * because in a terminal the person reading along can only open a file — which `show`, when
 * given, does for them.
 */
export async function renderToContent(
  markdown: string,
  options: {
    theme?: "light" | "dark"
    width?: number
    outDir?: string
    acquire?: InternalRenderOptions["acquire"]
    /** The background browser download, and how long to wait for it. */
    setup?: BrowserSetup
    setupWaitMs?: number
    /** Show the PNGs to the person too, when they are reading in a terminal that cannot. */
    show?: (paths: string[]) => boolean
  } = {},
): Promise<RenderedContent> {
  const candidates = selectRenderableBlocks(markdown, { kinds: DEFAULT_KINDS, max: 12 })
  if (candidates.length === 0) {
    return {
      content: [{ type: "text", text: "Nothing in this markdown can be drawn as a picture. Use a chart, mermaid, $$ maths, a table, bigscreen, dashboard, scene, gravity or molecule block — or aigui_open for the rest." }],
      isError: true,
    }
  }
  const setup = options.setup ? await awaitSetup(options.setup, options.setupWaitMs ?? 60_000) : "ready"
  let result
  try {
    result = await renderMarkdownToImages(markdown, {
      outDir: join(options.outDir ?? outputRoot(), "images"),
      theme: options.theme,
      width: options.width,
      kinds: DEFAULT_KINDS,
      max: 12,
      timeoutMs: 30_000,
      acquire: options.acquire,
    })
  } catch (error) {
    const missing = error instanceof BrowserUnavailableError || /Executable doesn't exist|playwright install|Failed to launch|channel/i.test(String((error as Error)?.message))
    return { content: [{ type: "text", text: missing ? NO_BROWSER : `Drawing failed: ${String((error as Error)?.message ?? error)}` }], isError: true }
  }
  const shown = options.show?.(result.images.map((image) => image.path)) ?? false
  const lines = result.images.map((image) => `- ${image.kind}: ${image.path} (${image.width}×${image.height})`)
  const failed = candidates.length - result.images.length
  const summary = [
    `Drew ${result.images.length} picture${result.images.length === 1 ? "" : "s"}:`,
    ...lines,
    ...(shown ? ["They are open in the user's image viewer."] : []),
    ...(failed > 0 ? [`${failed} block${failed === 1 ? "" : "s"} could not be drawn and stayed as source; check its JSON against aigui_guide.`] : []),
    ...(setup === "pending" ? ["The faster headless browser is still downloading (first use only); 3D blocks may fail until it finishes — retry in a few minutes, or use aigui_open."] : []),
  ].join("\n")
  const images = await Promise.all(result.images.map(async (image) => ({ type: "image" as const, data: (await readFile(image.path)).toString("base64"), mimeType: "image/png" as const })))
  return { content: [{ type: "text", text: summary }, ...images], isError: result.images.length === 0 }
}
