import { type CardRegistry, createParserWithMetadata } from "@ai-gui/core"
import type { ASTNode } from "@ai-gui/core"
import { imagePlugins } from "./plugins"
import { type BlockSelection, DEFAULT_KINDS, DEFAULT_MAX, type RenderableKind } from "./types"

/**
 * A cheap "might there be a picture in here?" test.
 *
 * The point is to spend nothing on the overwhelming majority of replies, which are prose. It is
 * intentionally loose — a sentence that happens to start with a pipe costs one markdown parse,
 * and the parse is what actually decides. Nothing launches a browser on the strength of this.
 *
 * Loose in the right direction, though. A false positive costs a parse; a false negative silently
 * drops a picture the reader asked for. Two shapes earned their own branch for that reason:
 * models write tables without leading pipes at least as often as with them, and they escalate a
 * fence to four backticks whenever the payload contains three.
 */
const TRIGGER =
  /^ {0,3}(?:(?:`{3,}|~{3,})[ \t]*(?:chart|mermaid|dashboard|card:)|\$\$|\||:?-+:?[ \t]*\|)/m

export function hasTrigger(markdown: string): boolean {
  return TRIGGER.test(markdown)
}

export interface SelectOptions {
  kinds?: RenderableKind[]
  registry?: CardRegistry
  max?: number
}

/**
 * Which picture, if any, a parsed node represents.
 *
 * Charts, diagrams and dashboards announce themselves through the node type, because their
 * plugins register node renderers. Math and tables do not: KaTeX extends markdown-it rather than
 * registering a renderer, and tables are plain markdown-it, so both arrive as generic `html`
 * nodes carrying already-rendered markup. They have to be recognised by what is in that markup.
 */
function classify(node: ASTNode): RenderableKind | undefined {
  if (node.type === "chart" || node.type === "mermaid" || node.type === "dashboard") {
    return node.complete ? (node.type as RenderableKind) : undefined
  }
  if (node.type === "card") return node.card?.complete && node.card.valid ? "card" : undefined
  if (node.type !== "html") return undefined
  const html = node.content ?? ""
  // Match the class attribute, not the bare string. Raw HTML is enabled by default, so a model
  // explaining KaTeX's own CSS would otherwise have its prose stripped out of the message and
  // replaced by a picture of that prose.
  if (/class="[^"]*\bkatex-display\b/.test(html)) return "math"
  if (/<table[\s>]/.test(html)) return "table"
  return undefined
}

export function selectRenderableBlocks(markdown: string, options: SelectOptions = {}): BlockSelection[] {
  const kinds = new Set(options.kinds ?? DEFAULT_KINDS)
  const max = options.max ?? DEFAULT_MAX
  const parse = createParserWithMetadata({ plugins: imagePlugins(), registry: options.registry })
  const { nodes, blocks } = parse(markdown)
  const selections: BlockSelection[] = []
  for (const block of blocks) {
    if (selections.length >= max) break
    // A block can span several nodes; the first one that names a picture wins.
    for (let i = block.nodeStart; i < block.nodeEnd; i++) {
      const kind = classify(nodes[i])
      if (!kind || !kinds.has(kind)) continue
      selections.push({ kind, start: block.start, end: block.end })
      break
    }
  }
  return selections
}

/**
 * Cut the rendered blocks out of the text.
 *
 * Back to front, because slicing from the front shifts every offset behind it and silently
 * corrupts the second cut onwards. Runs of blank lines left by the cuts collapse to one, so a
 * message that was mostly pictures does not arrive as a column of empty lines. The collapse has
 * to know about `\r\n` — matching bare `\n` leaves a stray blank line in every CRLF message.
 */
export function stripBlocks(markdown: string, selections: BlockSelection[]): string {
  let out = markdown
  for (const selection of [...selections].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, selection.start) + out.slice(selection.end)
  }
  return out.replace(/(?:\r?\n){3,}/g, "\n\n").trim()
}
