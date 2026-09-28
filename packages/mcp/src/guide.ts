import { buildPrompt } from "@ai-gui/cli"
import { BLOCKS, BLOCK_NAMES } from "./blocks"

/**
 * What the agent reads before it writes a block.
 *
 * Every plugin's full spec together is tens of kilobytes, which is too much to put in a tool
 * description that is sent on every turn whether or not anything gets drawn. So the description
 * lists the blocks, and this returns the exact rules for the few the agent is about to use —
 * the same text `buildSystemPrompt` gives a browser, from the same plugins.
 */
export async function guide(blocks?: string[], locale?: string): Promise<string> {
  if (!blocks || blocks.length === 0) return listing()
  const unknown = blocks.filter((name) => !BLOCK_NAMES.includes(name))
  if (unknown.length > 0) throw new Error(`Unknown block ${unknown.join(", ")}. Known: ${BLOCK_NAMES.join(", ")}.`)
  const { prompt } = await buildPrompt({ plugins: [...new Set(blocks)].map((name) => ({ name, options: {} })), cards: [], actions: [], locale })
  return prompt
}

function listing(): string {
  const rows = BLOCKS.map((block) => `- ${block.name} (${block.fence})${block.picture ? "" : " [page only]"}: ${block.what}`)
  return [
    "Blocks you can draw. Call aigui_guide again with the names you will use to get their exact syntax.",
    "Markdown tables are drawn too and need no guide.",
    "[page only] blocks draw in aigui_open's browser page but not in aigui_render's PNGs.",
    "",
    ...rows,
  ].join("\n")
}
