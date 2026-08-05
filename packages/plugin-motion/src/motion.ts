/**
 * The mechanics the model is not asked to do.
 *
 * Range, flight time, the height a projectile reaches, the speed a car stops from, the velocities
 * two bodies leave a collision with — every one follows from the initial conditions by a formula,
 * and every one is something a model states wrongly often enough to matter. Computed here, its
 * arithmetic cannot reach the figure.
 *
 * These are closed forms, not a simulation. A textbook problem is idealised — no drag, no rolling
 * resistance, a perfectly elastic collision — and a stepping engine would answer a slightly
 * different question, drifting in energy and jittering at rest, which is exactly the kind of
 * plausible wrongness a student cannot see.
 */

/** Standard gravity, the value every school problem is set with. */
export const G = 9.8

export type MotionKind = "projectile" | "free-fall" | "uniform-acceleration" | "shm" | "circular" | "collision"

export interface Body {
  mass: number
  speed: number
}

export interface MotionDefinition {
  motion: MotionKind
  speed?: number
  angle?: number
  height?: number
  acceleration?: number
  duration?: number
  amplitude?: number
  period?: number
  radius?: number
  bodies?: [Body, Body]
  kind?: "elastic" | "inelastic"
  strobe?: number
  show?: Array<"trajectory" | "strobe" | "vectors">
  caption?: string
}

export interface Sample {
  t: number
  x: number
  y: number
  vx: number
  vy: number
}

/** What the figure is about, worked out from the conditions. */
export interface MotionResult {
  /** How long the figure covers. */
  duration: number
  samples: (t: number) => Sample
  /** Named quantities, in the order they should be read. */
  quantities: Array<{ key: string; value: number; unit: string }>
  /** For a collision: the velocities afterwards. */
  after?: [number, number]
}

const zero = (t: number): Sample => ({ t, x: 0, y: 0, vx: 0, vy: 0 })

/**
 * Solve the motion.
 *
 * A projectile launched from a height does not land at `v²sin2θ/g`; that formula assumes it returns
 * to the height it left. The flight time comes from the quadratic instead, which is the difference
 * between a figure that ends at the ground and one that ends in mid-air.
 */
export function solve(definition: MotionDefinition): MotionResult {
  switch (definition.motion) {
    case "projectile": {
      const speed = definition.speed ?? 0
      const angle = ((definition.angle ?? 0) * Math.PI) / 180
      const y0 = definition.height ?? 0
      const vx = speed * Math.cos(angle)
      const vy = speed * Math.sin(angle)
      // y0 + vy·t − ½g·t² = 0
      const duration = (vy + Math.sqrt(vy * vy + 2 * G * y0)) / G
      const apex = y0 + (vy * vy) / (2 * G)
      return {
        duration,
        samples: (t) => ({ t, x: vx * t, y: y0 + vy * t - 0.5 * G * t * t, vx, vy: vy - G * t }),
        quantities: [
          { key: "range", value: vx * duration, unit: "m" },
          { key: "apex", value: apex, unit: "m" },
          { key: "flightTime", value: duration, unit: "s" },
        ],
      }
    }
    case "free-fall": {
      const y0 = definition.height ?? 0
      const duration = Math.sqrt((2 * y0) / G)
      return {
        duration,
        samples: (t) => ({ t, x: 0, y: y0 - 0.5 * G * t * t, vx: 0, vy: -G * t }),
        quantities: [
          { key: "fallTime", value: duration, unit: "s" },
          { key: "impactSpeed", value: G * duration, unit: "m/s" },
        ],
      }
    }
    case "uniform-acceleration": {
      const v0 = definition.speed ?? 0
      const a = definition.acceleration ?? 0
      // A body that decelerates to rest does not then reverse: the figure stops when it stops.
      const toRest = a < 0 && v0 > 0 ? -v0 / a : Number.POSITIVE_INFINITY
      const duration = Math.min(definition.duration ?? 0, toRest)
      const displacement = v0 * duration + 0.5 * a * duration * duration
      return {
        duration,
        samples: (t) => ({ t, x: v0 * t + 0.5 * a * t * t, y: 0, vx: v0 + a * t, vy: 0 }),
        quantities: [
          { key: "displacement", value: displacement, unit: "m" },
          { key: "finalSpeed", value: v0 + a * duration, unit: "m/s" },
          { key: "elapsed", value: duration, unit: "s" },
        ],
      }
    }
    case "shm": {
      const amplitude = definition.amplitude ?? 0
      const period = definition.period ?? 1
      const omega = (2 * Math.PI) / period
      return {
        duration: period,
        samples: (t) => ({ t, x: t, y: amplitude * Math.cos(omega * t), vx: 1, vy: -amplitude * omega * Math.sin(omega * t) }),
        quantities: [
          { key: "frequency", value: 1 / period, unit: "Hz" },
          { key: "maxSpeed", value: amplitude * omega, unit: "m/s" },
          { key: "maxAcceleration", value: amplitude * omega * omega, unit: "m/s²" },
        ],
      }
    }
    case "circular": {
      const radius = definition.radius ?? 1
      const period = definition.period ?? 1
      const omega = (2 * Math.PI) / period
      const speed = omega * radius
      return {
        duration: period,
        samples: (t) => ({
          t,
          x: radius * Math.cos(omega * t),
          y: radius * Math.sin(omega * t),
          vx: -speed * Math.sin(omega * t),
          vy: speed * Math.cos(omega * t),
        }),
        quantities: [
          { key: "speed", value: speed, unit: "m/s" },
          { key: "angularSpeed", value: omega, unit: "rad/s" },
          { key: "centripetal", value: (speed * speed) / radius, unit: "m/s²" },
        ],
      }
    }
    case "collision": {
      const [a, b] = definition.bodies ?? [{ mass: 1, speed: 0 }, { mass: 1, speed: 0 }]
      const total = a.mass + b.mass
      const after: [number, number] = definition.kind === "inelastic"
        ? [(a.mass * a.speed + b.mass * b.speed) / total, (a.mass * a.speed + b.mass * b.speed) / total]
        : [
          ((a.mass - b.mass) * a.speed + 2 * b.mass * b.speed) / total,
          ((b.mass - a.mass) * b.speed + 2 * a.mass * a.speed) / total,
        ]
      const before = 0.5 * a.mass * a.speed ** 2 + 0.5 * b.mass * b.speed ** 2
      const afterEnergy = 0.5 * a.mass * after[0] ** 2 + 0.5 * b.mass * after[1] ** 2
      return {
        duration: 1,
        samples: zero,
        after,
        quantities: [
          { key: "momentum", value: a.mass * a.speed + b.mass * b.speed, unit: "kg·m/s" },
          { key: "energyBefore", value: before, unit: "J" },
          { key: "energyAfter", value: afterEnergy, unit: "J" },
        ],
      }
    }
  }
}

/**
 * The instants a stroboscopic figure marks.
 *
 * Equal intervals are the whole point: under gravity the spacing grows, under braking it shrinks,
 * and that unevenness is the thing the figure teaches. Choosing the interval for the model when it
 * does not give one keeps a figure from being either a smear or three dots.
 */
export function strobeTimes(duration: number, interval?: number): number[] {
  const step = interval && interval > 0 ? interval : niceStep(duration)
  const times: number[] = []
  for (let t = 0; t <= duration + 1e-9; t += step) times.push(Math.min(t, duration))
  if (times.length > 0 && Math.abs(times[times.length - 1] - duration) > 1e-9) times.push(duration)
  return times
}

function niceStep(duration: number): number {
  const target = duration / 8
  const magnitude = Math.pow(10, Math.floor(Math.log10(target)))
  return [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= target) ?? magnitude * 10
}
