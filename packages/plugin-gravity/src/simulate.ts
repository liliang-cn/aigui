import type { BodyDefinition, BodyState, CollisionEvent, GravityDefinition, GravityResult, Sample, Simulation, Vec2 } from "./types"
import { gravitationalConstant } from "./units"

const DEG = Math.PI / 180

const bad = (message: string): GravityResult<never> => ({ ok: false, error: { code: "invalid-definition", message } })

/**
 * Turn the definitions into starting states, computing what an `orbit` asks for.
 *
 * A body on an orbit starts at periapsis with the vis-viva speed for that eccentricity,
 * √(μ(1+e)/r_p), relative to the body it circles — so a moon around a planet around a star
 * works by resolving each body against the one before it. This is the arithmetic the protocol
 * takes out of the model's hands: it names the condition, the number follows.
 */
export function resolveInitial(definition: GravityDefinition): GravityResult<BodyState[]> {
  const G = gravitationalConstant(definition)
  const states: BodyState[] = []
  for (const body of definition.bodies) {
    let position: Vec2 = body.position ?? [0, 0]
    let velocity: Vec2 = body.velocity ?? [0, 0]
    let orbit: BodyState["orbit"]
    if (body.orbit) {
      const central = states.find((state) => state.id === body.orbit?.around)
      if (!central) return bad(`${body.id} orbits ${body.orbit.around}, which must be defined before it`)
      const e = body.orbit.eccentricity ?? 0
      const angle = (body.orbit.angle ?? 0) * DEG
      const direction = body.orbit.direction === "cw" ? -1 : 1
      const periapsis = body.orbit.distance
      const mu = G * (central.mass + body.mass)
      if (!(mu > 0)) return bad(`${body.id} cannot orbit ${central.id}: there is no mass, or no gravity, to hold it`)
      const speed = Math.sqrt((mu * (1 + e)) / periapsis)
      const semiMajor = periapsis / (1 - e)
      const period = 2 * Math.PI * Math.sqrt((semiMajor * semiMajor * semiMajor) / mu)
      position = [central.position[0] + periapsis * Math.cos(angle), central.position[1] + periapsis * Math.sin(angle)]
      velocity = [central.velocity[0] - direction * speed * Math.sin(angle), central.velocity[1] + direction * speed * Math.cos(angle)]
      orbit = { speed, period, around: central.id }
    }
    states.push({
      id: body.id,
      mass: body.mass,
      position,
      velocity: body.fixed ? [0, 0] : velocity,
      radius: body.radius,
      color: body.color,
      fixed: body.fixed === true,
      alive: true,
      orbit,
    })
  }
  return { ok: true, value: states }
}

const distance = (a: Vec2, b: Vec2): number => Math.hypot(b[0] - a[0], b[1] - a[1])

/** A body's mass for the purpose of an impulse: a massless disc still bounces like something. */
const inverseMass = (body: BodyState): number => (body.fixed ? 0 : 1 / (body.mass > 0 ? body.mass : 1))

function accelerations(bodies: BodyState[], G: number): Vec2[] {
  const acc: Vec2[] = bodies.map(() => [0, 0])
  if (G === 0) return acc
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i]
    if (!a.alive) continue
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j]
      if (!b.alive) continue
      const dx = b.position[0] - a.position[0]
      const dy = b.position[1] - a.position[1]
      const r2 = dx * dx + dy * dy
      if (r2 === 0) continue
      const inv = 1 / (r2 * Math.sqrt(r2))
      // Each pulls the other in proportion to the *other's* mass; a test particle pulls nothing.
      if (!a.fixed && b.mass > 0) {
        acc[i][0] += G * b.mass * dx * inv
        acc[i][1] += G * b.mass * dy * inv
      }
      if (!b.fixed && a.mass > 0) {
        acc[j][0] -= G * a.mass * dx * inv
        acc[j][1] -= G * a.mass * dy * inv
      }
    }
  }
  return acc
}

export function totalEnergy(bodies: BodyState[], G: number): number {
  let energy = 0
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i]
    if (!a.alive) continue
    if (!a.fixed) energy += 0.5 * a.mass * (a.velocity[0] ** 2 + a.velocity[1] ** 2)
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j]
      if (!b.alive) continue
      const r = distance(a.position, b.position)
      if (r > 0) energy -= (G * a.mass * b.mass) / r
    }
  }
  return energy
}

/**
 * How big a step the current configuration allows.
 *
 * A fraction of the shortest dynamical time √(r³/μ) over all pairs — about 400 steps per
 * circular orbit, finer as a body dives towards periapsis — and, when bodies can touch, small
 * enough that none crosses more than a fraction of a radius per step, so a fast disc cannot
 * tunnel through another.
 */
function stepSize(bodies: BodyState[], G: number, remaining: number, ceiling: number, collide: boolean): number {
  let dt = Math.min(ceiling, remaining)
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i]
    if (!a.alive) continue
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j]
      if (!b.alive) continue
      const r = distance(a.position, b.position)
      const mu = G * (a.mass + b.mass)
      if (mu > 0 && r > 0) dt = Math.min(dt, Math.sqrt((r * r * r) / mu) / 64)
      if (collide && a.radius && b.radius) {
        const relative = Math.hypot(b.velocity[0] - a.velocity[0], b.velocity[1] - a.velocity[1])
        if (relative > 0) dt = Math.min(dt, (a.radius + b.radius) / 4 / relative)
      }
    }
  }
  return dt
}

function resolveCollisions(bodies: BodyState[], definition: GravityDefinition, time: number, events: CollisionEvent[]): boolean {
  if (definition.collisions === "none") return false
  let changed = false
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i]
    if (!a.alive || !a.radius) continue
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j]
      if (!b.alive || !b.radius) continue
      const r = distance(a.position, b.position)
      if (r >= a.radius + b.radius) continue
      if (definition.collisions === "merge") {
        const survivor = a.mass >= b.mass ? a : b
        const other = survivor === a ? b : a
        const total = a.mass + b.mass
        const weightA = total > 0 ? a.mass / total : 0.5
        const weightB = total > 0 ? b.mass / total : 0.5
        survivor.position = [a.position[0] * weightA + b.position[0] * weightB, a.position[1] * weightA + b.position[1] * weightB]
        survivor.velocity = [a.velocity[0] * weightA + b.velocity[0] * weightB, a.velocity[1] * weightA + b.velocity[1] * weightB]
        survivor.mass = total
        survivor.radius = Math.cbrt(a.radius ** 3 + b.radius ** 3)
        survivor.fixed = a.fixed || b.fixed
        if (survivor.fixed) survivor.velocity = [0, 0]
        other.alive = false
        events.push({ time, a: a.id, b: b.id, rule: "merge", into: survivor.id })
        changed = true
        continue
      }
      // Bounce: an elastic impulse along the line of centres, only if they are still closing.
      const nx = r > 0 ? (b.position[0] - a.position[0]) / r : 1
      const ny = r > 0 ? (b.position[1] - a.position[1]) / r : 0
      const closing = (b.velocity[0] - a.velocity[0]) * nx + (b.velocity[1] - a.velocity[1]) * ny
      const invA = inverseMass(a)
      const invB = inverseMass(b)
      if (invA + invB === 0) continue
      if (closing < 0) {
        const impulse = (-2 * closing) / (invA + invB)
        if (!a.fixed) a.velocity = [a.velocity[0] - impulse * invA * nx, a.velocity[1] - impulse * invA * ny]
        if (!b.fixed) b.velocity = [b.velocity[0] + impulse * invB * nx, b.velocity[1] + impulse * invB * ny]
        events.push({ time, a: a.id, b: b.id, rule: "bounce" })
        changed = true
      }
      // Separate the overlap so the same contact is not found again next step.
      const overlap = a.radius + b.radius - r
      if (overlap > 0) {
        const share = overlap / (invA + invB)
        if (!a.fixed) a.position = [a.position[0] - nx * share * invA, a.position[1] - ny * share * invA]
        if (!b.fixed) b.position = [b.position[0] + nx * share * invB, b.position[1] + ny * share * invB]
      }
    }
  }
  return changed
}

const clone = (state: BodyState): BodyState => ({ ...state, position: [...state.position], velocity: [...state.velocity] })

/**
 * Integrate the scene with kick-drift-kick leapfrog.
 *
 * Leapfrog is symplectic: its energy error oscillates instead of accumulating, so a planet drawn
 * for fifty orbits is still on its orbit — the one property a picture of gravity cannot do
 * without. The step adapts to the closest pair, and a cap on the total ends a run that would
 * otherwise take forever (two point masses falling into each other, say) and says so.
 */
export function simulate(definition: GravityDefinition, initial: BodyState[], options: { maxSteps?: number; samples?: number } = {}): Simulation {
  const G = gravitationalConstant(definition)
  const maxSteps = options.maxSteps ?? 200_000
  const sampleCount = options.samples ?? 600
  const bodies = initial.map(clone)
  const collide = definition.collisions !== "none"
  const ceiling = definition.duration / 2000
  const samples: Sample[] = []
  const events: CollisionEvent[] = []
  let time = 0
  let steps = 0
  let truncated = false
  const record = () => samples.push({ time, positions: bodies.map((body) => (body.alive ? [body.position[0], body.position[1]] : null)) })
  record()
  const sampleEvery = definition.duration / sampleCount
  let nextSample = sampleEvery
  const energyInitial = totalEnergy(bodies, G)

  let acc = accelerations(bodies, G)
  while (time < definition.duration) {
    if (steps >= maxSteps) {
      truncated = true
      break
    }
    const dt = stepSize(bodies, G, definition.duration - time, ceiling, collide)
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i]
      if (!body.alive || body.fixed) continue
      body.velocity = [body.velocity[0] + acc[i][0] * dt * 0.5, body.velocity[1] + acc[i][1] * dt * 0.5]
      body.position = [body.position[0] + body.velocity[0] * dt, body.position[1] + body.velocity[1] * dt]
    }
    time += dt
    resolveCollisions(bodies, definition, time, events)
    acc = accelerations(bodies, G)
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i]
      if (!body.alive || body.fixed) continue
      body.velocity = [body.velocity[0] + acc[i][0] * dt * 0.5, body.velocity[1] + acc[i][1] * dt * 0.5]
    }
    steps++
    while (time >= nextSample - 1e-12 && samples.length <= sampleCount) {
      record()
      nextSample += sampleEvery
    }
  }
  if (samples[samples.length - 1].time < time) record()

  const energyFinal = totalEnergy(bodies, G)
  const drift = energyInitial !== 0 ? Math.abs(energyFinal - energyInitial) / Math.abs(energyInitial) : Math.abs(energyFinal)
  return { initial: initial.map(clone), final: bodies, samples, events, energy: { initial: energyInitial, final: energyFinal, drift }, truncated, steps }
}

/** Convenience for tests and hosts: a body's definition with the fields the integrator reads. */
export type { BodyDefinition }
