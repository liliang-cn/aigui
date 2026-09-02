import { describe, expect, it } from "vitest"
import { parseGravity } from "./parse"
import { resolveInitial, simulate, totalEnergy } from "./simulate"
import type { GravityDefinition } from "./types"
import { UNITS } from "./units"

const scene = (partial: Partial<GravityDefinition>): GravityDefinition => ({
  units: "astronomical",
  bodies: [],
  duration: 1,
  collisions: "none",
  trails: true,
  animate: false,
  ...partial,
})

const run = (partial: Partial<GravityDefinition>) => {
  const definition = scene(partial)
  const initial = resolveInitial(definition)
  if (!initial.ok) throw new Error(initial.error.message)
  return { definition, initial: initial.value, simulation: simulate(definition, initial.value) }
}

const sun = { id: "Sun", mass: 1 }
const earth = { id: "Earth", mass: 3e-6, orbit: { around: "Sun", distance: 1 } }

describe("resolveInitial", () => {
  it("gives Earth at 1 AU the speed 2π AU/yr and a one-year period, from the condition alone", () => {
    const { initial } = run({ bodies: [sun, earth] })
    expect(initial[1].orbit?.speed).toBeCloseTo(2 * Math.PI, 4)
    expect(initial[1].orbit?.period).toBeCloseTo(1, 4)
    expect(initial[1].velocity[1]).toBeCloseTo(2 * Math.PI, 4)
  })
  it("obeys Kepler's third law: 4 AU takes 8 years", () => {
    const { initial } = run({ bodies: [sun, { id: "Far", mass: 0, orbit: { around: "Sun", distance: 4 } }] })
    expect(initial[1].orbit?.period).toBeCloseTo(8, 3)
  })
  it("starts an eccentric orbit at periapsis with the vis-viva speed", () => {
    const { initial } = run({ bodies: [sun, { id: "Comet", mass: 0, orbit: { around: "Sun", distance: 1, eccentricity: 0.5 } }] })
    expect(initial[1].orbit?.speed).toBeCloseTo(Math.sqrt((UNITS.astronomical.G * 1.5) / 1), 6)
    // a = r_p / (1 - e) = 2 AU, so T = 2^1.5 years.
    expect(initial[1].orbit?.period).toBeCloseTo(Math.pow(2, 1.5), 4)
  })
  it("places a moon relative to its planet, which is itself in orbit", () => {
    const { initial } = run({ bodies: [sun, earth, { id: "Moon", mass: 0, orbit: { around: "Earth", distance: 0.00257 } }] })
    const [, e, m] = initial
    expect(Math.hypot(m.position[0] - e.position[0], m.position[1] - e.position[1])).toBeCloseTo(0.00257, 8)
    // Its velocity carries the Earth's along.
    expect(m.velocity[1]).toBeGreaterThan(e.velocity[1] * 0.9)
  })
  it("refuses an orbit around something with no mass to hold it", () => {
    const result = resolveInitial(scene({ bodies: [{ id: "Ghost", mass: 0 }, { id: "P", mass: 0, orbit: { around: "Ghost", distance: 1 } }] }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain("no mass")
  })
  it("turns a clockwise orbit the other way", () => {
    const { initial } = run({ bodies: [sun, { ...earth, orbit: { ...earth.orbit, direction: "cw" } }] })
    expect(initial[1].velocity[1]).toBeCloseTo(-2 * Math.PI, 4)
  })
})

describe("simulate", () => {
  it("brings Earth back to where it started after one year", () => {
    const { simulation } = run({ bodies: [sun, earth], duration: 1 })
    const last = simulation.samples[simulation.samples.length - 1].positions[1]!
    expect(last[0]).toBeCloseTo(1, 2)
    expect(Math.abs(last[1])).toBeLessThan(0.01)
    expect(simulation.truncated).toBe(false)
  })
  it("keeps energy to a few parts per million over twenty orbits", () => {
    // The property a picture of gravity cannot do without: a symplectic step does not spiral.
    const { simulation } = run({ bodies: [sun, earth], duration: 20 })
    expect(simulation.energy.drift).toBeLessThan(1e-5)
    const last = simulation.samples[simulation.samples.length - 1].positions[1]!
    expect(Math.hypot(last[0], last[1])).toBeCloseTo(1, 2)
  })
  it("reaches apoapsis at r_p(1+e)/(1−e) on an eccentric orbit", () => {
    const { simulation } = run({ bodies: [sun, { id: "Comet", mass: 0, orbit: { around: "Sun", distance: 1, eccentricity: 0.5 } }], duration: Math.pow(2, 1.5) })
    const farthest = Math.max(...simulation.samples.map((s) => Math.hypot(s.positions[1]![0], s.positions[1]![1])))
    expect(farthest).toBeCloseTo(3, 2)
  })
  it("lets a test particle feel the star without moving it", () => {
    // A quarter of the 0.164-year orbit at 0.3 AU: the dust has swung round, the Sun has not.
    const { simulation } = run({ bodies: [sun, { id: "Dust", mass: 0, orbit: { around: "Sun", distance: 0.3 } }], duration: 0.04 })
    expect(simulation.final[0].position).toEqual([0, 0])
    expect(simulation.final[1].position[1]).toBeGreaterThan(0.2)
  })
  it("runs a circular binary in toy units for a full period", () => {
    // Two unit masses 2 apart: each needs v = √(G·m/(4r)) = 0.5 for a circle, period 4π.
    const { simulation } = run({
      units: "toy",
      bodies: [
        { id: "A", mass: 1, position: [-1, 0], velocity: [0, -0.5] },
        { id: "B", mass: 1, position: [1, 0], velocity: [0, 0.5] },
      ],
      duration: 4 * Math.PI,
    })
    const last = simulation.samples[simulation.samples.length - 1]
    expect(last.positions[0]![0]).toBeCloseTo(-1, 2)
    expect(last.positions[1]![0]).toBeCloseTo(1, 2)
    expect(simulation.energy.drift).toBeLessThan(1e-5)
  })
  it("moves in straight lines with G = 0", () => {
    const { simulation } = run({ units: "toy", G: 0, bodies: [{ id: "A", mass: 1, position: [0, 0], velocity: [1, 2] }], duration: 3 })
    expect(simulation.final[0].position[0]).toBeCloseTo(3, 9)
    expect(simulation.final[0].position[1]).toBeCloseTo(6, 9)
  })
  it("stops at the step cap and says so rather than running forever", () => {
    const definition = scene({ units: "toy", bodies: [{ id: "A", mass: 1 }, { id: "B", mass: 1, position: [0.001, 0] }], duration: 100 })
    const initial = resolveInitial(definition)
    if (!initial.ok) throw new Error(initial.error.message)
    const simulation = simulate(definition, initial.value, { maxSteps: 500 })
    expect(simulation.truncated).toBe(true)
    expect(simulation.steps).toBe(500)
  })
})

describe("collisions", () => {
  it("merges two bodies, conserving mass and momentum", () => {
    const { simulation } = run({
      units: "toy",
      G: 0,
      collisions: "merge",
      bodies: [
        { id: "Big", mass: 3, radius: 0.5, position: [-2, 0], velocity: [1, 0] },
        { id: "Small", mass: 1, radius: 0.5, position: [2, 0], velocity: [-1, 0.4] },
      ],
      duration: 4,
    })
    expect(simulation.events).toHaveLength(1)
    expect(simulation.events[0]).toMatchObject({ rule: "merge", into: "Big" })
    const survivor = simulation.final.find((b) => b.alive)!
    expect(simulation.final.filter((b) => b.alive)).toHaveLength(1)
    expect(survivor.mass).toBe(4)
    // p = 3·(1,0) + 1·(−1,0.4) = (2, 0.4), so v = (0.5, 0.1).
    expect(survivor.velocity[0]).toBeCloseTo(0.5, 9)
    expect(survivor.velocity[1]).toBeCloseTo(0.1, 9)
    // The merged body's trail sample is null from then on.
    expect(simulation.samples[simulation.samples.length - 1].positions[1]).toBeNull()
  })
  it("bounces equal discs head-on so the mover stops and the other carries its speed", () => {
    const { simulation } = run({
      units: "toy",
      G: 0,
      collisions: "bounce",
      bodies: [
        { id: "A", mass: 1, radius: 0.5, position: [-3, 0], velocity: [2, 0] },
        { id: "B", mass: 1, radius: 0.5, position: [0, 0] },
      ],
      duration: 3,
    })
    expect(simulation.events.map((e) => e.rule)).toEqual(["bounce"])
    expect(simulation.final[0].velocity[0]).toBeCloseTo(0, 6)
    expect(simulation.final[1].velocity[0]).toBeCloseTo(2, 6)
  })
  it("conserves momentum and kinetic energy in an oblique bounce", () => {
    const { definition, initial, simulation } = run({
      units: "toy",
      G: 0,
      collisions: "bounce",
      bodies: [
        { id: "A", mass: 2, radius: 0.5, position: [-4, 0.3], velocity: [2, 0] },
        { id: "B", mass: 1, radius: 0.5, position: [0, 0] },
      ],
      duration: 5,
    })
    expect(simulation.events).toHaveLength(1)
    const momentum = (bodies: typeof initial) => bodies.reduce((p, b) => [p[0] + b.mass * b.velocity[0], p[1] + b.mass * b.velocity[1]], [0, 0])
    expect(momentum(simulation.final)[0]).toBeCloseTo(momentum(initial)[0], 9)
    expect(momentum(simulation.final)[1]).toBeCloseTo(momentum(initial)[1], 9)
    expect(totalEnergy(simulation.final, 0)).toBeCloseTo(totalEnergy(initial, 0), 9)
    // An oblique hit sends B off the line of A's approach.
    expect(Math.abs(simulation.final[1].velocity[1])).toBeGreaterThan(0.1)
    expect(definition.collisions).toBe("bounce")
  })
  it("bounces off a fixed body without moving it", () => {
    const { simulation } = run({
      units: "toy",
      G: 0,
      collisions: "bounce",
      bodies: [
        { id: "Wall", mass: 1, radius: 1, fixed: true },
        { id: "Ball", mass: 1, radius: 0.2, position: [-3, 0], velocity: [1, 0] },
      ],
      duration: 4,
    })
    expect(simulation.final[0].position).toEqual([0, 0])
    expect(simulation.final[1].velocity[0]).toBeCloseTo(-1, 6)
  })
  it("does not let a fast disc tunnel through a small one", () => {
    const { simulation } = run({
      units: "toy",
      G: 0,
      collisions: "bounce",
      bodies: [
        { id: "Bullet", mass: 1, radius: 0.05, position: [-5, 0], velocity: [50, 0] },
        { id: "Target", mass: 1, radius: 0.05, position: [0, 0] },
      ],
      duration: 0.5,
    })
    expect(simulation.events).toHaveLength(1)
  })
})

describe("parse + simulate together", () => {
  it("runs the prompt's comet example without truncating", () => {
    const parsed = parseGravity(JSON.stringify({
      units: "astronomical",
      bodies: [{ id: "Sun", mass: 1 }, { id: "Comet", mass: 0, orbit: { around: "Sun", distance: 0.6, eccentricity: 0.9 } }],
      duration: 25,
    }))
    if (!parsed.ok) throw new Error(parsed.error.message)
    const simulation = simulate(parsed.value.definition, parsed.value.initial)
    expect(simulation.truncated).toBe(false)
    expect(simulation.energy.drift).toBeLessThan(1e-4)
  })
})
