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
 * Ask the operating system to open a file in its default browser.
 *
 * Detached and unwaited: the browser outlives this call, and a missing `xdg-open` on a headless
 * box must not fail the tool — the path is returned either way.
 */
export function openInBrowser(path: string): boolean {
  const [command, args] =
    process.platform === "darwin" ? ["open", [path]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", path]] : ["xdg-open", [path]]
  try {
    const child = spawn(command as string, args as string[], { detached: true, stdio: "ignore" })
    child.on("error", () => {})
    child.unref()
    return true
  } catch {
    return false
  }
}
