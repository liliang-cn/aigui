import { buildPrompt, type CustomPlugin } from "@ai-gui/cli"
import { BLOCKS, BLOCK_NAMES } from "./blocks"

/**
 * What the agent reads before it writes a block.
 *
 * Every plugin's full spec together is tens of kilobytes, which is too much to put in a tool
 * description that is sent on every turn whether or not anything gets drawn. So the description
 * lists the blocks, and this returns the exact rules for the few the agent is about to use —
 * the same text `buildSystemPrompt` gives a browser, from the same plugins.
 */
export async function guide(blocks?: string[], locale?: string, custom: readonly CustomPlugin[] = []): Promise<string> {
  if (!blocks || blocks.length === 0) return listing(custom)
  const customNamed = (name: string) => custom.find((p) => p.name === name || p.fences.includes(name))
  const unknown = blocks.filter((name) => !BLOCK_NAMES.includes(name) && !customNamed(name))
  if (unknown.length > 0) throw new Error(`Unknown block ${unknown.join(", ")}. Known: ${[...BLOCK_NAMES, ...custom.map((p) => p.name)].join(", ")}.`)
  const builtIn = [...new Set(blocks.filter((name) => BLOCK_NAMES.includes(name)))]
  const parts: string[] = []
  if (builtIn.length > 0) parts.push((await buildPrompt({ plugins: builtIn.map((name) => ({ name, options: {} })), cards: [], actions: [], locale })).prompt)
  // A custom block's rules are its own spec.md, as its author wrote them.
  for (const p of new Set(blocks.map(customNamed).filter((p): p is CustomPlugin => !!p))) parts.push(p.spec)
  return parts.join("\n\n")
}

function listing(custom: readonly CustomPlugin[]): string {
  const rows = [
    ...BLOCKS.map((block) => `- ${block.name} (${block.fence})${block.picture ? "" : " [page only]"}: ${block.what}`),
    ...custom.map((p) => `- ${p.name} (${p.fences.map((f) => `\`\`\`${f}`).join(", ")}) [custom]${p.picture ? "" : " [page only]"}: ${p.description}`),
  ]
  return [
    "Blocks you can draw. Call aigui_guide again with the names you will use to get their exact syntax.",
    "Markdown tables are drawn too and need no guide.",
    "[page only] blocks draw in aigui_open's browser page but not in aigui_render's PNGs.",
    "",
    ...rows,
  ].join("\n")
}
