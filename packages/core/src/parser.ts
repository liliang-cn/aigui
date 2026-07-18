import MarkdownIt from "markdown-it"
import type { CardRegistry } from "./card-registry"
import { pluginNodeTypes } from "./plugins"
import type { AIGuiPlugin, ASTNode } from "./types"

export interface ParserOptions {
  registry?: CardRegistry
  plugins?: AIGuiPlugin[]
  configureMd?: (md: MarkdownIt) => void
}

/** Build a parser that turns markdown source into a flat list of ASTNodes. */
export function createParser(options: ParserOptions = {}): (src: string) => ASTNode[] {
  const md = new MarkdownIt({ html: true, linkify: true })
  options.configureMd?.(md)
  for (const plugin of options.plugins ?? []) plugin.extendParser?.(md)
  const pluginTypes = pluginNodeTypes(options.plugins)

  return (src: string): ASTNode[] => {
    const tokens = md.parse(src, {})
    const nodes: ASTNode[] = []
    let index = 0
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]
      if (t.type === "fence") {
        const info = t.info.trim()
        if (info.startsWith("card:") && options.registry) {
          const cardType = info.slice("card:".length)
          const res = options.registry.parse(cardType, t.content)
          nodes.push({
            key: `${index++}:card`,
            type: "card",
            card: { type: cardType, data: res.data, complete: res.complete, valid: res.valid },
          })
        } else if (pluginTypes.has(info)) {
          nodes.push({
            key: `${index++}:${info}`,
            type: info,
            content: t.content,
            attrs: { info },
          })
        } else {
          nodes.push({
            key: `${index++}:code`,
            type: "code",
            tag: "code",
            attrs: info ? { lang: info } : undefined,
            content: t.content,
          })
        }
        continue
      }
      if (t.type === "hr") {
        nodes.push({ key: `${index++}:hr`, type: "hr", tag: "hr" })
        continue
      }
      if (t.type === "code_block") {
        nodes.push({ key: `${index++}:code`, type: "code", tag: "code", content: t.content })
        continue
      }
      if (t.type === "html_block") {
        nodes.push({ key: `${index++}:html`, type: "html", content: t.content })
        continue
      }
      if (t.type === "heading_open") {
        const inline = tokens[i + 1]
        const raw = inline?.content ?? ""
        nodes.push({
          key: `${index++}:heading`,
          type: "heading",
          tag: t.tag,
          content: raw,
          html: md.renderInline(raw),
        })
        i += 2 // skip inline + heading_close
        continue
      }
      if (t.type === "paragraph_open") {
        const inline = tokens[i + 1]
        const raw = inline?.content ?? ""
        nodes.push({
          key: `${index++}:paragraph`,
          type: "paragraph",
          tag: "p",
          content: raw,
          html: md.renderInline(raw),
        })
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
        nodes.push({
          key: `${index++}:${t.type}`,
          type: "html",
          content: md.renderer.render(slice, md.options, {}),
        })
        i = j
        continue
      }
      // Any other leftover top-level token (e.g. a self-contained block token
      // introduced by a plugin's extendParser): render it through markdown-it.
      if (t.block && t.level === 0) {
        nodes.push({
          key: `${index++}:${t.type}`,
          type: "html",
          content: md.renderer.render([t], md.options, {}),
        })
        continue
      }
    }
    return nodes
  }
}
