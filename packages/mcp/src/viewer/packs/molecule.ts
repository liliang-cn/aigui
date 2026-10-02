import { molecule } from "@ai-gui/plugin-molecule"
import { registerPack } from "../packs"

registerPack("molecule", () => [molecule()])
