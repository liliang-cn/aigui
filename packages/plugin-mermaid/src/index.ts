import type { MermaidConfig } from "mermaid"
import type { AIGuiPlugin, ASTNode, RenderOutput } from "@ai-gui/core"

export interface MermaidOptions {
  theme?: string
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function errorHtml(message: string): RenderOutput {
  return { kind: "html", html: `<pre data-aigui-mermaid-error>${escapeHtml(message)}</pre>` }
}

export function mermaid(opts: MermaidOptions = {}): AIGuiPlugin {
  let initialized = false
  let counter = 0

  const render = async (node: ASTNode): Promise<RenderOutput> => {
    try {
      const m = (await import("mermaid")).default
      if (!initialized) {
        m.initialize({ startOnLoad: false, theme: (opts.theme ?? "default") as MermaidConfig["theme"] })
        initialized = true
      }
      const id = `aigui-mermaid-${counter++}`
      const { svg } = await m.render(id, node.content ?? "")
      return { kind: "html", html: svg }
    } catch (e) {
      return errorHtml(String((e as Error)?.message ?? e))
    }
  }

  return { name: "mermaid", nodeRenderers: { mermaid: render } }
}
