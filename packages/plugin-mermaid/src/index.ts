import type { MermaidConfig } from "mermaid"
import type { AIGuiPlugin, ASTNode, RenderOutput } from "@ai-gui/core"

export interface MermaidOptions {
  theme?: string
}

let nextId = 0
let mermaidPromise: Promise<typeof import("mermaid")["default"]> | null = null
let initializedTheme: MermaidConfig["theme"] | undefined
let renderQueue: Promise<void> = Promise.resolve()

const loadMermaid = () => (mermaidPromise ??= import("mermaid").then(({ default: m }) => m))

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const result = renderQueue.then(work, work)
  renderQueue = result.then(() => undefined, () => undefined)
  return result
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function errorHtml(message: string): RenderOutput {
  return { kind: "html", html: `<pre data-aigui-mermaid-error>${escapeHtml(message)}</pre>` }
}

export function mermaid(opts: MermaidOptions = {}): AIGuiPlugin {
  const theme = (opts.theme ?? "default") as MermaidConfig["theme"]

  const render = (node: ASTNode): Promise<RenderOutput> => enqueue(async () => {
    try {
      const m = await loadMermaid()
      if (initializedTheme === undefined) {
        m.initialize({ startOnLoad: false, theme })
        initializedTheme = theme
      }
      const id = `aigui-mermaid-${nextId++}`
      const { svg } = await m.render(id, node.content ?? "")
      return { kind: "html", html: svg }
    } catch (e) {
      return errorHtml(String((e as Error)?.message ?? e))
    }
  })

  return { name: "mermaid", nodeRenderers: { mermaid: render } }
}
