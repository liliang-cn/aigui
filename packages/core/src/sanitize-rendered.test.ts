// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { sanitizeRenderedHtml } from "./sanitizer"

const svg = '<svg id="aigui-mermaid-1"><foreignObject><div>节点标签</div></foreignObject></svg>'

describe("sanitizeRenderedHtml", () => {
  it("leaves markup a plugin built alone, because sanitizing strips the diagram's labels", () => {
    // DOMPurify drops foreignObject, which is where Mermaid puts every label in the picture — the
    // diagram survives as an empty shape. In a bare Node environment the whole SVG is escaped into
    // its own source text instead. Hosts bypassed their sanitizer by matching the plugin's id.
    const sanitized = sanitizeRenderedHtml(svg, undefined, false)
    expect(sanitized).not.toContain("节点标签")
    expect(sanitized).not.toContain("foreignObject")

    expect(sanitizeRenderedHtml(svg, undefined, true)).toBe(svg)
  })

  it("still sanitizes markup that came from the model", () => {
    const attack = '<img src=x onerror="alert(1)">'
    expect(sanitizeRenderedHtml(attack, undefined, false)).not.toContain("onerror")
  })

  it("lets a host refuse to take a plugin's word for it", () => {
    expect(sanitizeRenderedHtml(svg, { trustPlugins: false }, true)).not.toContain("节点标签")
  })

  it("hands trusted output to a custom sanitizer only when the host asked for that", () => {
    const sanitizer = vi.fn(() => "cleaned")
    expect(sanitizeRenderedHtml(svg, { sanitizer }, true)).toBe(svg)
    expect(sanitizer).not.toHaveBeenCalled()

    expect(sanitizeRenderedHtml(svg, { sanitizer, trustPlugins: false }, true)).toBe("cleaned")
    expect(sanitizer).toHaveBeenCalledOnce()
  })

  it("does nothing at all when sanitizing is switched off", () => {
    expect(sanitizeRenderedHtml('<img src=x onerror="alert(1)">', false, false)).toContain("onerror")
  })
})
