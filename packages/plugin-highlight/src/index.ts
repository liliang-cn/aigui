import type { Highlighter } from "shiki"
import type { AIGuiPlugin, ASTNode, RenderOutput } from "@ai-gui/core"

/** Options for the Shiki-backed code highlighter plugin. */
export interface HighlightOptions {
  /** Themes to load. First entry is the default when `theme` is omitted. */
  themes?: string[]
  /** Grammars to load. A node whose `attrs.lang` is not listed falls back to plain text. */
  langs?: string[]
  /** Theme used for rendering. Defaults to the first entry of `themes`. */
  theme?: string
}

/** Escape a raw string for safe embedding inside `<pre><code>`. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/**
 * Code-highlighting plugin backed by Shiki. Overrides the built-in `code` node
 * renderer with an async renderer that lazily creates a single, memoized
 * `Highlighter` (Shiki's `createHighlighter` promise is created at most once) and
 * emits `highlighter.codeToHtml(...)` markup.
 *
 * A node whose `attrs.lang` is not among the loaded `langs` renders as plain
 * `"text"` so Shiki never throws for an unloaded grammar. Any other failure is
 * caught and rendered as an escaped `<pre><code>` block — the renderer never throws.
 */
export function highlight(opts: HighlightOptions = {}): AIGuiPlugin {
  const themes = opts.themes ?? ["github-light"]
  const langs = opts.langs ?? ["ts", "js", "json", "bash", "python", "html", "css"]
  const theme = opts.theme ?? themes[0]

  let highlighterPromise: Promise<Highlighter> | null = null
  const getHighlighter = () => (highlighterPromise ??= import("shiki").then(({ createHighlighter }) =>
    createHighlighter({ themes, langs }),
  ))

  const render = async (node: ASTNode): Promise<RenderOutput> => {
    const code = node.content ?? ""
    const requested = node.attrs?.lang
    // "text" is always available in Shiki and never requires a loaded grammar.
    const lang = requested && langs.includes(requested) ? requested : "text"
    try {
      const highlighter = await getHighlighter()
      return { kind: "html", html: highlighter.codeToHtml(code, { lang, theme }) }
    } catch {
      return { kind: "html", html: `<pre><code>${escapeHtml(code)}</code></pre>` }
    }
  }

  return { name: "highlight", nodeRenderers: { code: render } }
}
