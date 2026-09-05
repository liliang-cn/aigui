import type { LayoutLink, LayoutNode } from "./ontology"

/**
 * A spring–electrical layout in two or three dimensions.
 *
 * Fruchterman–Reingold's forces: every pair of nodes pushes apart with `k²/d`, every edge pulls
 * its ends together with `d²/k`, a weak spring holds the whole graph to the origin, and a falling
 * temperature caps how far a node may move in one step so the graph cools into a shape instead
 * of oscillating around one. The same code runs the 2D figure and the 3D model; in two dimensions
 * the third coordinate is seeded at zero and no force ever moves it.
 *
 * Deterministic on purpose: the starting positions are a hash of the node ids on a circle or a
 * sphere, so the same knowledge graph draws the same picture twice running and a snapshot test
 * means something. Nothing here calls `Math.random`.
 *
 * O(n²) per step, which is why `layoutSteps` spends fewer steps on a bigger graph.
 */

/** The distance an edge settles at: the unit everything else here is measured in. */
export const LAYOUT_SPRING = 1

/** The pull to the origin, per unit of distance from it. Without it two components drift apart forever. */
export const LAYOUT_GRAVITY = 0.08

/** How far a node may move in the first step, as a fraction of the graph's own radius. */
const HEAT = 0.12

/** Below this the repulsion between two nodes in the same place would be infinite. */
const MIN_DISTANCE = 1e-3

const FNV_OFFSET = 2166136261
const FNV_PRIME = 16777619

/** FNV-1a: the one hash in this package. It decides a class's colour and where a node starts. */
export function hash(value: string): number {
  let h = FNV_OFFSET
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, FNV_PRIME)
  }
  return h >>> 0
}

/**
 * How many steps a graph of `n` nodes is given: 300 at fifty, 120 at five hundred, 40 at two
 * thousand, interpolated on a log scale between and flat outside.
 */
const STEP_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [50, 300],
  [500, 120],
  [2000, 40],
]

export function layoutSteps(n: number): number {
  const size = Math.max(1, n)
  if (size <= STEP_ANCHORS[0][0]) return STEP_ANCHORS[0][1]
  for (let i = 1; i < STEP_ANCHORS.length; i++) {
    const [lowN, lowSteps] = STEP_ANCHORS[i - 1]
    const [highN, highSteps] = STEP_ANCHORS[i]
    if (size > highN) continue
    const t = (Math.log(size) - Math.log(lowN)) / (Math.log(highN) - Math.log(lowN))
    return Math.round(lowSteps + (highSteps - lowSteps) * t)
  }
  return STEP_ANCHORS[STEP_ANCHORS.length - 1][1]
}

/**
 * The radius a graph of `n` nodes settles inside, which is also where it is started.
 *
 * In three dimensions the repulsion inside a ball of charge balances gravity at `∛(n/g)`; in two
 * the same argument on a disc gives `√(n/g)`.
 */
export function layoutRadius(n: number, dimensions: 2 | 3): number {
  const ratio = Math.max(1, n) / LAYOUT_GRAVITY
  return LAYOUT_SPRING * (dimensions === 3 ? Math.cbrt(ratio) : Math.sqrt(ratio))
}

/**
 * Where every node starts, as `[x, y, z]` per node: on a circle by the hash of its id in 2D, on
 * a sphere by two independent hashes in 3D. A single hash split in half correlates latitude with
 * longitude for short ids, so the second is of the id salted.
 */
export function seedPositions(ids: readonly string[], dimensions: 2 | 3): Float32Array {
  const out = new Float32Array(ids.length * 3)
  const radius = layoutRadius(ids.length, dimensions)
  for (const [index, id] of ids.entries()) {
    const theta = (hash(`${id} `) % 4096) * ((Math.PI * 2) / 4096)
    if (dimensions === 2) {
      // Not quite on the circle: a graph whose nodes all start at the same radius has every pair
      // pushing along the same ring, and a node with no edges stays there.
      const r = radius * (0.7 + 0.3 * ((hash(id) % 1024) / 1024))
      out[index * 3] = r * Math.cos(theta)
      out[index * 3 + 1] = r * Math.sin(theta)
      continue
    }
    const z = ((hash(id) % 2048) / 2048) * 2 - 1
    const ring = Math.sqrt(Math.max(0, 1 - z * z))
    out[index * 3] = radius * ring * Math.cos(theta)
    out[index * 3 + 1] = radius * ring * Math.sin(theta)
    out[index * 3 + 2] = radius * z
  }
  return out
}

export interface Layout {
  /** Run `count` more steps, or one. Steps past `steps` do nothing. */
  step(count?: number): void
  /**
   * The current positions, `[x, y, z]` per node in the order the nodes were given, normalised so
   * the furthest node is one unit from the origin. Allocated on each call.
   */
  positions(): Float32Array
  readonly done: boolean
  readonly steps: number
  readonly taken: number
}

/**
 * A layout over `nodes` and `links`, ready to be stepped.
 *
 * A link naming a node that is not there, or a node's link to itself, is skipped rather than
 * refused — the parser has already rejected what it wanted to, and a layout is not the place to
 * raise.
 */
export function createLayout(nodes: readonly LayoutNode[], links: readonly LayoutLink[], options: { dimensions: 2 | 3 }): Layout {
  const dimensions = options.dimensions
  const ids = nodes.map((node) => node.id)
  const index = new Map(ids.map((id, i) => [id, i]))
  const position = seedPositions(ids, dimensions)
  const displacement = new Float64Array(position.length)
  const count = nodes.length
  const steps = layoutSteps(count)

  const pairs: number[] = []
  for (const link of links) {
    const from = index.get(link.from)
    const to = index.get(link.to)
    if (from === undefined || to === undefined || from === to) continue
    pairs.push(from, to)
  }

  const k = LAYOUT_SPRING
  const kSquared = k * k
  const heat = layoutRadius(count, dimensions) * HEAT
  let taken = 0

  const one = (): void => {
    displacement.fill(0)
    for (let i = 0; i < count; i++) {
      const xi = position[i * 3]
      const yi = position[i * 3 + 1]
      const zi = position[i * 3 + 2]
      for (let j = i + 1; j < count; j++) {
        const dx = xi - position[j * 3]
        const dy = yi - position[j * 3 + 1]
        const dz = zi - position[j * 3 + 2]
        const squared = Math.max(dx * dx + dy * dy + dz * dz, MIN_DISTANCE * MIN_DISTANCE)
        // k²/d along the unit vector is k²/d² times the vector, so no square root is needed.
        const force = kSquared / squared
        displacement[i * 3] += dx * force
        displacement[i * 3 + 1] += dy * force
        displacement[i * 3 + 2] += dz * force
        displacement[j * 3] -= dx * force
        displacement[j * 3 + 1] -= dy * force
        displacement[j * 3 + 2] -= dz * force
      }
    }
    for (let e = 0; e < pairs.length; e += 2) {
      const a = pairs[e]
      const b = pairs[e + 1]
      const dx = position[a * 3] - position[b * 3]
      const dy = position[a * 3 + 1] - position[b * 3 + 1]
      const dz = position[a * 3 + 2] - position[b * 3 + 2]
      const distance = Math.max(Math.hypot(dx, dy, dz), MIN_DISTANCE)
      const force = distance / k
      displacement[a * 3] -= dx * force
      displacement[a * 3 + 1] -= dy * force
      displacement[a * 3 + 2] -= dz * force
      displacement[b * 3] += dx * force
      displacement[b * 3 + 1] += dy * force
      displacement[b * 3 + 2] += dz * force
    }
    const temperature = Math.max(heat * (1 - taken / steps), heat * 0.01)
    for (let i = 0; i < count; i++) {
      const dx = displacement[i * 3] - position[i * 3] * LAYOUT_GRAVITY
      const dy = displacement[i * 3 + 1] - position[i * 3 + 1] * LAYOUT_GRAVITY
      const dz = dimensions === 3 ? displacement[i * 3 + 2] - position[i * 3 + 2] * LAYOUT_GRAVITY : 0
      const length = Math.hypot(dx, dy, dz)
      if (length < MIN_DISTANCE) continue
      const scale = Math.min(length, temperature) / length
      position[i * 3] += dx * scale
      position[i * 3 + 1] += dy * scale
      position[i * 3 + 2] += dz * scale
    }
    taken++
  }

  return {
    step(request = 1) {
      for (let i = 0; i < request && taken < steps; i++) one()
    },
    positions: () => normalise(position),
    get done() {
      return taken >= steps
    },
    steps,
    get taken() {
      return taken
    },
  }
}

/** A copy scaled so the furthest node is one unit out; a single node sits at the origin. */
function normalise(position: Float32Array): Float32Array {
  const out = new Float32Array(position.length)
  const count = position.length / 3
  let cx = 0
  let cy = 0
  let cz = 0
  for (let i = 0; i < count; i++) {
    cx += position[i * 3]
    cy += position[i * 3 + 1]
    cz += position[i * 3 + 2]
  }
  cx /= Math.max(1, count)
  cy /= Math.max(1, count)
  cz /= Math.max(1, count)
  let largest = 0
  for (let i = 0; i < count; i++) {
    largest = Math.max(largest, Math.hypot(position[i * 3] - cx, position[i * 3 + 1] - cy, position[i * 3 + 2] - cz))
  }
  const scale = largest > MIN_DISTANCE ? 1 / largest : 0
  for (let i = 0; i < count; i++) {
    out[i * 3] = (position[i * 3] - cx) * scale
    out[i * 3 + 1] = (position[i * 3 + 1] - cy) * scale
    out[i * 3 + 2] = (position[i * 3 + 2] - cz) * scale
  }
  return out
}

/** The settled layout: every step spent, positions normalised. What the 2D figure is drawn from. */
export function settle(nodes: readonly LayoutNode[], links: readonly LayoutLink[], dimensions: 2 | 3): Float32Array {
  const layout = createLayout(nodes, links, { dimensions })
  layout.step(layout.steps)
  return layout.positions()
}
