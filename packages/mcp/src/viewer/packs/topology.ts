import { topology } from "@ai-gui/plugin-topology"
import { registerPack } from "../packs"

registerPack("topology", (_theme, still) => [topology({ animate: !still })])
