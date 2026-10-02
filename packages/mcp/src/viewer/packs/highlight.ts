import { highlight } from "@ai-gui/plugin-highlight"
import { registerPack } from "../packs"

registerPack("highlight", () => [highlight()])
