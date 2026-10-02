import { bigscreen } from "@ai-gui/plugin-bigscreen"
import { chart } from "@ai-gui/plugin-chart"
import { dashboard } from "@ai-gui/plugin-dashboard"
import { registerPack } from "../packs"

registerPack("echarts", (_theme, still) => [chart({ interactive: true, gl: true, width: "container" }), dashboard(), bigscreen({ animate: !still })])
