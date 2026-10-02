import { spawn } from "node:child_process"
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import { inlineKatexCss } from "@ai-gui/image"
import { pageHtml } from "./page"
import { packsFor } from "./viewer/packs"
import { readPage, recordPage } from "./pages"
import { outputRoot, packageVersion, viewerDir } from "./paths"


/**
 * Whether `copy` is already `source`. The name carries the version, which is enough between
 * releases — but a local build keeps its version while its contents change, and a stale viewer
 * beside a fresh page shows last build's behaviour with no sign that it is last build's.
 */
async function sameFile(source: string, copy: string): Promise<boolean> {
  try {
    const [a, b] = await Promise.all([stat(source), stat(copy)])
    return a.size === b.size && b.mtimeMs >= a.mtimeMs
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

/**
 * Put this build's viewer beside the pages in `dir` — a folder named by version, holding the main
 * script and its packs — unless it is already there; the folder's name.
 */
export async function ensureViewer(dir: string): Promise<string> {
  const viewer = `aigui-viewer-${packageVersion()}`
  await mkdir(join(dir, viewer), { recursive: true })
  for (const file of await readdir(viewerDir())) {
    if (!(await sameFile(join(viewerDir(), file), join(dir, viewer, file)))) await copyFile(join(viewerDir(), file), join(dir, viewer, file))
  }
  return viewer
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
  options: { title?: string; theme?: "light" | "dark"; locale?: "en" | "zh-CN"; open?: boolean; outDir?: string; /** Rewrite this page rather than start a new one. */ path?: string } = {},
): Promise<WrittenPage> {
  const dir = join(options.outDir ?? outputRoot(), "pages")
  await mkdir(dir, { recursive: true })
  // Versioned, so an upgrade writes a new bundle beside the old pages instead of breaking them.
  const viewer = await ensureViewer(dir)
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-")
  const path = options.path ?? join(dir, `${stamp}-${slug(options.title)}.html`)
  await writeFile(path, pageHtml({ markdown, title: options.title, theme: options.theme, locale: options.locale, viewerSrc: `./${viewer}/core.js`, extraCss: await extraCss() }))
  await recordPage(dir, path, options.title?.trim() || "AIGUI")
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

/**
 * A page as one file: its viewer and the packs its blocks use inlined, nothing fetched.
 *
 * The packs go first and register themselves; the main script then finds them loaded and draws.
 * Only the packs this answer needs are carried — a chart page is about 2 MB, not 20. Every
 * `</script` inside the inlined code is escaped, or the first one would end the tag early.
 */
export async function standalonePage(path: string): Promise<string> {
  const html = await readFile(path, "utf8")
  const { markdown } = await readPage(path)
  const tag = /<script src="\.\/(aigui-viewer-[^"/]+)\/core\.js"><\/script>/.exec(html)
  if (!tag) throw new Error("it does not load the viewer the way aigui_open writes it")
  await ensureViewer(dirname(path))
  const dir = join(dirname(path), tag[1])
  const inline = async (name: string) => `<script data-aigui-pack="${name}">${(await readFile(join(dir, `${name}.js`), "utf8")).replace(/<\/script/gi, "<\\/script")}</script>`
  const scripts = [...(await Promise.all(packsFor(markdown).map(inline))), await inline("core")].join("\n")
  const out = path.replace(/\.html$/, ".standalone.html")
  await writeFile(out, html.replace(tag[0], () => scripts).replace('<a href="./index.html">', '<a hidden href="./index.html">'))
  return out
}
