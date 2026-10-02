import type { BundledLanguage, Highlighter } from "shiki"
import { translate, type AIGuiPlugin, type ASTNode, type MessageBundle, type NodeRenderContext, type RenderOutput } from "@ai-gui/core"

/** Options for the Shiki-backed code highlighter plugin. */
export interface HighlightOptions {
  /** Themes to load. First entry is the default when neither `theme` nor the host's scheme decides. */
  themes?: string[]
  /**
   * Grammars to load up front. These are also the ones the prompt spec names to the model.
   * A block in another language still gets its grammar when Shiki bundles one (see `loadOnDemand`).
   */
  langs?: string[]
  /**
   * Load a grammar the first time a block asks for it, when Shiki bundles one by that name or alias.
   * Default `true`. With `false`, only `langs` are highlighted and every other block is plain text.
   */
  loadOnDemand?: boolean
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
 * You rarely want this directly: `buildSystemPrompt({ registry, plugins, locale })` from
 * `@ai-gui/core` collects the card specs and every enabled plugin's spec in one call, in the
 * product's language. Reach for this only to inspect or override one plugin's rules.
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
 * A node whose `attrs.lang` is not among `langs` gets that grammar loaded on first
 * use when Shiki bundles one by the name (`loadOnDemand`); any other language renders
 * as plain `"text"`, so Shiki never throws for a grammar it does not have. Any other
 * failure is caught and rendered as an escaped `<pre><code>` block — the renderer never throws.
 */
export function highlight(opts: HighlightOptions = {}): AIGuiPlugin {
  const lightTheme = opts.lightTheme ?? "github-light"
  const darkTheme = opts.darkTheme ?? "github-dark"
  // Both loaded up front: choosing per render is the point, and a theme Shiki has not loaded throws.
  const themes = opts.themes ?? [lightTheme, darkTheme]
  const langs = opts.langs ?? ["ts", "js", "json", "bash", "python", "html", "css"]
  const loadOnDemand = opts.loadOnDemand ?? true

  let highlighterPromise: Promise<Highlighter> | null = null
  const getHighlighter = () => (highlighterPromise ??= import("shiki").then(({ createHighlighter }) =>
    createHighlighter({ themes, langs }),
  ))

  // One load per grammar, shared by every block that asks for it while the load is in flight.
  const grammars = new Map<string, Promise<boolean>>()
  const loadGrammar = (highlighter: Highlighter, lang: string): Promise<boolean> => {
    let loading = grammars.get(lang)
    if (!loading) {
      loading = import("shiki")
        .then(async ({ bundledLanguages }) => {
          // Shiki throws for a name it does not bundle, so the name is checked before asking.
          if (!Object.prototype.hasOwnProperty.call(bundledLanguages, lang)) return false
          await highlighter.loadLanguage(lang as BundledLanguage)
          return true
        })
        .catch(() => false)
      grammars.set(lang, loading)
    }
    return loading
  }

  const render = async (node: ASTNode, context?: NodeRenderContext): Promise<RenderOutput> => {
    const code = node.content ?? ""
    const requested = node.attrs?.lang
    // The host's scheme decides unless a theme was pinned. Code set in a light theme on a dark page is
    // the same fault a chart has when it picks its own palette, and it is just as easy to miss when the
    // markup is correct either way.
    const wanted = opts.theme ?? (context?.theme === "dark" ? darkTheme : lightTheme)
    const theme = themes.includes(wanted) ? wanted : themes[0]
    try {
      const highlighter = await getHighlighter()
      // "text" is always available in Shiki and never requires a loaded grammar.
      const lang = requested && (langs.includes(requested) || (loadOnDemand && (await loadGrammar(highlighter, requested))))
        ? requested
        : "text"
      return { kind: "html", html: highlighter.codeToHtml(code, { lang, theme }) }
    } catch {
      return { kind: "html", html: `<pre><code>${escapeHtml(code)}</code></pre>` }
    }
  }

  return { name: "highlight", nodeRenderers: { code: render }, promptSpec: (locale) => highlightPromptSpec(locale, langs) }
}
