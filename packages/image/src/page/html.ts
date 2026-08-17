import { baseCss, collectPluginStyles } from "@ai-gui/core"
import { imagePlugins } from "../plugins"
import { katexCss } from "./fonts"

const THEMES = {
  light: { bg: "#ffffff", fg: "#1a1a1a" },
  dark: { bg: "#161616", fg: "#e8e8e8" },
} as const

export interface PageHtmlOptions {
  theme?: keyof typeof THEMES
  width?: number
}

/**
 * The document a block is drawn into.
 *
 * Animation is disabled globally. ECharts is already static here, but Mermaid and the dashboard
 * plugin animate on entry, and an animating element is a coin flip between a finished picture and
 * a half-faded one. The font stack names CJK families explicitly: a screenshot has no fallback
 * chain to fall back to at read time, so a missing face is permanent tofu in the delivered image.
 */
export function pageHtml(options: PageHtmlOptions = {}): string {
  const theme = THEMES[options.theme ?? "light"]
  const pluginCss = collectPluginStyles(imagePlugins(options.width))
    .map((style) => style.css)
    .join("\n")
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
*,*::before,*::after{animation:none!important;transition:none!important}
html,body{margin:0;padding:0;background:${theme.bg};color:${theme.fg}}
body{font-family:-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Noto Sans SC",system-ui,sans-serif;font-size:16px;line-height:1.6}
#root{display:inline-block;padding:16px;box-sizing:border-box;max-width:${options.width ?? 720}px}
${baseCss}
${katexCss()}
${pluginCss}
</style></head><body><div id="root"></div></body></html>`
}
