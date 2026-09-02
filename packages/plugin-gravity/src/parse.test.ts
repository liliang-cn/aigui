import { describe, expect, it } from "vitest"
import { parseGravity } from "./parse"

const sun = { id: "Sun", mass: 1 }
const earth = { id: "Earth", mass: 3e-6, orbit: { around: "Sun", distance: 1 } }
const scene = (extra: Record<string, unknown> = {}) => JSON.stringify({ units: "astronomical", bodies: [sun, earth], duration: 1, ...extra })

const fail = (source: string, options?: Parameters<typeof parseGravity>[1]): string => {
  const result = parseGravity(source, options)
  if (result.ok) throw new Error("expected the definition to be refused")
  return result.error.message
}

describe("parseGravity", () => {
  it("accepts the plain form and places the bodies", () => {
    const result = parseGravity(scene())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.definition).toMatchObject({ units: "astronomical", duration: 1, collisions: "none", trails: true, animate: true })
    expect(result.value.initial[1].orbit?.period).toBeCloseTo(1, 4)
  })
  it("refuses a field this protocol does not offer", () => {
    expect(fail(scene({ gravity: 9.8 }))).toContain("gravity is not a field")
    expect(fail(scene({ bodies: [sun, { ...earth, spin: 1 }] }))).toContain("bodies[1].spin is not a field of a body")
    expect(fail(scene({ bodies: [sun, { ...earth, orbit: { ...earth.orbit, period: 1 } }] }))).toContain("orbit.period is not a field")
  })
  it("needs a unit system and a positive duration", () => {
    expect(fail(JSON.stringify({ bodies: [sun], duration: 1 }))).toContain("units must be one of")
    expect(fail(scene({ units: "cgs" }))).toContain("units must be one of")
    expect(fail(scene({ duration: 0 }))).toContain("duration must be a positive number")
  })
  it("lets G be set only in toy units, where it is a free parameter", () => {
    // In AU and years G follows from the units; a model writing it there has confused them.
    expect(fail(scene({ G: 1 }))).toContain('only be set with units "toy"')
    expect(parseGravity(JSON.stringify({ units: "toy", G: 0, bodies: [{ id: "A", mass: 1 }], duration: 1 })).ok).toBe(true)
    expect(fail(JSON.stringify({ units: "toy", G: -1, bodies: [{ id: "A", mass: 1 }], duration: 1 }))).toContain("G must be zero or a positive number")
  })
  it("resolves orbits only against bodies listed earlier", () => {
    expect(fail(scene({ bodies: [earth, sun] }))).toContain("must be a body listed before this one")
    expect(fail(scene({ bodies: [sun, { ...earth, orbit: { around: "Moon", distance: 1 } }] }))).toContain("refers to Moon")
  })
  it("refuses an orbit given alongside a position or velocity", () => {
    expect(fail(scene({ bodies: [sun, { ...earth, position: [1, 0] }] }))).toContain("give one or the other")
  })
  it("checks the orbit's numbers", () => {
    expect(fail(scene({ bodies: [sun, { ...earth, orbit: { around: "Sun", distance: 0 } }] }))).toContain("distance must be a positive number")
    expect(fail(scene({ bodies: [sun, { ...earth, orbit: { around: "Sun", distance: 1, eccentricity: 1 } }] }))).toContain("eccentricity must be from 0")
    expect(fail(scene({ bodies: [sun, { ...earth, orbit: { around: "Sun", distance: 1, direction: "left" } }] }))).toContain("direction must be ccw or cw")
  })
  it("checks each body's fields", () => {
    expect(fail(scene({ bodies: [{ id: "", mass: 1 }] }))).toContain("id must be a short name")
    expect(fail(scene({ bodies: [sun, { id: "Sun", mass: 1 }] }))).toContain("used twice")
    expect(fail(scene({ bodies: [{ id: "A", mass: -1 }] }))).toContain("mass must be zero or a positive number")
    expect(fail(scene({ bodies: [{ id: "A", mass: 1, position: [0] }] }))).toContain("position must be [x, y]")
    expect(fail(scene({ bodies: [{ id: "A", mass: 1, velocity: [0, "1"] }] }))).toContain("velocity must be [vx, vy]")
    expect(fail(scene({ bodies: [{ id: "A", mass: 1, radius: 0 }] }))).toContain("radius must be a positive number")
    expect(fail(scene({ bodies: [{ id: "A", mass: 1, color: "浅蓝" }] }))).toContain("color must be a hex colour")
    expect(fail(scene({ bodies: [{ id: "A", mass: 1, fixed: "yes" }] }))).toContain("fixed must be true or false")
  })
  it("requires a radius on every body when collisions are on", () => {
    expect(fail(scene({ collisions: "merge" }))).toContain('bodies[0] needs a radius when collisions are "merge"')
    expect(fail(scene({ collisions: "sticky" }))).toContain("collisions must be one of")
    expect(parseGravity(scene({ collisions: "bounce", bodies: [{ ...sun, radius: 0.1 }, { ...earth, radius: 0.01 }] })).ok).toBe(true)
  })
  it("limits the body count, the source size, and the JSON shape", () => {
    expect(fail(scene({ bodies: [] }))).toContain("bodies must be a non-empty array")
    expect(fail(scene({ bodies: [sun, { id: "B", mass: 1 }, { id: "C", mass: 1 }] }), { maxBodies: 2 })).toContain("more than 2")
    expect(parseGravity(scene(), { maxSourceBytes: 10 })).toMatchObject({ ok: false, error: { code: "too-large" } })
    expect(parseGravity("nope")).toMatchObject({ ok: false, error: { code: "invalid-json" } })
    expect(fail("[]")).toContain("must be a JSON object")
  })
  it("lets the host switch animation off for every scene", () => {
    const result = parseGravity(scene({ animate: true }), { animate: false })
    expect(result.ok && result.value.definition.animate).toBe(false)
    const off = parseGravity(scene({ animate: false }))
    expect(off.ok && off.value.definition.animate).toBe(false)
  })
})
