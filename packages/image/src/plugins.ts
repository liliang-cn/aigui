import type { AIGuiPlugin } from "@ai-gui/core"
import { bigscreen } from "@ai-gui/plugin-bigscreen"
import { chart } from "@ai-gui/plugin-chart"
import { dashboard } from "@ai-gui/plugin-dashboard"
import { gravity } from "@ai-gui/plugin-gravity"
import { katex } from "@ai-gui/plugin-katex"
import { mermaid } from "@ai-gui/plugin-mermaid"
import { molecule } from "@ai-gui/plugin-molecule"
import { scene } from "@ai-gui/plugin-scene"
import { DEFAULT_WIDTH } from "./types"

/**
 * The plugins an image render understands.
 *
 * `interactive: false` is not a preference. It makes plugin-chart return an SSR SVG in the same
 * tick rather than mounting a live ECharts instance with animations to wait out. The same goes
 * for `animate: false` on gravity and the big screen: a picture is one moment, and the moment
 * wanted is the finished one — the number counted up, the bar grown, the bodies at the end of
 * their run — not whichever frame the screenshot happened to land on.
 *
 * The chart is sized to the page rather than left at the plugin's 600x400 default, which would
 * otherwise sit in a 720px column with a band of dead space beside it.
 */
export function imagePlugins(width: number = DEFAULT_WIDTH): AIGuiPlugin[] {
  const inner = Math.max(200, width - 32) // the page gives #root 16px of padding on each side
  return [
    chart({ interactive: false, width: inner, height: Math.round(inner * 0.625) }),
    mermaid(),
    // KaTeX's default `css` is `@import "katex/dist/katex.min.css"`, and a bare npm specifier
    // resolves to nothing inside `page.setContent`. The import fails silently and every formula
    // renders as flat unstyled text — `\frac{a}{b}` comes out as "ba". The real stylesheet is
    // inlined by `page/html.ts`, which can read files; this module cannot, because the browser
    // bundle imports it too.
    katex({ css: "" }),
    dashboard(),
    scene({ height: Math.round(inner * 0.6) }),
    gravity({ animate: false, width: inner, height: Math.round(inner * 0.625) }),
    bigscreen({ animate: false }),
    molecule({ width: inner, height: Math.round(inner * 0.6) }),
  ]
}
