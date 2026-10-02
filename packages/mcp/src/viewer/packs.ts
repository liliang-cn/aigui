import type { AIGuiPlugin } from "@ai-gui/core"

/** A pack's plugins, set up for the page's theme and for whether anything may play. */
export type PackFactory = (theme: string, still: boolean) => AIGuiPlugin[]

type PackRegistry = Record<string, PackFactory>
const registry = (): PackRegistry => ((globalThis as { __aiguiPacks?: PackRegistry }).__aiguiPacks ??= {})

/** Called by each pack's script as it loads. */
export function registerPack(name: string, factory: PackFactory): void {
  registry()[name] = factory
}

export const loadedPack = (name: string): PackFactory | undefined => registry()[name]

/**
 * The heavy plugins, by the script that carries them, and the fences each one draws.
 *
 * Everything else — markdown, tables, lists, sources, progress and the dependency-free teaching
 * figures — is in the page's main script. These load only when the answer has a block for them:
 * a page with one bar chart should not download a 3D engine, a molecule viewer and a diagram
 * library to show it.
 */
export const PACKS: Record<string, readonly string[]> = {
  echarts: ["chart", "dashboard", "bigscreen"],
  mermaid: ["mermaid"],
  three: ["scene", "solid", "graph"],
  molecule: ["molecule"],
  topology: ["topology"],
  katex: [],
  highlight: [],
}

/** Fence names the page draws itself or through a pack — anything else is code to highlight. */
const BLOCKS = new Set([
  ...Object.values(PACKS).flat(),
  "function", "optics", "motion", "physics", "figure", "quote", "gravity",
  "list", "table", "key-value", "layout", "progress", "sources", "flashcards",
])

/** Which packs an answer needs, from the fences and the maths in it. */
export function packsFor(markdown: string, customFences: readonly string[] = []): string[] {
  const needed = new Set<string>()
  for (const match of markdown.matchAll(/^ {0,3}(?:`{3,}|~{3,})[ \t]*([\w:+#.-]*)/gm)) {
    const name = match[1].toLowerCase()
    if (!name) continue
    const pack = Object.entries(PACKS).find(([, fences]) => fences.includes(name))?.[0]
    if (pack) needed.add(pack)
    else if (!BLOCKS.has(name) && !customFences.includes(name) && !name.startsWith("card:")) needed.add("highlight")
  }
  // $$…$$, \(…\), or a $…$ that looks like maths rather than a price.
  if (/\$\$|\\\(|\\\[|(^|[^\\$\w])\$[^$\s][^$\n]*[^$\s\\]\$(?!\d)/m.test(markdown) || /\\ce\{/.test(markdown)) needed.add("katex")
  return [...needed]
}
