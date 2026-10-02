import { baseCss } from "@ai-gui/core"

export interface PageOptions {
  markdown: string
  title?: string
  theme?: "light" | "dark"
  /** The viewer script, as the page will reference it. */
  viewerSrc: string
  /** Stylesheets the plugins cannot declare themselves: KaTeX's fonts, the molecule viewer. */
  extraCss?: string
  /** Language of the page's own words — its buttons, its `lang`. Default English. */
  locale?: "en" | "zh-CN"
}

const CHROME = {
  en: { pages: "All pages", print: "Print / Save PDF" },
  "zh-CN": { pages: "全部页面", print: "打印 / 存 PDF" },
} as const

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/**
 * The answer as JSON inside a script tag the browser will not run.
 *
 * `<` is escaped to `<`, which JSON reads back as `<` but which can never close the tag: an
 * answer that talks about `</script>` would otherwise end the data block halfway and spill the
 * rest of itself into the page as HTML.
 */
export function embed(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}

/**
 * One page: a title, the answer drawn by the real renderer, and the viewer script beside it.
 *
 * Without an explicit theme the page follows the reader's system setting, which is what a page
 * opened from a terminal should do; the viewer reads the same media query.
 */
export function pageHtml(options: PageOptions): string {
  const title = options.title?.trim() || "AIGUI"
  const forced = options.theme ? ` data-theme="${options.theme}"` : ""
  const locale = options.locale === "zh-CN" ? "zh-CN" : "en"
  const words = CHROME[locale]
  return `<!doctype html>
<html lang="${locale}"${forced}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root{--bg:#ffffff;--fg:#1c1c1e;--muted:#6b6b70;--rule:#e6e6ea;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141416;--fg:#ececef;--muted:#9a9aa2;--rule:#2a2a2f;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#141416;--fg:#ececef;--muted:#9a9aa2;--rule:#2a2a2f;color-scheme:dark}
html,body{margin:0;background:var(--bg);color:var(--fg)}
body{font-family:-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif;font-size:16px;line-height:1.65}
main{box-sizing:border-box;max-width:1080px;margin:0 auto;padding:32px 16px 64px}
header{margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--rule)}
header h1{margin:0;font-size:22px;font-weight:650;letter-spacing:.01em}
header p{margin:4px 0 0;color:var(--muted);font-size:13px}
header{display:flex;gap:16px;align-items:flex-end;justify-content:space-between}
header nav{display:flex;gap:8px;font-size:13px;white-space:nowrap}
header nav a,header nav button{font:inherit;color:var(--muted);background:none;border:1px solid var(--rule);border-radius:6px;padding:3px 10px;text-decoration:none;cursor:pointer}
header nav a:hover,header nav button:hover{color:var(--fg)}
@media print{header nav{display:none}main{max-width:none;padding:0}[data-aigui-topology-bar],[data-aigui-scene-bar]{display:none}}
#aigui-root{min-width:0}
#aigui-root [data-aigui-molecule]{margin-inline:auto}
${baseCss}
${options.extraCss ?? ""}
</style></head>
<body><main>
<header><div><h1>${escapeHtml(title)}</h1><p>AIGUI · ${new Date().toISOString().slice(0, 16).replace("T", " ")}</p></div><nav><a href="./index.html">${words.pages}</a><button type="button" onclick="print()">${words.print}</button></nav></header>
<div id="aigui-root"></div>
</main>
<script type="application/json" id="aigui-data">${embed({ markdown: options.markdown, theme: options.theme, locale })}</script>
<script src="${escapeHtml(options.viewerSrc)}"></script>
</body></html>`
}
