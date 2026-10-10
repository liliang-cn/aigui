import { describe, expect, it } from "vitest"
import { layoutTopology } from "./layout"
import { parseTopology } from "./parse"
import { topologyPromptSpec } from "./prompt"
import { frameAt, palette, svgFor, svgShell } from "./render"
import type { TopologyDefinition } from "./types"

const example = (): TopologyDefinition => {
  const spec = topologyPromptSpec("zh-CN")
  const block = spec.split("```topology\n")[1]
  const result = parseTopology(block.slice(0, block.indexOf("```")))
  if (!result.ok) throw new Error(result.error)
  return result.value
}
const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

describe("layoutTopology", () => {
  it("puts every node on the canvas, none on another", () => {
    const layout = layoutTopology(example())
    const boxes = [...layout.nodes.values()]
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.y).toBeGreaterThanOrEqual(0)
      expect(b.x + b.width).toBeLessThanOrEqual(layout.width)
      expect(b.y + b.height).toBeLessThanOrEqual(layout.height)
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i], boxes[j])).toBe(false)
  })

  it("draws each group round its own nodes and clear of the others", () => {
    const definition = example()
    const layout = layoutTopology(definition)
    for (const group of layout.groups) {
      for (const node of definition.nodes) {
        const box = layout.nodes.get(node.id)!
        const inside = box.x >= group.box.x && box.y >= group.box.y && box.x + box.width <= group.box.x + group.box.width && box.y + box.height <= group.box.y + group.box.height
        if (node.group === group.id) expect(inside, `${node.id} in ${group.id}`).toBe(true)
        else expect(overlap(box, group.box), `${node.id} clear of ${group.id}`).toBe(false)
      }
    }
  })
})

describe("frameAt", () => {
  it("carries every state change forward to the steps after it", () => {
    const definition = example()
    expect(frameAt(definition, -1).nodes.get("db1")).toBe("primary")
    expect(frameAt(definition, 3).nodes.get("db1")).toBe("failed")
    expect(frameAt(definition, 3).links[1]).toBe("down")
    // Step 5 says nothing about d1 or the link: they stay as step 4 left them.
    expect(frameAt(definition, 4).nodes.get("db1")).toBe("failed")
    expect(frameAt(definition, 4).nodes.get("db2")).toBe("primary")
    expect(frameAt(definition, 4).highlight).toEqual(new Set(["db2"]))
  })

  it("puts every step's messages on the still picture, numbered", () => {
    const frame = frameAt(example(), "all")
    expect(frame.messages.map((m) => [m.step, m.label])).toEqual([[1, "write"], [2, "data"], [3, "ack"]])
    expect(frame.nodes.get("db2")).toBe("primary")
  })
})

describe("svgFor", () => {
  it("draws the finished state with each message numbered and every text escaped", () => {
    const definition = example()
    definition.nodes[0].label = "<app & co>"
    const svg = svgFor(definition, layoutTopology(definition), frameAt(definition, "all"), palette(), true)
    expect(svg).toContain("&lt;app &amp; co&gt;")
    expect(svg).not.toContain("<app")
    expect(svg.match(/data-topo-message/g)).toHaveLength(3)
    expect(svg).toContain(">failed<")
    expect(svg).toMatch(/data-topo-link="1"[^>]*stroke-dasharray/)
  })
})

describe("svgShell", () => {
  it("scales to its container, or holds a readable width and lets the page scroll it", () => {
    const layout = layoutTopology(example())
    expect(svgShell(layout, "t")).toContain('width="100%"')
    const fixed = svgShell(layout, "t", 1234)
    expect(fixed).toContain('width="1234"')
    expect(fixed).not.toContain("100%")
  })

  it("keeps step markers off the nodes and their state badges", () => {
    const definition = example()
    const layout = layoutTopology(definition)
    const svg = svgFor(definition, layout, frameAt(definition, "all"), palette(), true)
    const markers = [...svg.matchAll(/<g data-topo-message><circle cx="([\d.]+)" cy="([\d.]+)"/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }))
    expect(markers).toHaveLength(3)
    for (const at of markers) {
      for (const b of layout.nodes.values()) {
        const inside = at.x > b.x - 9 && at.x < b.x + b.width + 9 && at.y > b.y - 17 && at.y < b.y + b.height + 9
        expect(inside).toBe(false)
      }
    }
  })
})

