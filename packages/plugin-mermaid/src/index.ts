import type { MermaidConfig } from "mermaid"
import type { AIGuiPlugin, ASTNode, RenderOutput } from "@ai-gui/core"

export interface MermaidOptions {
  theme?: string
  maxSourceBytes?: number
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

function errorHtml(): RenderOutput {
  return { kind: "html", html: `<pre data-aigui-mermaid-error>${escapeHtml("Diagram could not be rendered.")}</pre>` }
}

export function mermaidPromptSpec(): string {
  return [
    "Diagrams (fenced): ```mermaid <Mermaid diagram syntax>```.",
    "Supported examples include flowchart, sequenceDiagram, classDiagram (UML), stateDiagram-v2, erDiagram, journey, gantt, pie, mindmap, timeline, and gitGraph.",
    "Use concise labels and valid Mermaid syntax. Never emit HTML, scripts, click handlers, URLs, initialization directives, remote resources, or credentials.",
  ].join("\n")
}

export function mermaid(opts: MermaidOptions = {}): AIGuiPlugin {
  const theme = (opts.theme ?? "default") as MermaidConfig["theme"]
  const maxSourceBytes = opts.maxSourceBytes ?? 64 * 1024
  if (!Number.isSafeInteger(maxSourceBytes) || maxSourceBytes <= 0) throw new TypeError("maxSourceBytes must be a positive safe integer")
  const outputs = new WeakMap<ASTNode, Promise<RenderOutput>>()

  const render = (node: ASTNode): Promise<RenderOutput> => {
    const cached = outputs.get(node)
    if (cached) return cached
    const output = enqueue(async (): Promise<RenderOutput> => {
    try {
      if (new TextEncoder().encode(node.content ?? "").byteLength > maxSourceBytes) return errorHtml()
      const m = await loadMermaid()
      if (initializedTheme === undefined) {
        m.initialize({ startOnLoad: false, theme, securityLevel: "strict" })
        initializedTheme = theme
      }
      const id = `aigui-mermaid-${nextId++}`
      const { svg } = await m.render(id, node.content ?? "")
      return { kind: "html", html: svg }
    } catch {
      return errorHtml()
    }
    })
    outputs.set(node, output)
    return output
  }

  return { name: "mermaid", nodeRenderers: { mermaid: render }, promptSpec: mermaidPromptSpec() }
}
