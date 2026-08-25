import type { MermaidConfig } from "mermaid"
import { translate, type AIGuiPlugin, type ASTNode, type MessageBundle, type NodeRenderContext, type RenderOutput } from "@ai-gui/core"

export interface MermaidOptions {
  theme?: string
  maxSourceBytes?: number
}

/** The themes Mermaid ships with. Anything else it is handed is not a theme it can find. */
const MERMAID_THEMES = new Set(["default", "base", "dark", "forest", "neutral", "neo", "neo-dark", "redux", "redux-dark", "redux-color", "redux-dark-color", "null"])

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

/**
 * Remove the container Mermaid rendered into.
 *
 * Mermaid appends a host element id'd `d<id>` to the document and removes it itself on success. A
 * parse error aborts before that, leaving its own error graphic in the page — outside the renderer,
 * so nothing that owns the answer can clean it up.
 */
function discardMermaidHost(id: string): void {
  if (typeof document === "undefined") return
  document.getElementById(`d${id}`)?.remove()
  document.getElementById(id)?.remove()
}

function errorHtml(): RenderOutput {
  return { kind: "html", html: `<pre data-aigui-mermaid-error>${escapeHtml("Diagram could not be rendered.")}</pre>` }
}

const PROMPT: MessageBundle = {
  en: {
    spec: [
      "Diagrams: one fenced block, the Mermaid diagram syntax on the lines inside it.",
      "",
      "```mermaid",
      "<Mermaid diagram syntax>",
      "```",
      "",
      "Supported examples include flowchart, sequenceDiagram, classDiagram (UML), stateDiagram-v2, erDiagram, journey, gantt, pie, mindmap, timeline, and gitGraph.",
      "Use concise labels and valid Mermaid syntax. Never emit HTML, scripts, click handlers, URLs, initialization directives, remote resources, or credentials.",
    ].join("\n"),
  },
  "zh-CN": {
    spec: [
      "图示：一个围栏代码块，Mermaid 图示语法写在围栏里面的行上。",
      "",
      "```mermaid",
      "<Mermaid 图示语法>",
      "```",
      "",
      "可用类型包括 flowchart、sequenceDiagram、classDiagram（UML）、stateDiagram-v2、erDiagram、journey、gantt、pie、mindmap、timeline、gitGraph。",
      "标签保持简洁，语法必须合法。禁止输出 HTML、脚本、点击回调、URL、初始化指令、远程资源或任何凭据。",
    ].join("\n"),
  },
}

/**
 * The model-facing rules for diagrams, in the given locale (English by default).
 *
 * You rarely want this directly: `buildSystemPrompt({ registry, plugins, locale })` from
 * `@ai-gui/core` collects the card specs and every enabled plugin's spec in one call, in the
 * product's language. Reach for this only to inspect or override one plugin's rules.
 */
export function mermaidPromptSpec(locale?: string): string {
  return translate(PROMPT, locale, "spec")
}

export function mermaid(opts: MermaidOptions = {}): AIGuiPlugin {
  const theme = (opts.theme ?? "default") as MermaidConfig["theme"]
  const maxSourceBytes = opts.maxSourceBytes ?? 64 * 1024
  if (!Number.isSafeInteger(maxSourceBytes) || maxSourceBytes <= 0) throw new TypeError("maxSourceBytes must be a positive safe integer")
  const outputs = new WeakMap<ASTNode, { theme: MermaidConfig["theme"]; output: Promise<RenderOutput> }>()

  const render = (node: ASTNode, context?: NodeRenderContext): Promise<RenderOutput> => {
    // A host reports a colour scheme, not a Mermaid theme: "light" is what most of them send for
    // their default appearance and Mermaid has no such theme, so passing it straight through fails
    // every diagram on the page. Only a name Mermaid knows is taken as given; a light scheme means
    // whatever this plugin was configured with.
    const scheme = context?.theme
    const wanted = scheme === "dark"
      ? "dark"
      : scheme && MERMAID_THEMES.has(scheme)
        ? (scheme as MermaidConfig["theme"])
        : theme
    const cached = outputs.get(node)
    if (cached && cached.theme === wanted) return cached.output
    const output = enqueue(async (): Promise<RenderOutput> => {
    try {
      if (new TextEncoder().encode(node.content ?? "").byteLength > maxSourceBytes) return errorHtml()
      const m = await loadMermaid()
      // Mermaid keeps one global configuration, so a second theme only takes effect if it is
      // initialised again — without this the first diagram on the page fixed the theme for every
      // diagram after it, whatever the host asked for.
      if (initializedTheme !== wanted) {
        m.initialize({ startOnLoad: false, theme: wanted, securityLevel: "strict" })
        initializedTheme = wanted
      }
      const id = `aigui-mermaid-${nextId++}`
      try {
        const { svg } = await m.render(id, node.content ?? "")
        // Built here from the diagram source, under Mermaid's strict security level — not markup
        // the model wrote. Sanitizing SVG escapes it, so the reader would get the source text
        // instead of the picture, which is why hosts used to bypass their sanitizer by matching the
        // id above.
        return { kind: "html", html: svg, trusted: true }
      } finally {
        // Mermaid draws into a container it appends to the document, and on a parse error it leaves
        // that container behind holding its own "Syntax error in text" graphic. It sits outside the
        // renderer, so one malformed diagram used to stain every page of the app until reload.
        discardMermaidHost(id)
      }
    } catch {
      return errorHtml()
    }
    })
    outputs.set(node, { theme: wanted, output })
    return output
  }

  return { name: "mermaid", nodeRenderers: { mermaid: render }, promptSpec: (locale) => mermaidPromptSpec(locale) }
}
