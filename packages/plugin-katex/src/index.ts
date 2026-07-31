import katexLib from "katex"
import { translate, type AIGuiPlugin, type MessageBundle } from "@ai-gui/core"

/**
 * Render a TeX expression to a KaTeX HTML string.
 *
 * Uses `output: "html"` (no MathML) so the markup is plain `<span class="katex">`
 * elements that survive DOMPurify sanitization in the core Renderer. Never throws:
 * invalid input is rendered as a red error node via `throwOnError: false`.
 */
function renderMath(expr: string, displayMode: boolean): string {
  return katexLib.renderToString(expr, { throwOnError: false, output: "html", displayMode })
}

// Minimal structural shapes of the markdown-it rule state objects we touch. The
// full types live in markdown-it, but modelling only what we use keeps this
// package free of a runtime markdown-it dependency (core supplies the instance).
interface InlineToken {
  markup: string
  content: string
}
interface InlineState {
  src: string
  pos: number
  posMax: number
  pending: string
  push(type: string, tag: string, nesting: number): InlineToken
}
interface BlockToken {
  markup: string
  content: string
  block: boolean
  map: number[]
}
interface BlockState {
  src: string
  bMarks: number[]
  eMarks: number[]
  tShift: number[]
  blkIndent: number
  line: number
  push(type: string, tag: string, nesting: number): BlockToken
  getLines(begin: number, end: number, indent: number, keepLastLF: boolean): string
}

/**
 * Decide whether a `$` at `pos` may open and/or close an inline math span.
 * Mirrors the markdown-it-katex delimiter rules: a closer may not sit right
 * after whitespace or right before a digit; an opener may not precede whitespace.
 */
function isValidDelim(state: InlineState, pos: number): { canOpen: boolean; canClose: boolean } {
  const max = state.posMax
  const prevChar = pos > 0 ? state.src.charCodeAt(pos - 1) : -1
  const nextChar = pos + 1 <= max ? state.src.charCodeAt(pos + 1) : -1
  let canOpen = true
  let canClose = true
  if (prevChar === 0x20 || prevChar === 0x09 || (nextChar >= 0x30 && nextChar <= 0x39)) canClose = false
  if (nextChar === 0x20 || nextChar === 0x09) canOpen = false
  return { canOpen, canClose }
}

/** Inline rule for `$...$`. */
function mathInline(state: InlineState, silent: boolean): boolean {
  if (state.src[state.pos] !== "$") return false

  let res = isValidDelim(state, state.pos)
  if (!res.canOpen) {
    if (!silent) state.pending += "$"
    state.pos += 1
    return true
  }

  // Skip properly escaped `$` while searching for the closing delimiter.
  const start = state.pos + 1
  let match = start
  let pos: number
  while ((match = state.src.indexOf("$", match)) !== -1) {
    pos = match - 1
    while (state.src[pos] === "\\") pos -= 1
    if ((match - pos) % 2 === 1) break
    match += 1
  }

  // No closing delimiter: emit the `$` literally.
  if (match === -1) {
    if (!silent) state.pending += "$"
    state.pos = start
    return true
  }

  // Empty content `$$`: leave for the block rule / literal.
  if (match - start === 0) {
    if (!silent) state.pending += "$$"
    state.pos = start + 1
    return true
  }

  res = isValidDelim(state, match)
  if (!res.canClose) {
    if (!silent) state.pending += "$"
    state.pos = start
    return true
  }

  if (!silent) {
    const token = state.push("math_inline", "math", 0)
    token.markup = "$"
    token.content = state.src.slice(start, match)
  }
  state.pos = match + 1
  return true
}

/** Block rule for `$$...$$` (single or multi line). */
function mathBlock(state: BlockState, start: number, end: number, silent: boolean): boolean {
  let firstLine: string
  let lastLine = ""
  let next: number
  let lastPos: number
  let found = false
  let pos = state.bMarks[start] + state.tShift[start]
  let max = state.eMarks[start]

  if (pos + 2 > max) return false
  if (state.src.slice(pos, pos + 2) !== "$$") return false

  pos += 2
  firstLine = state.src.slice(pos, max)

  if (silent) return true

  if (firstLine.trim().slice(-2) === "$$") {
    firstLine = firstLine.trim().slice(0, -2)
    found = true
  }

  for (next = start; !found; ) {
    next++
    if (next >= end) break

    pos = state.bMarks[next] + state.tShift[next]
    max = state.eMarks[next]

    // A non-empty line with negative indent should stop the block.
    if (pos < max && state.tShift[next] < state.blkIndent) break

    if (state.src.slice(pos, max).trim().slice(-2) === "$$") {
      lastPos = state.src.slice(0, max).lastIndexOf("$$")
      lastLine = state.src.slice(pos, lastPos)
      found = true
    }
  }

  state.line = next + 1

  const token = state.push("math_block", "math", 0)
  token.block = true
  token.content =
    (firstLine.trim() ? firstLine + "\n" : "") +
    state.getLines(start + 1, next, state.tShift[start], true) +
    (lastLine.trim() ? lastLine : "")
  token.map = [start, state.line]
  token.markup = "$$"
  return true
}

/**
 * The `@import` statement naming KaTeX's stylesheet — **not** the stylesheet itself.
 *
 * It is a bare specifier, which only a bundler can resolve. Put it in a `<style>` element and the
 * browser looks for `/katex/dist/katex.min.css` on your own origin, gets a 404, and every formula
 * renders as a heap of overlapping spans — which is exactly what the plugin's `css` field would
 * otherwise cause, so the renderers skip a value like this on purpose.
 *
 * What you almost certainly want instead:
 * - with a bundler: `import "@ai-gui/plugin-katex/style.css"`
 * - without one: `katex({ css: katexInlineCss({ fontBase }) })` from `@ai-gui/plugin-katex/inline-css`
 */
export const katexCssImport = '@import "katex/dist/katex.min.css";'

/**
 * @deprecated Renamed to {@link katexCssImport}, because the old name read as "here is KaTeX's
 * CSS" and it is not — it is an `@import` a `<style>` element cannot resolve. Injecting it by hand
 * is what leaves formulas rendering as overlapping spans. Use
 * `import "@ai-gui/plugin-katex/style.css"`, or `katexInlineCss()` from
 * `@ai-gui/plugin-katex/inline-css` if you have no build step.
 */
export const katexCss = katexCssImport

const PROMPT: MessageBundle = {
  en: {
    spec: [
      "Maths: write it as TeX — `$...$` inline, `$$...$$` on its own lines for a displayed equation.",
      "Use maths for every formula, variable and unit rather than describing it in words or plain text: `$v = d/t$`, not `v = d/t`.",
      "A literal dollar sign in prose must be escaped as `\\$`. Never emit HTML, MathML or images for maths.",
    ].join("\n"),
    chemistry: "Chemistry: use mhchem inside maths — `$\\ce{2H2 + O2 -> 2H2O}$` for reactions and `$\\pu{22.4 L}$` for quantities with units.",
  },
  "zh-CN": {
    spec: [
      "数学公式：用 TeX 书写 —— 行内写 `$...$`，独立成行的公式写 `$$...$$`。",
      "所有公式、变量和单位都用数学公式表示，不要用文字或纯文本描述：写 `$v = d/t$`，不要写 v = d/t。",
      "正文里表示货币的美元符号必须转义为 `\\$`。禁止用 HTML、MathML 或图片表示数学内容。",
    ].join("\n"),
    chemistry: "化学：在数学公式内使用 mhchem —— 反应式写 `$\\ce{2H2 + O2 -> 2H2O}$`，带单位的量写 `$\\pu{22.4 L}$`。",
  },
}

/**
 * The model-facing rules for maths, in the given locale (English by default).
 *
 * Without these the model has no reason to write TeX at all: it answers a physics question in plain
 * text, and a product that installed this plugin renders nothing it could not have rendered
 * without it. `chemistry` adds the mhchem notation, which is only worth asking for when the plugin
 * was built with that extension loaded.
 * You rarely want this directly: `buildSystemPrompt({ registry, plugins, locale })` from
 * `@ai-gui/core` collects the card specs and every enabled plugin's spec in one call, in the
 * product's language. Reach for this only to inspect or override one plugin's rules.
 */
export function katexPromptSpec(locale?: string, options: { chemistry?: boolean } = {}): string {
  const spec = translate(PROMPT, locale, "spec")
  return options.chemistry ? `${spec}\n${translate(PROMPT, locale, "chemistry")}` : spec
}

/**
 * KaTeX plugin: renders inline `$...$` and block `$$...$$` math to HTML during
 * markdown parsing, flowing through the core Renderer's sanitized `html` pipeline.
 */
export interface KatexOptions {
  /**
   * Load KaTeX's mhchem extension, which is what renders `\ce{}` and `\pu{}`.
   *
   * Chemistry teaching runs on that notation — "\ce{2H2 + O2 -> 2H2O}" is how a reaction is
   * written — and without the extension KaTeX renders it as an error. It is off by default because
   * mhchem is a chunk of grammar that a maths or physics lesson never touches.
   */
  chemistry?: boolean
  /**
   * The stylesheet this plugin declares, overriding the default `@import` hint.
   *
   * KaTeX's CSS points at `fonts/…` relative to its own file, so the default value cannot be
   * injected into a `<style>` and the renderers skip it — with a bundler, `import
   * "@ai-gui/plugin-katex/style.css"` is the answer. A host with no build step passes the
   * stylesheet itself: `css: katexInlineCss({ fontBase: "/assets/katex/fonts/" })` from
   * `@ai-gui/plugin-katex/inline-css`.
   */
  css?: string
}

export function katex(options: KatexOptions = {}): AIGuiPlugin {
  if (options.chemistry) {
    // mhchem installs itself into KaTeX as a side effect. Rendering happens inside a synchronous
    // markdown-it rule and cannot await anything, so the import is started here and the grammar is
    // in place by the time an answer streams in. A load failure leaves \ce{} rendering as it did
    // before rather than taking the lesson down.
    void import("katex/contrib/mhchem").catch(() => {})
  }
  return {
    name: "katex",
    css: options.css ?? katexCssImport,
    promptSpec: (locale) => katexPromptSpec(locale, { chemistry: options.chemistry }),
    extendParser: (md) => {
      md.inline.ruler.after("escape", "math_inline", mathInline as never)
      md.block.ruler.after("blockquote", "math_block", mathBlock as never, {
        alt: ["paragraph", "reference", "blockquote", "list"],
      })
      md.renderer.rules.math_inline = (tokens, idx) => renderMath(tokens[idx].content, false)
      md.renderer.rules.math_block = (tokens, idx) => renderMath(tokens[idx].content, true) + "\n"
    },
  }
}
