import type { AIGuiPlugin } from "@ai-gui/core"
import { bigscreen } from "@ai-gui/plugin-bigscreen"
import { chart } from "@ai-gui/plugin-chart"
import { citation } from "@ai-gui/plugin-citation"
import { dashboard } from "@ai-gui/plugin-dashboard"
import { figure } from "@ai-gui/plugin-figure"
import { topology } from "@ai-gui/plugin-topology"
import { fn } from "@ai-gui/plugin-function"
import { graph } from "@ai-gui/plugin-graph"
import { gravity } from "@ai-gui/plugin-gravity"
import { highlight } from "@ai-gui/plugin-highlight"
import { katex } from "@ai-gui/plugin-katex"
import { mermaid } from "@ai-gui/plugin-mermaid"
import { molecule } from "@ai-gui/plugin-molecule"
import { motion } from "@ai-gui/plugin-motion"
import { optics } from "@ai-gui/plugin-optics"
import { physics } from "@ai-gui/plugin-physics"
import { primitives } from "@ai-gui/plugin-primitives"
import { progress } from "@ai-gui/plugin-progress"
import { quote } from "@ai-gui/plugin-quote"
import { scene } from "@ai-gui/plugin-scene"
import { solid } from "@ai-gui/plugin-solid"

/**
 * Every plugin the page draws, set up for a reader rather than a screenshot: charts live and
 * 3D-capable, the wall and the orbits animated. KaTeX's `css` is empty because the page carries
 * the real stylesheet, fonts inlined; the default is an `@import` a file page cannot resolve.
 */
export function viewerPlugins(theme: string): AIGuiPlugin[] {
  return [
    chart({ interactive: true, gl: true, width: "container" }),
    mermaid({ theme: theme === "dark" ? "dark" : "default" }),
    katex({ css: "", chemistry: true }),
    highlight(),
    primitives(),
    citation(),
    dashboard(),
    bigscreen(),
    scene(),
    gravity(),
    topology(),
    molecule(),
    graph(),
    solid(),
    fn(),
    optics(),
    motion(),
    physics(),
    figure(),
    quote(),
    progress(),
  ]
}
