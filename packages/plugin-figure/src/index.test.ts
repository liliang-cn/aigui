// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { collectNodeRenderers, type ASTNode, type RenderOutput } from "@ai-gui/core"
import { figure, figurePromptSpec, parseFigure, renderFigureSVG } from "./index"

/** The figure a biology lesson actually draws: a cell, its organelles named. */
const cell = {
  version: 1,
  title: "动物细胞",
  caption: "图 1 动物细胞的基本结构",
  parts: [
    { shape: "ellipse", at: [0, 0], width: 220, height: 160, fill: "none", label: "细胞膜", note: "控制物质进出" },
    { shape: "ellipse", at: [-20, 10], width: 70, height: 60, fill: "solid", label: "细胞核", note: "储存 DNA" },
    { shape: "ellipse", at: [55, -30], width: 40, height: 22, rotation: 25, label: "线粒体", note: "供能" },
    { shape: "polygon", points: [[-70, -40], [-40, -55], [-30, -30], [-60, -20]], label: "高尔基体" },
  ],
}

function render(diagram: unknown): string {
  const out = collectNodeRenderers([figure()]).figure({
    key: "0:a",
    type: "figure",
    content: JSON.stringify(diagram),
  } as ASTNode) as RenderOutput
  if (out.kind !== "html") throw new Error("expected html output")
  return out.html
}

describe("plugin-figure", () => {
  it("draws each part and names it", () => {
    const svg = render(cell)

    expect(svg).toContain('data-aigui-figure="diagram"')
    expect(svg.match(/<ellipse/g)).toHaveLength(3)
    expect(svg).toContain("<polygon")
    for (const label of ["细胞膜", "细胞核", "线粒体", "高尔基体", "储存 DNA", "图 1 动物细胞的基本结构"]) {
      expect(svg).toContain(label)
    }
  })

  it("draws a leader line from each label to the part it names", () => {
    const svg = render(cell)

    // Four labels, so four leaders and four dots on the parts they point at.
    expect(svg.match(/aigui-figure-leader"/g)).toHaveLength(4)
    expect(svg.match(/aigui-figure-leader-dot/g)).toHaveLength(4)
  })

  it("places the labels itself, on both sides, so the model does not have to lay them out", () => {
    const parsed = parseFigure(JSON.stringify(cell))
    if (!parsed.valid) throw new Error(parsed.issues.join(" "))
    const svg = renderFigureSVG(parsed.data)

    // Labels on the left are right-aligned against the figure and vice versa; a single anchor would
    // run the text back over the drawing.
    expect(svg).toContain('text-anchor="end"')
    expect(svg).toContain('text-anchor="start"')
    // Stacked down the height rather than piled at one y — four labels at one point is unreadable.
    const ys = [...svg.matchAll(/class="aigui-figure-label"[^>]*/g)].length
    expect(ys).toBe(4)
    const labelYs = new Set([...svg.matchAll(/<text x="(-?[\d.]+)" y="(-?[\d.]+)" class="aigui-figure-label"/g)].map((m) => m[2]))
    expect(labelYs.size).toBeGreaterThan(1)
  })

  it("sends each label out to the side its part is already on, so no leader crosses the figure", () => {
    // The failure this guards is only visible on screen: alternating sides by list position sent the
    // label for the nucleus, which sits left of centre, out to the right — its leader then ran the
    // whole width of the cell, across every organelle in between.
    const parsed = parseFigure(
      JSON.stringify({
        version: 1,
        parts: [
          { at: [0, 0], width: 220, height: 160, fill: "none", label: "outer" },
          { at: [-60, 20], width: 40, height: 30, label: "on the left" },
          { at: [70, -20], width: 40, height: 30, label: "on the right" },
          { at: [-50, -40], width: 30, height: 20, label: "also left" },
        ],
      }),
    )
    if (!parsed.valid) throw new Error(parsed.issues.join(" "))
    const svg = renderFigureSVG(parsed.data)

    const labels = [...svg.matchAll(/<text x="(-?[\d.]+)" y="(-?[\d.]+)" class="aigui-figure-label"[^>]*>([^<]*)</g)].map(
      (match) => ({ x: Number(match[1]), text: match[3] }),
    )
    const xOf = (text: string) => labels.find((label) => label.text === text)?.x ?? Number.NaN

    expect(xOf("on the left")).toBeLessThan(0)
    expect(xOf("also left")).toBeLessThan(0)
    expect(xOf("on the right")).toBeGreaterThan(0)
    // Two labels share the left column, so they must not land on the same line.
    const leftYs = [...svg.matchAll(/<text x="(-?[\d.]+)" y="(-?[\d.]+)" class="aigui-figure-label"/g)]
      .filter((match) => Number(match[1]) < 0)
      .map((match) => match[2])
    expect(new Set(leftYs).size).toBe(leftYs.length)
  })

  it("splits concentric parts across both sides, which following the part cannot do", () => {
    // A cell drawn as membrane, cytoplasm and nucleus shares one centre. Placing each label on the
    // side of its part put all three in the left gutter and left the right one empty, which is how
    // the long notes came to be crushed against the edge.
    const svg = render({
      version: 1,
      parts: [
        { at: [0, 0], width: 200, height: 150, fill: "none", label: "Cell Membrane" },
        { at: [0, 0], width: 150, height: 110, fill: "none", label: "Cytoplasm" },
        { at: [0, 0], width: 50, height: 45, fill: "solid", label: "Nucleus" },
      ],
    })

    const xs = [...svg.matchAll(/<text x="(-?[\d.]+)" y="-?[\d.]+" class="aigui-figure-label"/g)].map((match) =>
      Number(match[1]),
    )
    expect(xs).toHaveLength(3)
    expect(xs.some((x) => x < 0)).toBe(true)
    expect(xs.some((x) => x > 0)).toBe(true)
  })

  it("makes the drawing box wide enough for the text each side actually holds", () => {
    // A fixed allowance clipped this note against the left edge, in the running app, while every
    // assertion about the markup passed. The box has to grow with the longest string on each side.
    const long = "control center containing DNA and the nucleolus"
    const svg = render({
      version: 1,
      parts: [
        { at: [0, 0], width: 60, height: 60, label: "Nucleus", note: long },
        { at: [80, 0], width: 30, height: 30, label: "N" },
      ],
    })

    const viewBox = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg)
    expect(viewBox).not.toBeNull()
    const [minX, , width] = [Number(viewBox?.[1]), 0, Number(viewBox?.[3])]
    const labelX = Number(/<text x="(-?[\d.]+)" y="-?[\d.]+" class="aigui-figure-note"/.exec(svg)?.[1])

    // The note is right-aligned at labelX and runs leftwards; its far end must be inside the box.
    expect(labelX - long.length * 6).toBeGreaterThan(minX)
    // A short label must not pay for the long one's gutter on the other side.
    expect(width).toBeLessThan(1200)
  })

  it("honours a label position the model chose", () => {
    const svg = render({
      version: 1,
      parts: [{ at: [0, 0], width: 40, height: 40, label: "here", labelAt: [200, 90] }],
    })

    expect(svg).toContain('x="200" y="90"')
  })

  it("keeps the drawing in the host's colours rather than choosing its own", () => {
    const svg = render(cell)

    expect(svg).not.toMatch(/(stroke|fill)="#[0-9a-f]{3,6}"/i)
    expect(svg).toContain('class="aigui-figure-part aigui-figure-fill-none"')
  })

  it("says what it produced is its own markup, so a sanitizer does not strip the drawing", () => {
    const out = collectNodeRenderers([figure()]).figure({
      key: "0:a",
      type: "figure",
      content: JSON.stringify(cell),
    } as ASTNode) as RenderOutput

    expect(out).toMatchObject({ kind: "html", trusted: true })
  })

  it("escapes a label rather than letting it become markup", () => {
    const svg = render({
      version: 1,
      parts: [{ at: [0, 0], label: "<script>alert(1)</script>" }],
    })

    expect(svg).not.toContain("<script>")
    expect(svg).toContain("&lt;script&gt;")
  })

  it("refuses a figure that is not one, instead of drawing something confident and wrong", () => {
    for (const [source, reason] of [
      ["not json", "valid JSON"],
      ["[]", "JSON object"],
      ['{"parts":[]}', '"version": 1'],
      ['{"version":1}', "$.parts must be an array"],
      ['{"version":1,"parts":[]}', "at least one"],
      ['{"version":1,"parts":[{"at":[0,"x"]}]}', "two finite numbers"],
      ['{"version":1,"parts":[{"shape":"blob","at":[0,0]}]}', "shape must be one of"],
      ['{"version":1,"parts":[{"at":[0,0],"fill":"rainbow"}]}', "fill must be one of"],
      ['{"version":1,"parts":[{"shape":"polygon","points":[[0,0],[1,1]]}]}', "at least three"],
    ] as const) {
      const parsed = parseFigure(source)
      expect(parsed.valid, source).toBe(false)
      if (!parsed.valid) expect(parsed.issues.join(" "), source).toContain(reason)
    }
  })

  it("refuses a figure too large to be a figure", () => {
    const many = { version: 1, parts: Array.from({ length: 100 }, () => ({ at: [0, 0] })) }
    expect(parseFigure(JSON.stringify(many)).valid).toBe(false)
    expect(parseFigure(JSON.stringify(cell), { maxSourceBytes: 10 }).valid).toBe(false)
  })

  it("renders an error in place rather than throwing into the answer", () => {
    const out = collectNodeRenderers([figure()]).figure({
      key: "0:a",
      type: "figure",
      content: "{{{",
    } as ASTNode) as RenderOutput

    expect(out.kind).toBe("html")
    if (out.kind === "html") expect(out.html).toContain("data-aigui-figure-error")
  })

  it("tells the model what this is for, and what it is not for", () => {
    const spec = figurePromptSpec()

    expect(spec).toContain("```figure")
    expect(spec).toContain("y increases upwards")
    // A model reaching for a labelled diagram will otherwise reach for mermaid.
    expect(spec).toContain("```mermaid")
    expect(spec).toContain("Never emit URLs")
  })
})
