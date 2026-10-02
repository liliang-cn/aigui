import type { AIGuiPlugin } from "@ai-gui/core"
import { citation } from "@ai-gui/plugin-citation"
import { figure } from "@ai-gui/plugin-figure"
import { fn } from "@ai-gui/plugin-function"
import { gravity } from "@ai-gui/plugin-gravity"
import { motion } from "@ai-gui/plugin-motion"
import { optics } from "@ai-gui/plugin-optics"
import { physics } from "@ai-gui/plugin-physics"
import { primitives } from "@ai-gui/plugin-primitives"
import { progress } from "@ai-gui/plugin-progress"
import { quote } from "@ai-gui/plugin-quote"

/**
 * The plugins in the page's main script: the ones with no third-party code behind them. The
 * heavy ones are in packs (see `packs.ts`), loaded only for an answer that uses them.
 *
 * `still` is the page as a picture: nothing plays. An export or a look-over that caught a figure
 * mid-animation would show a frame nobody chose.
 */
export function corePlugins(still = false): AIGuiPlugin[] {
  return [primitives(), citation(), progress(), gravity({ animate: !still }), fn(), optics(), motion(), physics(), figure(), quote()]
}
