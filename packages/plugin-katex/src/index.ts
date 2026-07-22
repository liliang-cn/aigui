import katexLib from "katex"
import type { AIGuiPlugin } from "@ai-gui/core"

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

/** KaTeX stylesheet import hint — consumers must load KaTeX's CSS for correct layout. */
export const katexCss = '@import "katex/dist/katex.min.css";'

/**
 * KaTeX plugin: renders inline `$...$` and block `$$...$$` math to HTML during
 * markdown parsing, flowing through the core Renderer's sanitized `html` pipeline.
 */
export function katex(): AIGuiPlugin {
  return {
    name: "katex",
    css: katexCss,
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
