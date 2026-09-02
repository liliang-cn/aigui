import { readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { centerOf, halfExtents } from "./bounds"
import { parseScene } from "./parse"

/**
 * The scenes a model actually produced, kept as fixtures.
 *
 * These are not invented inputs: they are the 11 blocks `claude-fable-5-1` wrote through
 * `claude -p` when given this plugin's own prompt spec and twelve requests — furniture, a
 * snowman, a bridge, a bolt, a robot file placed on a table. The twelfth request, a cube section,
 * correctly produced no scene at all. A protocol change that these stop parsing is a protocol
 * change that breaks answers already being written.
 */
const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures")
const fixtures = readdirSync(dir).filter((name) => name.endsWith(".json")).sort()
const allowed = { allowedModelOrigins: ["https://assets.example.com"] }

const load = (name: string) => {
  const result = parseScene(readFileSync(join(dir, name), "utf8"), allowed)
  if (!result.ok) throw new Error(`${name}: ${result.error.message}`)
  return result.value
}

describe("the model's own scenes", () => {
  it("has the whole probe run to check against", () => {
    expect(fixtures.length).toBe(11)
  })
  it.each(fixtures)("%s parses", (name) => {
    expect(load(name).definition.objects.length).toBeGreaterThan(0)
  })
  it.each(fixtures)("%s keeps everything on or above the ground, except what is meant to be below it", (name) => {
    // The river in the bridge scene is dug 0.2 m into the ground on purpose; nothing else should
    // poke through — a chair leg ending at -0.1 would mean the anchor rule had not been followed.
    for (const object of load(name).definition.objects) {
      const bottom = centerOf(object)[1] - halfExtents(object)[1]
      expect(bottom, `${name} ${object.shape} ${object.label ?? ""}`).toBeGreaterThanOrEqual(name === "12.json" ? -0.2 : -1e-9)
    }
  })
  it.each(fixtures)("%s stays within a room's worth of space", (name) => {
    // A scene that wanders off to x = 400 has confused metres with something else.
    for (const object of load(name).definition.objects) {
      const [x, y, z] = centerOf(object)
      expect(Math.max(Math.abs(x), Math.abs(y), Math.abs(z)), `${name} ${object.shape}`).toBeLessThan(20)
    }
  })
})

describe("the answers whose geometry can be checked", () => {
  it("01: the chairs' seats are lower than the table top", () => {
    const { definition } = load("01.json")
    const top = definition.objects.find((o) => o.label === "桌面")!
    const seats = definition.objects.filter((o) => o.label === "椅子")
    expect(seats).toHaveLength(2)
    for (const seat of seats) expect(centerOf(seat)[1]).toBeLessThan(centerOf(top)[1])
  })
  it("06: the nut is a six-sided cylinder", () => {
    const { definition } = load("06.json")
    const nut = definition.objects.find((o) => o.shape === "cylinder" && "sides" in o && o.sides === 6)
    expect(nut).toBeDefined()
  })
  it("10: the robot file is used with the URL the question gave, not one the model made up", () => {
    const { definition, refused } = load("10.json")
    const robot = definition.objects.find((o) => o.shape === "model")
    expect(robot).toMatchObject({ shape: "model", src: "https://assets.example.com/models/robot.glb", anchor: "bottom" })
    expect(refused).toEqual([])
  })
  it("10: without the allowlist the table survives and the robot is the one thing refused", () => {
    const result = parseScene(readFileSync(join(dir, "10.json"), "utf8"))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.definition.objects.every((o) => o.shape !== "model")).toBe(true)
    expect(result.value.refused).toHaveLength(1)
  })
})
