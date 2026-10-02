import { readFile, writeFile } from "node:fs/promises"
import { basename, isAbsolute, join } from "node:path"

/** One page in the history: its file (beside the index), what it is called, when it was written. */
export interface PageEntry {
  file: string
  title: string
  created: string
  updated: string
}

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

async function readIndex(dir: string): Promise<PageEntry[]> {
  try {
    const entries = JSON.parse(await readFile(join(dir, "index.json"), "utf8")) as PageEntry[]
    return Array.isArray(entries) ? entries : []
  } catch {
    return []
  }
}

/**
 * Add or refresh a page in the history, and rewrite the index page that lists them.
 *
 * Pages pile up in one directory with timestamped names; a person looking for yesterday's
 * failover diagram should find it by its title, newest first, not by reading file names.
 */
export async function recordPage(dir: string, path: string, title: string): Promise<void> {
  const entries = await readIndex(dir)
  const file = basename(path)
  const now = new Date().toISOString()
  const existing = entries.find((e) => e.file === file)
  if (existing) {
    existing.title = title
    existing.updated = now
  } else {
    entries.push({ file, title, created: now, updated: now })
  }
  entries.sort((a, b) => b.updated.localeCompare(a.updated))
  await writeFile(join(dir, "index.json"), `${JSON.stringify(entries, null, 2)}\n`)
  await writeFile(join(dir, "index.html"), indexHtml(entries))
}

/** The most recently written page, or the one `ref` names — a path, or a file name in `dir`. */
export async function resolvePage(dir: string, ref?: string): Promise<string | undefined> {
  if (ref && ref !== "last") return isAbsolute(ref) ? ref : join(dir, basename(ref))
  const [latest] = await readIndex(dir)
  return latest ? join(dir, latest.file) : undefined
}

/** The answer and settings a page was written from, read back out of the page itself. */
export async function readPage(path: string): Promise<{ markdown: string; title?: string; theme?: "light" | "dark"; locale?: "en" | "zh-CN"; custom?: Array<{ name: string; fences: string[]; src: string }> }> {
  const html = await readFile(path, "utf8")
  const data = /<script type="application\/json" id="aigui-data">([\s\S]*?)<\/script>/.exec(html)
  if (!data) throw new Error(`${path} is not a page aigui_open wrote`)
  const parsed = JSON.parse(data[1]) as { markdown?: string; theme?: "light" | "dark"; locale?: "en" | "zh-CN"; custom?: Array<{ name: string; fences: string[]; src: string }> }
  const title = /<title>([\s\S]*?)<\/title>/.exec(html)?.[1]
  const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  return { markdown: parsed.markdown ?? "", title: title ? unescape(title) : undefined, theme: parsed.theme, locale: parsed.locale, custom: parsed.custom }
}

/**
 * Apply find-and-replace edits to a page's markdown.
 *
 * Each `find` must occur exactly once: zero means the agent is editing a page it misremembers, and
 * two means the edit would land somewhere it did not mean. Either way the page is left alone and
 * the error says which edit and how many times its text appeared.
 */
export function applyEdits(markdown: string, edits: ReadonlyArray<{ find: string; replace: string }>): string {
  let out = markdown
  for (const [i, { find, replace }] of edits.entries()) {
    if (!find) throw new Error(`edit ${i + 1}: find is empty`)
    const count = out.split(find).length - 1
    if (count !== 1) {
      throw new Error(
        count === 0
          ? `edit ${i + 1}: its find text does not occur in the page — read the page's markdown again, or quote it exactly`
          : `edit ${i + 1}: its find text occurs ${count} times — include more of the surrounding text so it names one place`,
      )
    }
    out = out.replace(find, () => replace)
  }
  return out
}

function indexHtml(entries: readonly PageEntry[]): string {
  const rows = entries
    .map((e) => `<li><a href="./${encodeURI(e.file)}">${escapeHtml(e.title)}</a><time>${e.updated.slice(0, 16).replace("T", " ")}</time></li>`)
    .join("\n")
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>AIGUI pages</title>
<style>
:root{--bg:#fff;--fg:#1c1c1e;--muted:#6b6b70;--rule:#e6e6ea;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#141416;--fg:#ececef;--muted:#9a9aa2;--rule:#2a2a2f;color-scheme:dark}}
body{margin:0;background:var(--bg);color:var(--fg);font-family:-apple-system,"PingFang SC","Microsoft YaHei",system-ui,sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 16px}
h1{font-size:22px;margin:0 0 16px}
ul{list-style:none;margin:0;padding:0}
li{display:flex;gap:16px;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--rule)}
a{color:inherit;text-decoration:none}
a:hover{text-decoration:underline}
time{color:var(--muted);font-size:13px;white-space:nowrap;font-variant-numeric:tabular-nums}
</style></head><body><main><h1>AIGUI pages</h1>
<ul>
${rows || "<li>No pages yet.</li>"}
</ul></main></body></html>
`
}
