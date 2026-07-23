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

  // 1. Code fences first, respecting marker type/length and up to 3 spaces indent.
  const openFence = findOpenFence(out)
  if (openFence) {
    if (!out.endsWith("\n")) out += "\n"
    out += openFence
    // Inside an open fence everything is literal, so do not touch inline syntax.
    return out
  }

  const inline = findOpenInlineCode(out)
  const visible = inline ? out.slice(0, inline.index) : out

  // 2. Close inner inline code before outer emphasis delimiters.
  const bold = countUnescaped(visible, "**")
  const strike = countUnescaped(visible, "~~")
  if (inline) out += inline.marker
  if (strike % 2 === 1) out += "~~"
  if (bold % 2 === 1) out += "**"

  return out
}

function findOpenFence(buffer: string): string | undefined {
  let open: { char: string; length: number; marker: string } | undefined
  for (const line of buffer.split(/\r\n|\r|\n/)) {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (!match) continue
    const marker = match[1]
    if (!open) {
      open = { char: marker[0], length: marker.length, marker }
    } else if (marker[0] === open.char && marker.length >= open.length && match[2].trim() === "") {
      open = undefined
    }
  }
  return open?.marker
}

function findOpenInlineCode(buffer: string): { index: number; marker: string } | undefined {
  let open: { index: number; marker: string } | undefined
  for (let i = 0; i < buffer.length;) {
    if (buffer[i] !== "`" || isEscaped(buffer, i)) { i++; continue }
    let end = i + 1
    while (buffer[end] === "`") end++
    const marker = buffer.slice(i, end)
    if (!open) open = { index: i, marker }
    else if (open.marker === marker) open = undefined
    i = end
  }
  return open
}

function countUnescaped(buffer: string, marker: string): number {
  let count = 0
  for (let i = 0; i <= buffer.length - marker.length; i++) {
    if (buffer.startsWith(marker, i) && !isEscaped(buffer, i)) {
      count++
      i += marker.length - 1
    }
  }
  return count
}

function isEscaped(buffer: string, index: number): boolean {
  let slashes = 0
  for (let i = index - 1; i >= 0 && buffer[i] === "\\"; i--) slashes++
  return slashes % 2 === 1
}
