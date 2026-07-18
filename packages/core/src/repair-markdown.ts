/**
 * Temporarily repair half-finished markdown so a partial streaming buffer
 * renders smoothly. Operates on a copy of the buffer and returns a new string;
 * it never mutates the input. Pure function, no dependencies.
 *
 * The repairs are intentionally conservative: only unambiguous unclosed
 * inline/fence syntax is completed. Ambiguous constructs (e.g. a dangling
 * link text `[docs`) are left untouched to avoid guessing wrong.
 */
export function repairMarkdown(buffer: string): string {
  let out = buffer

  // 1. Code fences first: an odd number of ``` lines means an open fence.
  const fenceCount = (out.match(/^```/gm) ?? []).length
  if (fenceCount % 2 === 1) {
    if (!out.endsWith("\n")) out += "\n"
    out += "```"
    // Inside an open fence everything is literal, so do not touch inline syntax.
    return out
  }

  // 2. Inline code: an odd number of backticks means one is left open.
  const tick = (out.match(/`/g) ?? []).length
  if (tick % 2 === 1) out += "`"

  // 3. Bold **: complete a dangling pair.
  const bold = (out.match(/\*\*/g) ?? []).length
  if (bold % 2 === 1) out += "**"

  // 4. Strikethrough ~~: complete a dangling pair.
  const strike = (out.match(/~~/g) ?? []).length
  if (strike % 2 === 1) out += "~~"

  return out
}
