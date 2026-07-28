// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { collectNodeRenderers, type ASTNode, type RenderOutput } from "@ai-gui/core"
import { parsePhysicsDiagram, physics, physicsPromptSpec, renderPhysicsSVG } from "./index"

/** The diagram a mechanics lesson actually draws: a block on an incline, forces resolved. */
const incline = {
  version: 1,
  title: "斜面上的物块",
  bodies: [{ at: [0, 0], shape: "box", width: 60, height: 40, rotation: 30, label: "m" }],
  surfaces: [{ from: [-120, -70], to: [120, 65], hatch: true, label: "斜面" }],
  vectors: [
    { magnitude: 90, angle: -90, style: "force", label: "mg" },
    { magnitude: 78, angle: 120, style: "force", label: "N" },
    { magnitude: 45, angle: -150, style: "component", dashed: true, label: "mg sin θ" },
  ],
  angles: [{ at: [-120, -70], from: 0, to: 30, radius: 40, label: "θ = 30°" }],
}

function render(diagram: unknown): string {
  const out = collectNodeRenderers([physics()]).physics({
    key: "0:a",
    type: "physics",
    content: JSON.stringify(diagram),
  } as ASTNode) as RenderOutput
  if (out.kind !== "html") throw new Error("expected html output")
  return out.html
}

describe("plugin-physics", () => {
  it("draws the bodies, surfaces, vectors and angles a free-body diagram is made of", () => {
    const svg = render(incline)

    expect(svg).toContain("data-aigui-physics=\"diagram\"")
    expect(svg).toContain("<rect")
    expect(svg).toContain("aigui-physics-surface")
    expect(svg).toContain("aigui-physics-hatch")
    expect(svg).toContain("<path")
    // Three arrows, each with a marker.
    expect(svg.match(/marker-end=/g)).toHaveLength(3)
    for (const label of ["mg", "N", "mg sin θ", "θ = 30°", "斜面", "m"]) {
      expect(svg).toContain(label)
    }
  })

  it("reads a vector given as a magnitude and an angle, the way a problem states it", () => {
    // "90 N at -90°" is downwards. The tip must be below the start, and the flip that makes the y
    // axis point up is applied once to the whole drawing rather than to each number.
    const svg = renderPhysicsSVG(
      { version: 1, bodies: [{ at: [0, 0], shape: "point" }], vectors: [{ magnitude: 90, angle: -90, label: "mg" }] },
      {},
    )

    expect(svg).toMatch(/<line x1="0" y1="0" x2="0" y2="-90"/)
    expect(svg).toContain('scale(1, -1)')
  })

  it("keeps the drawing in the host's colours rather than choosing its own", () => {
    // A diagram on a dark page must not come back in ink chosen for a light one.
    const svg = render(incline)

    expect(svg).toContain("var(--aigui-physics-force, currentColor)")
    expect(svg).toContain("var(--aigui-physics-component, currentColor)")
    expect(svg).not.toMatch(/stroke="#[0-9a-f]{3,6}"/i)
  })

  it("says what it produced is its own markup, so a sanitizer does not strip the drawing", () => {
    const out = collectNodeRenderers([physics()]).physics({
      key: "0:a",
      type: "physics",
      content: JSON.stringify(incline),
    } as ASTNode) as RenderOutput

    // Sanitizing SVG drops the shapes; the plugin built this from coordinates, not from model markup.
    expect(out).toMatchObject({ kind: "html", trusted: true })
  })

  it("escapes a label rather than letting it become markup", () => {
    const svg = render({
      version: 1,
      bodies: [{ at: [0, 0], label: '<script>alert(1)</script>' }],
    })

    expect(svg).not.toContain("<script>")
    expect(svg).toContain("&lt;script&gt;")
  })

  it("refuses a diagram that is not one, instead of drawing something confident and wrong", () => {
    for (const [source, reason] of [
      ["not json", "valid JSON"],
      ["[]", "JSON object"],
      ['{"bodies":[]}', '"version": 1'],
      ['{"version":1}', "at least one"],
      ['{"version":1,"bodies":[{"at":[0,"x"]}]}', "finite numbers"],
      ['{"version":1,"bodies":[{"at":[0,0],"shape":"blob"}]}', "box, circle, or point"],
      ['{"version":1,"vectors":[{"label":"F"}]}', 'needs either "to"'],
      ['{"version":1,"bodies":[{"at":[0,0]}],"vectors":[{"to":[1,1],"style":"wiggle"}]}', "style is not one of"],
    ] as const) {
      const parsed = parsePhysicsDiagram(source)
      expect(parsed.valid, source).toBe(false)
      if (!parsed.valid) expect(parsed.issues.join(" "), source).toContain(reason)
    }
  })

  it("refuses a diagram too large to be a diagram", () => {
    const many = { version: 1, bodies: Array.from({ length: 200 }, () => ({ at: [0, 0] })) }
    expect(parsePhysicsDiagram(JSON.stringify(many)).valid).toBe(false)
    expect(parsePhysicsDiagram(JSON.stringify(incline), { maxSourceBytes: 10 }).valid).toBe(false)
  })

  it("renders an error in place rather than throwing into the answer", () => {
    const out = collectNodeRenderers([physics()]).physics({
      key: "0:a",
      type: "physics",
      content: "{{{",
    } as ASTNode) as RenderOutput

    expect(out.kind).toBe("html")
    if (out.kind === "html") expect(out.html).toContain("data-aigui-physics-error")
  })

  it("tells the model the axis convention, which is the one thing it cannot guess", () => {
    const spec = physicsPromptSpec()

    expect(spec).toContain("```physics")
    expect(spec).toContain("y increases upwards")
    expect(spec).toContain("gravity points at angle -90")
    // And that it is a drawing: a model told "physics" reaches for a simulation.
    expect(spec).toContain("not a simulation")
    expect(spec).toContain("Never emit URLs")
  })
})

describe("what the view box has to hold", () => {
  /** Parse or fail loudly: a test that silently rendered nothing would pass for the wrong reason. */
  const asDiagram = (source: string) => {
    const parsed = parsePhysicsDiagram(source)
    if (!parsed.valid) throw new Error(parsed.issues.join(" "))
    return parsed.data
  }

  /** The numbers the renderer actually draws with, so a test cannot drift from them silently. */
  const box = (svg: string) => (/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg) ?? []).slice(1).map(Number)

  it("holds an angle mark and its label", () => {
    // The 30° at the foot of an incline is drawn 28 away from its vertex and labelled 14 further out,
    // and none of that was measured — so on a diagram whose incline starts at the left edge, the angle
    // was simply outside the picture. It is the one label a mechanics diagram cannot do without.
    const source = JSON.stringify({
      version: 1,
      surfaces: [{ from: [0, 0], to: [200, 100] }],
      angles: [{ at: [0, 0], from: 0, to: 30, radius: 28, label: "30°" }],
    })
    const svg = renderPhysicsSVG(asDiagram(source))
    const [minX, minY] = box(svg)

    // The label sits at 28 + 14 from the vertex at the origin, so anything at or right of -42 clips it.
    expect(minX).toBeLessThan(-42)
    expect(minY).toBeLessThan(-42)
  })

  it("holds a vector's label, which hangs past the arrowhead", () => {
    // "mg cos(30°)" is written past the tip of the arrow it names. Measuring the tip alone leaves the
    // words hanging outside the frame — the reader sees an arrow pointing at nothing.
    const source = JSON.stringify({
      version: 1,
      bodies: [{ at: [0, 0], shape: "point" }],
      vectors: [{ magnitude: 60, angle: 0, label: "mg cos(30°)" }],
    })
    const svg = renderPhysicsSVG(asDiagram(source))
    const [minX, , width] = box(svg)

    // Tip at x=60; the label starts 8 past it and runs the length of its text.
    expect(minX + width).toBeGreaterThan(60 + 8 + 40)
  })

  it("leaves an explicit view alone", () => {
    // A diagram that names its own box means it, and widening it would move everything in it.
    const source = JSON.stringify({ version: 1, view: [-10, -10, 110, 110], bodies: [{ at: [0, 0] }] })
    const svg = renderPhysicsSVG(asDiagram(source))
    expect(box(svg)).toEqual([-10, -10, 120, 120])
  })
})
