import type { Figure, PointDef, SolidDefinition, Vec3 } from "./types"

const EPS = 1e-9

export const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z })
export const add = (a: Vec3, b: Vec3): Vec3 => vec(a.x + b.x, a.y + b.y, a.z + b.z)
export const sub = (a: Vec3, b: Vec3): Vec3 => vec(a.x - b.x, a.y - b.y, a.z - b.z)
export const scale = (a: Vec3, k: number): Vec3 => vec(a.x * k, a.y * k, a.z * k)
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a: Vec3, b: Vec3): Vec3 => vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
export const length = (a: Vec3): number => Math.sqrt(dot(a, a))
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t))
export const centroid = (points: Vec3[]): Vec3 => scale(points.reduce(add, vec(0, 0, 0)), 1 / points.length)

/** Split a run of vertex names — `"A1C1"`, `"AB"`, `"PA"` — into its letters. */
export function names(run: string): string[] {
  return run.match(/[A-Z]\d?/g) ?? []
}

/** The letters a solid's label introduces, in order: `"ABCD-A1B1C1D1"` → A B C D A1 B1 C1 D1. */
export function labelNames(label: string | undefined): string[] {
  return label ? names(label) : []
}

/**
 * The regular polygon a prism, pyramid or cylinder stands on.
 *
 * `edge` is the side length a textbook gives, so the circumradius is derived from it rather than
 * asked for — "底面边长 2" is what a question says, never "外接圆半径 1.41".
 */
function baseRing(sides: number, edge: number, y: number): Vec3[] {
  const radius = edge / (2 * Math.sin(Math.PI / sides))
  return Array.from({ length: sides }, (_, i) => {
    // Start at the far side and go clockwise seen from above, so A lands front-left in the default
    // camera — the orientation every textbook picture uses.
    const angle = Math.PI / 2 + (2 * Math.PI * i) / sides + Math.PI / sides
    return vec(radius * Math.cos(angle), y, radius * Math.sin(angle))
  })
}

function ringEdges(ring: string[]): Array<[string, string]> {
  return ring.map((name, i) => [name, ring[(i + 1) % ring.length]] as [string, string])
}

/** Build the named vertices, edges and faces of the solid a definition asks for. */
export function buildFigure(definition: SolidDefinition): Figure {
  const points = new Map<string, Vec3>()
  const edges: Array<[string, string]> = []
  const faces: string[][] = []
  const letters = labelNames(definition.label)

  const boxLike = (lx: number, ly: number, lz: number): void => {
    const bottom = letters.slice(0, 4)
    const top = letters.slice(4, 8)
    const half = [lx / 2, lz / 2] as const
    const corners: Vec3[] = [
      vec(-half[0], 0, half[1]),
      vec(half[0], 0, half[1]),
      vec(half[0], 0, -half[1]),
      vec(-half[0], 0, -half[1]),
    ]
    bottom.forEach((name, i) => points.set(name, corners[i]))
    top.forEach((name, i) => points.set(name, add(corners[i], vec(0, ly, 0))))
    edges.push(...ringEdges(bottom), ...ringEdges(top), ...bottom.map((name, i) => [name, top[i]] as [string, string]))
    faces.push([...bottom].reverse(), [...top])
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4
      faces.push([bottom[i], bottom[j], top[j], top[i]])
    }
  }

  switch (definition.solid) {
    case "cube": {
      const a = definition.edge ?? 2
      boxLike(a, a, a)
      break
    }
    case "cuboid": {
      const [l, w, h] = definition.size ?? [4, 3, 2]
      boxLike(l, h, w)
      break
    }
    case "prism": {
      const sides = definition.base ?? 3
      const bottom = letters.slice(0, sides)
      const top = letters.slice(sides, sides * 2)
      const ring = baseRing(sides, definition.edge ?? 2, 0)
      bottom.forEach((name, i) => points.set(name, ring[i]))
      top.forEach((name, i) => points.set(name, add(ring[i], vec(0, definition.height ?? 3, 0))))
      edges.push(...ringEdges(bottom), ...ringEdges(top), ...bottom.map((name, i) => [name, top[i]] as [string, string]))
      faces.push([...bottom].reverse(), [...top])
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides
        faces.push([bottom[i], bottom[j], top[j], top[i]])
      }
      break
    }
    case "pyramid": {
      const sides = definition.base ?? 4
      const apex = letters[0]
      const bottom = letters.slice(1, 1 + sides)
      const ring = baseRing(sides, definition.edge ?? 2, 0)
      bottom.forEach((name, i) => points.set(name, ring[i]))
      // Above the centre by default. `apexOver` is what makes "PA ⊥ 底面" drawable at all: without
      // it the apex sits over the centroid, PA comes out slanted, and the picture contradicts the
      // very thing the answer is explaining.
      const over = definition.apexOver ? points.get(definition.apexOver) : undefined
      const foot = over ?? centroid(ring)
      points.set(apex, add(foot, vec(0, definition.height ?? 3, 0)))
      edges.push(...ringEdges(bottom), ...bottom.map((name) => [apex, name] as [string, string]))
      faces.push([...bottom].reverse())
      for (let i = 0; i < sides; i++) faces.push([bottom[i], bottom[(i + 1) % sides], apex])
      break
    }
    case "cone": {
      const [apex, center] = letters.length >= 2 ? letters : ["P", "O"]
      points.set(center, vec(0, 0, 0))
      points.set(apex, vec(0, definition.height ?? 3, 0))
      break
    }
    case "cylinder": {
      const [top, bottom] = letters.length >= 2 ? letters : ["O1", "O"]
      points.set(bottom, vec(0, 0, 0))
      points.set(top, vec(0, definition.height ?? 3, 0))
      break
    }
    case "sphere": {
      points.set("O", vec(0, 0, 0))
      break
    }
  }

  const radius = definition.radius
  const height = definition.height
  const spread = [...points.values()].reduce((max, p) => Math.max(max, length(p)), 0)
  const extent = Math.max(spread, radius ?? 0, (height ?? 0) / 2, 1)
  return { kind: definition.solid, points, edges, faces, radius, height, extent }
}

/** Where a point on a cone or cylinder's circle sits. */
function circlePoint(figure: Figure, which: "base" | "top", degrees: number): Vec3 | undefined {
  const radius = figure.radius
  if (radius === undefined) return undefined
  const y = which === "top" ? (figure.kind === "cylinder" ? (figure.height ?? 0) : 0) : 0
  const angle = (degrees * Math.PI) / 180
  return vec(radius * Math.cos(angle), y, radius * Math.sin(angle))
}

/** The plane of a named face, as a point and a unit normal. */
export function facePlane(figure: Figure, face: string): { point: Vec3; normal: Vec3 } | undefined {
  const vertices = names(face).map((name) => figure.points.get(name))
  if (vertices.length < 3 || vertices.some((v) => !v)) return undefined
  const [a, b, c] = vertices as Vec3[]
  const normal = cross(sub(b, a), sub(c, a))
  const len = length(normal)
  if (len < EPS) return undefined
  return { point: a, normal: scale(normal, 1 / len) }
}

/**
 * Add the model's own points to the figure, in order.
 *
 * Order matters: a point may be defined against one introduced just before it, which is how a
 * question like "M 是 A1C1 的中点，N 是 BM 的中点" is written.
 */
export function resolvePoints(figure: Figure, definitions: PointDef[] = []): { missing: string[] } {
  const missing: string[] = []
  for (const definition of definitions) {
    let resolved: Vec3 | undefined
    if ("on" in definition) {
      const [from, to] = names(definition.on).map((name) => figure.points.get(name))
      if (from && to) resolved = lerp(from, to, definition.at)
    } else if ("center" in definition) {
      const vertices = names(definition.center).map((name) => figure.points.get(name))
      if (vertices.length >= 3 && vertices.every(Boolean)) resolved = centroid(vertices as Vec3[])
    } else if ("foot" in definition) {
      const from = figure.points.get(definition.foot.from)
      const plane = facePlane(figure, definition.foot.to)
      if (from && plane) resolved = sub(from, scale(plane.normal, dot(sub(from, plane.point), plane.normal)))
    } else if ("onCircle" in definition) {
      resolved = circlePoint(figure, definition.onCircle, definition.angle)
    }
    if (resolved) figure.points.set(definition.id, resolved)
    else missing.push(definition.id)
  }
  return { missing }
}

/**
 * The polygon where a plane cuts a convex solid.
 *
 * Each face contributes at most one segment, and the segments chain into a loop. This is why the
 * model is asked for three points rather than for the answer: "过 A、B1、D1 的截面" is something it
 * knows, while "截面是几边形" is something it guesses — and the guess would be drawn as fact.
 */
export function sectionPolygon(figure: Figure, through: string[]): Vec3[] {
  const anchors = through.map((name) => figure.points.get(name))
  if (anchors.length < 3 || anchors.some((p) => !p)) return []
  const [a, b, c] = anchors as Vec3[]
  const normal = cross(sub(b, a), sub(c, a))
  const norm = length(normal)
  if (norm < EPS) return []
  const unit = scale(normal, 1 / norm)
  const signed = (p: Vec3) => dot(sub(p, a), unit)

  const segments: Array<[Vec3, Vec3]> = []
  for (const face of figure.faces) {
    const vertices = face.map((name) => figure.points.get(name)).filter(Boolean) as Vec3[]
    if (vertices.length < 3) continue
    const hits: Vec3[] = []
    for (let i = 0; i < vertices.length; i++) {
      const p = vertices[i]
      const q = vertices[(i + 1) % vertices.length]
      const dp = signed(p)
      const dq = signed(q)
      if (Math.abs(dp) < 1e-7) {
        hits.push(p)
        continue
      }
      if (dp * dq < 0) hits.push(lerp(p, q, dp / (dp - dq)))
    }
    const distinct = dedupe(hits)
    if (distinct.length === 2) segments.push([distinct[0], distinct[1]])
  }
  return chain(dedupeSegments(segments))
}

/**
 * Drop segments that repeat one already collected, in either direction.
 *
 * A plane through a diagonal of a cube — the standard `ABC1D1` figure — *contains* the edge AB,
 * and both faces meeting along it report that same edge. Chaining then walks A→B and straight back
 * to A, closing a two-point loop and losing the whole section.
 */
function dedupeSegments(segments: Array<[Vec3, Vec3]>): Array<[Vec3, Vec3]> {
  const out: Array<[Vec3, Vec3]> = []
  for (const [p, q] of segments) {
    if (same(p, q)) continue
    if (out.some(([a, b]) => (same(a, p) && same(b, q)) || (same(a, q) && same(b, p)))) continue
    out.push([p, q])
  }
  return out
}

function same(a: Vec3, b: Vec3): boolean {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.z - b.z) < 1e-6
}

function dedupe(points: Vec3[]): Vec3[] {
  const out: Vec3[] = []
  for (const point of points) if (!out.some((seen) => same(seen, point))) out.push(point)
  return out
}

/** Join the per-face segments end to end into one closed loop. */
function chain(segments: Array<[Vec3, Vec3]>): Vec3[] {
  if (segments.length < 3) return []
  const remaining = [...segments]
  const [first] = remaining.splice(0, 1)
  const loop = [first[0], first[1]]
  for (;;) {
    const tail = loop[loop.length - 1]
    const index = remaining.findIndex(([p, q]) => same(p, tail) || same(q, tail))
    if (index === -1) break
    const [segment] = remaining.splice(index, 1)
    const next = same(segment[0], tail) ? segment[1] : segment[0]
    if (same(next, loop[0])) break
    loop.push(next)
  }
  return loop.length >= 3 ? loop : []
}
