import MarkdownIt from "markdown-it"
import type { CardRegistry } from "./card-registry"
import { pluginNodeTypes } from "./plugins"
import type { AIGuiPlugin, ASTNode } from "./types"

export interface ParserOptions {
  registry?: CardRegistry
  plugins?: AIGuiPlugin[]
  configureMd?: (md: MarkdownIt) => void
  /**
   * Whether raw HTML in the model's output is interpreted as markup. On by default.
   *
   * A model writing *about* code emits tags in prose it never meant as markup — a line like
   * `return "done\n<code>"` is text, but interpreting it swallows everything after the tag into an
   * element and the rest of the sentence lands outside it. Sanitizing does not help: `<code>` is a
   * tag any allowlist keeps. Turn this off and every tag the model writes is escaped and shown as
   * the characters it wrote, so a model that gets HTML wrong produces an ugly line rather than a
   * mangled answer.
   */
  rawHtml?: boolean
}

export interface SourceBlock {
  start: number
  end: number
  nodeStart: number
  nodeEnd: number
}

export interface ParseResult {
  nodes: ASTNode[]
  blocks: SourceBlock[]
  incrementalSafe: boolean
}

/** Build a parser that turns markdown source into a flat list of ASTNodes. */
export function createParser(options: ParserOptions = {}): (src: string, rawSrc?: string) => ASTNode[] {
  const parse = createParserWithMetadata(options)
  return (src: string, rawSrc = src): ASTNode[] => parse(src, rawSrc).nodes
}

/** Build a parser that also reports the source range for each top-level block. */
export function createParserWithMetadata(
  options: ParserOptions = {},
): (src: string, rawSrc?: string, sourceOffset?: number) => ParseResult {
  const md = new MarkdownIt({ html: options.rawHtml !== false, linkify: true })
  options.configureMd?.(md)
  for (const plugin of options.plugins ?? []) plugin.extendParser?.(md)
  const hasParserExtensions = Boolean(options.configureMd || options.plugins?.some((plugin) => plugin.extendParser))
  const pluginTypes = pluginNodeTypes(options.plugins)
  const completeness = new Map<string, AIGuiPlugin["isBlockComplete"]>()
  for (const plugin of options.plugins ?? []) {
    for (const type of Object.keys(plugin.nodeRenderers ?? {})) {
      if (plugin.isBlockComplete) completeness.set(type, plugin.isBlockComplete)
    }
  }

  return (src: string, rawSrc = src, sourceOffset = 0): ParseResult => {
    const env: Record<string, unknown> = {}
    const tokens = md.parse(normalizeLineEndings(src), env)
    const nodes: ASTNode[] = []
    const blocks: SourceBlock[] = []
    const lineOffsets = getLineOffsets(rawSrc)
    const startSlots = new Map<number, number>()
    const addNode = (node: Omit<ASTNode, "key">, map: number[] | null): void => {
      const range = sourceRange(map, rawSrc.length, lineOffsets, sourceOffset)
      const previous = blocks.at(-1)
      const block = previous && previous.start === range.start && previous.end === range.end
        ? previous
        : undefined
      const slot = startSlots.get(range.start) ?? 0
      startSlots.set(range.start, slot + 1)
      nodes.push({ key: `${range.start}:${slot}`, ...node })
      if (block) {
        block.nodeEnd = nodes.length
      } else {
        blocks.push({ ...range, nodeStart: nodes.length - 1, nodeEnd: nodes.length })
      }
    }
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]
      if (t.type === "fence") {
        const info = t.info.trim()
        if (info.startsWith("card:") && options.registry) {
          const cardType = info.slice("card:".length)
          const res = options.registry.parse(cardType, t.content)
          const complete = res.complete && isClosedFence(rawSrc, t.map, t.markup)
          const idResult = complete && res.valid ? getCardId(res.data) : undefined
          addNode({
            type: "card",
            card: {
              type: cardType,
              data: res.data,
              complete,
              valid: complete && res.valid && idResult !== false,
              ...(typeof idResult === "string" ? { id: idResult } : {}),
            },
          }, t.map)
        } else if (pluginTypes.has(info)) {
          const predicate = completeness.get(info)
          const fenceComplete = isClosedFence(rawSrc, t.map, t.markup)
          let complete = fenceComplete
          if (complete && predicate) {
            try {
              complete = predicate(info, t.content)
            } catch {
              complete = false
            }
          }
          addNode({
            type: info,
            content: t.content,
            attrs: { info },
            complete,
          }, t.map)
        } else {
          addNode({
            type: "code",
            tag: "code",
            attrs: info ? { lang: info } : undefined,
            content: t.content,
          }, t.map)
        }
        continue
      }
      if (t.type === "hr") {
        addNode({ type: "hr", tag: "hr" }, t.map)
        continue
      }
      if (t.type === "code_block") {
        addNode({ type: "code", tag: "code", content: t.content }, t.map)
        continue
      }
      if (t.type === "html_block") {
        addNode({ type: "html", content: t.content }, t.map)
        continue
      }
      if (t.type === "heading_open") {
        const inline = tokens[i + 1]
        const raw = inline?.content ?? ""
        addNode({
          type: "heading",
          tag: t.tag,
          content: raw,
          html: md.renderer.renderInline(inline?.children ?? [], md.options, env),
        }, t.map)
        i += 2 // skip inline + heading_close
        continue
      }
      if (t.type === "paragraph_open") {
        const inline = tokens[i + 1]
        const raw = inline?.content ?? ""
        addNode({
          type: "paragraph",
          tag: "p",
          content: raw,
          html: md.renderer.renderInline(inline?.children ?? [], md.options, env),
        }, t.map)
        i += 2 // skip inline + paragraph_close
        continue
      }
      // Other top-level blocks (list/blockquote/table...): render to html, refined later.
      if (t.type.endsWith("_open") && t.level === 0) {
        const closeType = t.type.replace("_open", "_close")
        let j = i
        let depth = 0
        for (; j < tokens.length; j++) {
          if (tokens[j].type === t.type) depth++
          if (tokens[j].type === closeType) {
            depth--
            if (depth === 0) break
          }
        }
        const slice = tokens.slice(i, j + 1)
        addNode({
          type: "html",
          content: md.renderer.render(slice, md.options, env),
        }, t.map)
        i = j
        continue
      }
      // Any other leftover top-level token (e.g. a self-contained block token
      // introduced by a plugin's extendParser): render it through markdown-it.
      if (t.block && t.level === 0) {
        addNode({
          type: "html",
          content: md.renderer.render([t], md.options, env),
        }, t.map)
        continue
      }
    }
    return {
      nodes,
      blocks,
      incrementalSafe: !hasParserExtensions && !hasReferenceSyntax(rawSrc),
    }
  }
}

function getCardId(data: unknown): string | false | undefined {
  if (typeof data !== "object" || data === null || Array.isArray(data) || !Object.hasOwn(data, "id")) return undefined
  const id = (data as Record<string, unknown>).id
  return typeof id === "string" && id.trim().length > 0 && id.length <= 256 ? id : false
}

function getLineOffsets(src: string): number[] {
  const offsets = [0]
  for (let i = 0; i < src.length; i++) {
    if (src[i] === "\r") {
      if (src[i + 1] === "\n") i++
      offsets.push(i + 1)
    } else if (src[i] === "\n") {
      offsets.push(i + 1)
    }
  }
  offsets.push(src.length)
  return offsets
}

function sourceRange(
  map: number[] | null,
  sourceLength: number,
  lineOffsets: number[],
  sourceOffset: number,
): Pick<SourceBlock, "start" | "end"> {
  if (!map) return { start: sourceOffset, end: sourceOffset + sourceLength }
  return {
    start: sourceOffset + Math.min(lineOffsets[map[0]] ?? sourceLength, sourceLength),
    end: sourceOffset + Math.min(lineOffsets[map[1]] ?? sourceLength, sourceLength),
  }
}

function hasReferenceSyntax(src: string): boolean {
  return /^ {0,3}\[[^\]\n]+\]:/m.test(src)
    || /\[[^\]\n]+\]\s*\[[^\]\n]*\]/.test(src)
    || /(^|[^!])\[[^\]\n]+\](?![([])/m.test(src)
}

function isClosedFence(src: string, map: number[] | null, markup: string): boolean {
  if (!map) return false
  const line = src.split(/\r\n|\r|\n/)[map[1] - 1]?.trim() ?? ""
  if (line.length < markup.length || line[0] !== markup[0]) return false
  return line.split("").every((char) => char === markup[0])
}

function normalizeLineEndings(src: string): string {
  return src.replace(/\r\n|\r/g, "\n")
}
