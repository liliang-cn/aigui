import { describe, expect, it } from "vitest"
import { parseScene } from "./parse"
import { scenePromptSpec } from "./prompt"
import { sceneStateAt } from "./steps"

const disk = () => {
  const spec = scenePromptSpec("zh-CN")
  const block = spec.split("```scene\n").find((b) => b.includes('"steps"'))!
  const result = parseScene(block.slice(0, block.indexOf("```")))
  if (!result.ok) throw new Error(result.error.message)
  return result.value.definition
}

describe("scene steps", () => {
  it("carries each change forward and lights only the current step's objects", () => {
    const definition = disk()
    const at = (i: number | "all") => sceneStateAt(definition, i)
    expect(at(-1)[2]).toEqual({ position: [0, 0.5, 0.05], color: "#64748b", visible: true, highlight: false })
    expect(at(0)[2]).toMatchObject({ color: "#dc2626", highlight: true })
    expect(at(1)[2]).toMatchObject({ color: "#dc2626", position: [0, 0.5, 1.2], highlight: false })
    expect(at(2)[2].visible).toBe(false)
    expect(at(2)[3]).toMatchObject({ position: [0, 0.5, 0.05], highlight: true })
    // Still: the last step's state, no highlight to point at.
    expect(at("all")[3]).toMatchObject({ position: [0, 0.5, 0.05], highlight: false })
  })

  it("names a step that refers to what is not there", () => {
    const base = { objects: [{ id: "a", shape: "box", size: [1, 1, 1] }, { shape: "box", size: [1, 1, 1] }] }
    const refuse = (steps: unknown) => {
      const r = parseScene(JSON.stringify({ ...base, steps }))
      return r.ok ? "" : r.error.message
    }
    expect(refuse([{ caption: "x", move: { b: [0, 0, 0] } }])).toBe('steps[0].move "b" is not an object id — give the object an "id"')
    expect(refuse([{ caption: "x", move: { a: [0, 0] } }])).toBe("steps[0].move.a must be [x, y, z]")
    expect(refuse([{ caption: "x", color: { a: "浅蓝" } }])).toBe("steps[0].color.a must be a hex colour like #4f46e5 or a colour name")
    expect(refuse([{ caption: "x", spin: ["a"] }])).toMatch(/^steps\[0\]\.spin is not a field of a step/)
    expect(refuse([{ move: { a: [0, 0, 0] } }])).toBe("steps[0].caption must be a sentence of at most 160 characters")
    expect(refuse([])).toBe("steps must not be empty — leave it out instead")
    const twice = parseScene(JSON.stringify({ objects: [{ id: "a", shape: "box", size: [1, 1, 1] }, { id: "a", shape: "box", size: [1, 1, 1] }], steps: [{ caption: "x" }] }))
    expect(twice.ok ? "" : twice.error.message).toBe('object id "a" is used twice')
  })
})
