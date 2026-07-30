import type { Highlighter } from "shiki"
import { translate, type AIGuiPlugin, type ASTNode, type MessageBundle, type NodeRenderContext, type RenderOutput } from "@ai-gui/core"

/** Options for the Shiki-backed code highlighter plugin. */
export interface HighlightOptions {
  /** Themes to load. First entry is the default when neither `theme` nor the host's scheme decides. */
  themes?: string[]
  /** Grammars to load. A node whose `attrs.lang` is not listed falls back to plain text. */
  langs?: string[]
  /**
   * Pin the theme, ignoring the host's colour scheme.
   *
   * Left unset, the theme follows `context.theme`: `darkTheme` on a dark page and `lightTheme` on a
   * light one. Pinning is for a host that renders code in a fixed panel regardless of its own scheme.
   */
  theme?: string
  /** Theme for a light page. Must be among `themes`. */
  lightTheme?: string
  /** Theme for a dark page. Must be among `themes`. */
  darkTheme?: string
}

const PROMPT: MessageBundle = {
  en: { spec: "Code: put every code sample in a fenced block tagged with its language, e.g. ```ts. An untagged block is shown unhighlighted." },
  "zh-CN": { spec: "代码：所有代码都写在标注了语言的围栏代码块里，例如 ```ts。没有标注语言的代码块不会高亮。" },
}

/**
 * The model-facing rules for code blocks, in the given locale (English by default).
 *
 * This plugin can only colour a block whose language it was told, and a model left to itself opens
 * a bare ``` about half the time — so the highlighter a host installed does nothing for the answer
 * it was installed for. The loaded grammars are listed so the model prefers one of them.
 */
export function highlightPromptSpec(locale?: string, langs: string[] = []): string {
  const spec = translate(PROMPT, locale, "spec")
  return langs.length > 0 ? `${spec} (${langs.join(", ")})` : spec
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
  const lightTheme = opts.lightTheme ?? "github-light"
  const darkTheme = opts.darkTheme ?? "github-dark"
  // Both loaded up front: choosing per render is the point, and a theme Shiki has not loaded throws.
  const themes = opts.themes ?? [lightTheme, darkTheme]
  const langs = opts.langs ?? ["ts", "js", "json", "bash", "python", "html", "css"]

  let highlighterPromise: Promise<Highlighter> | null = null
  const getHighlighter = () => (highlighterPromise ??= import("shiki").then(({ createHighlighter }) =>
    createHighlighter({ themes, langs }),
  ))

  const render = async (node: ASTNode, context?: NodeRenderContext): Promise<RenderOutput> => {
    const code = node.content ?? ""
    const requested = node.attrs?.lang
    // "text" is always available in Shiki and never requires a loaded grammar.
    const lang = requested && langs.includes(requested) ? requested : "text"
    // The host's scheme decides unless a theme was pinned. Code set in a light theme on a dark page is
    // the same fault a chart has when it picks its own palette, and it is just as easy to miss when the
    // markup is correct either way.
    const wanted = opts.theme ?? (context?.theme === "dark" ? darkTheme : lightTheme)
    const theme = themes.includes(wanted) ? wanted : themes[0]
    try {
      const highlighter = await getHighlighter()
      return { kind: "html", html: highlighter.codeToHtml(code, { lang, theme }) }
    } catch {
      return { kind: "html", html: `<pre><code>${escapeHtml(code)}</code></pre>` }
    }
  }

  return { name: "highlight", nodeRenderers: { code: render }, promptSpec: (locale) => highlightPromptSpec(locale, langs) }
}
