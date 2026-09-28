import { spawn } from "node:child_process"
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { inlineKatexCss } from "@ai-gui/image"
import { pageHtml } from "./page"
import { outputRoot, packageVersion, viewerBundlePath } from "./paths"


async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * The stylesheets a page needs that its plugins cannot inject.
 *
 * KaTeX's fonts have to be data URIs: a page opened from `file://` has an opaque origin, and
 * Chrome refuses web fonts from any origin but its own, so a font file beside the page never
 * loads and every formula falls back to a serif. The molecule viewer leaves its CSS to the host.
 */
async function extraCss(): Promise<string> {
  const [{ moleculeCss }] = await Promise.all([import("@ai-gui/plugin-molecule")])
  return `${inlineKatexCss()}\n${moleculeCss}`
}

const slug = (title: string | undefined): string =>
  (title ?? "page")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "page"

export interface WrittenPage {
  path: string
  url: string
  opened: boolean
}

/** Write the page and the viewer beside it, then hand the file to the system's browser. */
export async function writePage(
  markdown: string,
  options: { title?: string; theme?: "light" | "dark"; open?: boolean; outDir?: string } = {},
): Promise<WrittenPage> {
  const dir = join(options.outDir ?? outputRoot(), "pages")
  await mkdir(dir, { recursive: true })
  // Versioned, so an upgrade writes a new bundle beside the old pages instead of breaking them.
  const viewer = `aigui-viewer-${packageVersion()}.js`
  if (!(await exists(join(dir, viewer)))) await copyFile(viewerBundlePath(), join(dir, viewer))
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-")
  const path = join(dir, `${stamp}-${slug(options.title)}.html`)
  await writeFile(path, pageHtml({ markdown, title: options.title, theme: options.theme, viewerSrc: `./${viewer}`, extraCss: await extraCss() }))
  const opened = options.open !== false && process.env.AIGUI_NO_OPEN !== "1" ? openInBrowser(path) : false
  return { path, url: pathToFileURL(path).href, opened }
}

/**
 * Ask the operating system to open files with their default apps — a page in the browser, a PNG
 * in the image viewer.
 *
 * Detached and unwaited: the app outlives this call, and a missing `xdg-open` on a headless box
 * must not fail the tool — the paths are returned either way.
 */
export function openFiles(paths: string[]): boolean {
  if (paths.length === 0) return false
  // macOS opens several files in one window; elsewhere each gets its own call.
  const calls: Array<[string, string[]]> =
    process.platform === "darwin"
      ? [["open", paths]]
      : paths.map((path) => (process.platform === "win32" ? ["cmd", ["/c", "start", "", path]] : ["xdg-open", [path]]))
  try {
    for (const [command, args] of calls) {
      const child = spawn(command, args, { detached: true, stdio: "ignore" })
      child.on("error", () => {})
      child.unref()
    }
    return true
  } catch {
    return false
  }
}

export const openInBrowser = (path: string): boolean => openFiles([path])
