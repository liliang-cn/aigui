import { mermaid } from "@ai-gui/plugin-mermaid"
import { registerPack } from "../packs"

registerPack("mermaid", (theme) => [mermaid({ theme: theme === "dark" ? "dark" : "default" })])
