import { describe, expect, it } from "vitest"
import { G, solve, strobeTimes } from "./motion"

const value = (definition: Parameters<typeof solve>[0], key: string): number =>
  solve(definition).quantities.find((q) => q.key === key)!.value

describe("projectile", () => {
  it("matches the textbook range for a launch and landing at the same height", () => {
    // R = v²sin(2θ)/g = 400·sin60°/9.8 ≈ 35.35 m
    expect(value({ motion: "projectile", speed: 20, angle: 30 }, "range")).toBeCloseTo((400 * Math.sin(Math.PI / 3)) / G, 4)
  })
  it("puts the maximum range at 45 degrees", () => {
    const at = (angle: number) => value({ motion: "projectile", speed: 25, angle }, "range")
    expect(at(45)).toBeGreaterThan(at(40))
    expect(at(45)).toBeGreaterThan(at(50))
  })
  it("does not use that formula when the launch is above the ground", () => {
    // Thrown horizontally from 20 m at 15 m/s: it falls for sqrt(2·20/9.8) ≈ 2.02 s and travels
    // about 30.3 m. The same-height formula would give a range of zero.
    const result = solve({ motion: "projectile", speed: 15, angle: 0, height: 20 })
    expect(result.duration).toBeCloseTo(Math.sqrt((2 * 20) / G), 4)
    expect(value({ motion: "projectile", speed: 15, angle: 0, height: 20 }, "range")).toBeCloseTo(15 * Math.sqrt((2 * 20) / G), 3)
  })
  it("handles a vertical launch, where the range is zero", () => {
    expect(value({ motion: "projectile", speed: 30, angle: 90 }, "range")).toBeCloseTo(0, 6)
    expect(value({ motion: "projectile", speed: 30, angle: 90 }, "apex")).toBeCloseTo((30 * 30) / (2 * G), 4)
  })
  it("comes back to the ground at the end of its flight", () => {
    const result = solve({ motion: "projectile", speed: 20, angle: 30 })
    expect(result.samples(result.duration).y).toBeCloseTo(0, 6)
  })
})

describe("free fall", () => {
  it("takes 3 s to fall 45 m and lands at about 29 m/s", () => {
    expect(value({ motion: "free-fall", height: 45 }, "fallTime")).toBeCloseTo(Math.sqrt(90 / G), 4)
    expect(value({ motion: "free-fall", height: 45 }, "impactSpeed")).toBeCloseTo(Math.sqrt(2 * G * 45), 4)
  })
})

describe("uniform acceleration", () => {
  it("gives the textbook displacement", () => {
    // s = 10·8 + ½·2·64 = 144 m
    expect(value({ motion: "uniform-acceleration", speed: 10, acceleration: 2, duration: 8 }, "displacement")).toBeCloseTo(144)
  })
  it("stops when the body stops, rather than reversing", () => {
    // 20 m/s braking at 4 m/s² is at rest after 5 s; a longer duration must not run it backwards.
    const result = solve({ motion: "uniform-acceleration", speed: 20, acceleration: -4, duration: 12 })
    expect(result.duration).toBeCloseTo(5)
    expect(value({ motion: "uniform-acceleration", speed: 20, acceleration: -4, duration: 12 }, "finalSpeed")).toBeCloseTo(0, 6)
    expect(value({ motion: "uniform-acceleration", speed: 20, acceleration: -4, duration: 12 }, "displacement")).toBeCloseTo(50)
  })
})

describe("periodic motion", () => {
  it("reads frequency and maxima from amplitude and period", () => {
    expect(value({ motion: "shm", amplitude: 0.1, period: 2 }, "frequency")).toBeCloseTo(0.5)
    expect(value({ motion: "shm", amplitude: 0.1, period: 2 }, "maxSpeed")).toBeCloseTo(0.1 * Math.PI, 5)
  })
  it("gives circular motion its speed and centripetal acceleration", () => {
    expect(value({ motion: "circular", radius: 2, period: 4 }, "speed")).toBeCloseTo(Math.PI, 5)
    expect(value({ motion: "circular", radius: 2, period: 4 }, "centripetal")).toBeCloseTo((Math.PI * Math.PI) / 2, 5)
  })
})

describe("collision", () => {
  it("solves an elastic collision from both conservation laws", () => {
    // 2 kg at 3 m/s into 1 kg at −1 m/s: v1' = 1/3, v2' = 13/3.
    const result = solve({ motion: "collision", kind: "elastic", bodies: [{ mass: 2, speed: 3 }, { mass: 1, speed: -1 }] })
    expect(result.after![0]).toBeCloseTo(1 / 3, 6)
    expect(result.after![1]).toBeCloseTo(13 / 3, 6)
    const [before, after] = [result.quantities[1].value, result.quantities[2].value]
    expect(after).toBeCloseTo(before, 6)
  })
  it("swaps the velocities of equal masses", () => {
    const result = solve({ motion: "collision", kind: "elastic", bodies: [{ mass: 1, speed: 2 }, { mass: 1, speed: -2 }] })
    expect(result.after![0]).toBeCloseTo(-2)
    expect(result.after![1]).toBeCloseTo(2)
  })
  it("gives both bodies one velocity when they stick, and loses energy", () => {
    // 3 kg at 4 m/s into a stationary 2 kg: together at 2.4 m/s.
    const result = solve({ motion: "collision", kind: "inelastic", bodies: [{ mass: 3, speed: 4 }, { mass: 2, speed: 0 }] })
    expect(result.after![0]).toBeCloseTo(2.4)
    expect(result.after![1]).toBeCloseTo(2.4)
    expect(result.quantities[2].value).toBeLessThan(result.quantities[1].value)
  })
  it("conserves momentum either way", () => {
    for (const kind of ["elastic", "inelastic"] as const) {
      const bodies = [{ mass: 3, speed: 4 }, { mass: 2, speed: -1 }] as [{ mass: number; speed: number }, { mass: number; speed: number }]
      const result = solve({ motion: "collision", kind, bodies })
      const after = bodies[0].mass * result.after![0] + bodies[1].mass * result.after![1]
      expect(after, kind).toBeCloseTo(result.quantities[0].value, 6)
    }
  })
})

describe("strobeTimes", () => {
  it("starts at zero, ends at the end, and steps evenly", () => {
    const times = strobeTimes(2, 0.5)
    expect(times[0]).toBe(0)
    expect(times.at(-1)).toBeCloseTo(2)
    expect(times[1] - times[0]).toBeCloseTo(0.5)
  })
  it("chooses a readable interval when none is given", () => {
    const times = strobeTimes(2.04)
    expect(times.length).toBeGreaterThan(4)
    expect(times.length).toBeLessThan(14)
  })
})
