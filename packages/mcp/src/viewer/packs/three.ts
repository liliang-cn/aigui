import { graph } from "@ai-gui/plugin-graph"
import { scene } from "@ai-gui/plugin-scene"
import { solid } from "@ai-gui/plugin-solid"
import { registerPack } from "../packs"

registerPack("three", (_theme, still) => [scene({ animate: !still }), solid(), graph()])
