/** One thing about a drawn block that a reader would trip over. */
export interface Issue {
  /** Which block family it was found in, from the nearest `data-aigui-*` host — e.g. "scene". */
  block: string
  kind: "plugin" | "clipped" | "tiny-text" | "low-contrast" | "empty"
  message: string
}

/**
 * Look over what was drawn under `root` and say what a reader would trip over.
 *
 * A picture that came back is not a picture that works: a 3D graph of tiny unlabelled dots, labels
 * piled on one another, a KPI whose number is cut off — each rendered without an error. This is the
 * second look that used to depend on someone opening the PNG. It checks what the DOM can tell:
 *
 * - **plugin**: anything a plugin flagged itself with `data-aigui-issue` — what only it can know,
 *   like scene labels it could not keep apart or a chart with more points than it has room for.
 * - **clipped**: text cut off by its box (ellipsis or hidden overflow), or drawn outside the block.
 * - **tiny-text**: text rendered under 9 CSS pixels tall, in HTML or SVG.
 * - **low-contrast**: HTML text whose contrast with what is behind it is under 3:1.
 * - **empty**: a block that drew nothing.
 *
 * It must stay self-contained — no imports, no helpers outside its body — because it also runs as
 * the argument of Playwright's `page.evaluate`, which sends the function's source text to the page.
 */
export function inspectRendered(root: Element, limit = 12): Issue[] {
  const issues: Issue[] = []
  const seen = new Set<string>()
  const blockOf = (el: Element): string => {
    for (let node: Element | null = el; node && node !== root.parentElement; node = node.parentElement) {
      for (const name of node.getAttributeNames()) {
        const match = /^data-aigui-([a-z0-9]+)$/.exec(name)
        if (match && !["issue", "renderer", "mount", "style", "node", "block"].includes(match[1])) return match[1]
      }
    }
    return "markdown"
  }
  const add = (el: Element, kind: Issue["kind"], message: string) => {
    const block = blockOf(el)
    const key = `${block}|${kind}|${message}`
    if (seen.has(key) || issues.length >= limit) return
    seen.add(key)
    issues.push({ block, kind, message })
  }
  const short = (text: string) => {
    const clean = text.replace(/\s+/g, " ").trim()
    return clean.length > 40 ? `${clean.slice(0, 39)}…` : clean
  }

  for (const el of Array.from(root.querySelectorAll("[data-aigui-issue]"))) {
    const message = el.getAttribute("data-aigui-issue")
    if (message) add(el, "plugin", message)
  }

  const rootBox = root.getBoundingClientRect()
  if (rootBox.height < 40 && !root.textContent?.trim()) add(root, "empty", "the block drew nothing")

  /** Elements whose own text (not a child's) is what is on screen. */
  const texty = Array.from(root.querySelectorAll<HTMLElement | SVGElement>("*")).filter((el) =>
    // Visible characters only: KaTeX and others pad their layout with zero-width spaces.
    Array.from(el.childNodes).some((n) => n.nodeType === 3 && /[^\s\u200b-\u200f\u2060\ufeff]/.test(n.textContent ?? "")),
  )

  const parse = (colour: string): [number, number, number, number] | undefined => {
    const m = /rgba?\(([^)]+)\)/.exec(colour)
    if (!m) return undefined
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1]
  }
  const luminance = ([r, g, b]: number[]) => {
    const channel = (v: number) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  }
  /** The colour behind `el`: the nearest opaque-enough background up the tree, else the page's. */
  const backdrop = (el: Element): [number, number, number] | undefined => {
    for (let node: Element | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.backgroundImage && style.backgroundImage !== "none") return undefined
      const bg = parse(style.backgroundColor)
      if (bg && bg[3] > 0.85) return [bg[0], bg[1], bg[2]]
    }
    const page = parse(getComputedStyle(document.body).backgroundColor)
    return page && page[3] > 0 ? [page[0], page[1], page[2]] : [255, 255, 255]
  }

  for (const el of texty) {
    const box = el.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) continue
    const text = short(el.textContent ?? "")
    const style = getComputedStyle(el)
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) continue

    if (el instanceof HTMLElement) {
      const cut = el.scrollWidth > el.clientWidth + 1 && (style.textOverflow === "ellipsis" || style.overflowX === "hidden" || style.overflowX === "clip")
      if (cut) add(el, "clipped", `"${text}" is cut off by its box`)
    }
    if (box.right > rootBox.right + 1 || box.left < rootBox.left - 1) add(el, "clipped", `"${text}" runs outside the block`)

    const size = el instanceof SVGElement ? box.height : Number.parseFloat(style.fontSize)
    if (size > 0 && size < 9) add(el, "tiny-text", `"${text}" is ${size.toFixed(1)}px tall — too small to read`)

    if (el instanceof HTMLElement) {
      const fg = parse(style.color)
      const bg = backdrop(el)
      if (fg && bg && fg[3] > 0.5) {
        const [a, b] = [luminance(fg), luminance(bg)]
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
        if (ratio < 3) add(el, "low-contrast", `"${text}" has contrast ${ratio.toFixed(1)}:1 against its background`)
      }
    }
  }
  return issues
}
