import type { LabelSide } from "./types"

/** A rectangle on screen, in CSS pixels from the canvas's top-left corner. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/** One label to place: where on screen its object's anchor landed, and how big its text is. */
export interface LabelRequest {
  side: LabelSide
  anchor: Point
  width: number
  height: number
  /** Index of the object the label belongs to — its own outline is not something to avoid. */
  owner: number
}

export interface PlacedLabel {
  rect: Rect
  /**
   * A thin line from the label to its anchor, when the label is not sitting on the anchor: the
   * label end first, the anchor last, and any bends it takes round other objects in between.
   */
  leader?: Point[]
}

/**
 * An object as it appears on screen: its bounding rectangle and, when known, its silhouette.
 *
 * The silhouette is what labels and leaders really avoid. A box seen from three-quarters projects
 * to a hexagon whose bounding rectangle is half empty corners — avoid the rectangle and a leader
 * detours round empty space, or ends on a "point of the object" that is thin air.
 */
export interface Obstacle {
  owner: number
  rect: Rect
  /** Convex outline on screen, in order. Absent: the rectangle is the outline. */
  outline?: Point[]
}

export interface LabelLayoutContext {
  width: number
  height: number
  /** Every object that labels must not cover, by object index. */
  obstacles: Obstacle[]
}

/** The text size a label is drawn at, in CSS pixels, whatever the camera is doing. */
export const LABEL_FONT_PX = 13
/** How far a side column stands off the outermost object. */
export const COLUMN_GAP = 20
const EDGE = 4
const GAP = 3

const intersects = (a: Rect, b: Rect, pad = 0): boolean =>
  a.x < b.x + b.width + pad && b.x < a.x + a.width + pad && a.y < b.y + b.height + pad && b.y < a.y + a.height + pad

const clampInto = (rect: Rect, width: number, height: number): Rect => ({
  ...rect,
  x: Math.min(Math.max(rect.x, EDGE), Math.max(EDGE, width - EDGE - rect.width)),
  y: Math.min(Math.max(rect.y, EDGE), Math.max(EDGE, height - EDGE - rect.height)),
})

/** Where a leader leaves its label: the point of the label's outline nearest the anchor. */
function nearestOnRect(rect: Rect, to: Point): Point {
  return {
    x: Math.min(Math.max(to.x, rect.x), rect.x + rect.width),
    y: Math.min(Math.max(to.y, rect.y), rect.y + rect.height),
  }
}

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y })
const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x

/** Whether segments ab and cd cross (touching at an end does not count). */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(sub(d, c), sub(a, c))
  const d2 = cross(sub(d, c), sub(b, c))
  const d3 = cross(sub(b, a), sub(c, a))
  const d4 = cross(sub(b, a), sub(d, a))
  return d1 * d2 < 0 && d3 * d4 < 0
}

/** Whether segment ab passes through the inside of `rect`, shrunk by `inset` on every side. */
export function segmentHitsRect(a: Point, b: Point, rect: Rect, inset = 1.5): boolean {
  const x0 = rect.x + inset
  const x1 = rect.x + rect.width - inset
  const y0 = rect.y + inset
  const y1 = rect.y + rect.height - inset
  if (x0 >= x1 || y0 >= y1) return false
  // Liang–Barsky: clip the segment to the rectangle; anything left over is inside it.
  let t0 = 0
  let t1 = 1
  const dx = b.x - a.x
  const dy = b.y - a.y
  for (const [p, q] of [[-dx, a.x - x0], [dx, x1 - a.x], [-dy, a.y - y0], [dy, y1 - a.y]] as const) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return false
  }
  return t1 - t0 > 1e-6
}

/** The convex hull of `points`, counter-clockwise on screen (Andrew's monotone chain). */
export function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (sorted.length < 3) return sorted
  const turn = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Point[] = []
  for (const p of sorted) {
    while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Point[] = []
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

const rectOutline = (r: Rect): Point[] => [
  { x: r.x, y: r.y },
  { x: r.x + r.width, y: r.y },
  { x: r.x + r.width, y: r.y + r.height },
  { x: r.x, y: r.y + r.height },
]
const outlineOf = (o: Obstacle): Point[] => (o.outline && o.outline.length >= 3 ? o.outline : rectOutline(o.rect))
const centroid = (poly: readonly Point[]): Point => ({ x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length })

/** `poly` moved `by` pixels out from its centre (in, when negative). */
function grow(poly: readonly Point[], by: number): Point[] {
  const c = centroid(poly)
  return poly.map((p) => {
    const d = Math.hypot(p.x - c.x, p.y - c.y)
    const k = d > 1e-9 ? Math.max(0, (d + by) / d) : 1
    return { x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }
  })
}

/** Whether `p` is strictly inside the convex polygon. */
function insidePolygon(p: Point, poly: readonly Point[]): boolean {
  if (poly.length < 3) return false
  let sign = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    if (Math.abs(c) < 1e-9) return false
    if (sign === 0) sign = Math.sign(c)
    else if (Math.sign(c) !== sign) return false
  }
  return true
}

/** Whether two convex polygons overlap with any area (separating-axis test). */
function polygonsOverlap(a: readonly Point[], b: readonly Point[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      const axis = { x: q.y - p.y, y: p.x - q.x }
      const project = (s: readonly Point[]) => s.map((v) => v.x * axis.x + v.y * axis.y)
      const [pa, pb] = [project(a), project(b)]
      if (Math.max(...pa) <= Math.min(...pb) + 1e-9 || Math.max(...pb) <= Math.min(...pa) + 1e-9) return false
    }
  }
  return true
}

/** Whether segment ab passes through the inside of an obstacle, shrunk by `inset` pixels. */
export function segmentHitsObstacle(a: Point, b: Point, obstacle: Obstacle, inset = 1.5): boolean {
  if (!segmentHitsRect(a, b, obstacle.rect, 0)) return false
  const poly = grow(outlineOf(obstacle), -inset)
  if (insidePolygon(a, poly) || insidePolygon(b, poly) || insidePolygon({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, poly)) return true
  return poly.some((p, i) => segmentsCross(a, b, p, poly[(i + 1) % poly.length]))
}

/** Whether a label's rectangle covers part of an obstacle. */
export function rectHitsObstacle(rect: Rect, obstacle: Obstacle): boolean {
  return intersects(rect, obstacle.rect) && polygonsOverlap(rectOutline(rect), outlineOf(obstacle))
}

/** Whether `p` is on top of an obstacle (by more than `inset` pixels). */
const covered = (p: Point, obstacle: Obstacle, inset = 1.5) => insidePolygon(p, grow(outlineOf(obstacle), -inset))

/** Every segment of a polyline, as pairs of points. */
const segments = (line: readonly Point[]): Array<[Point, Point]> => line.slice(1).map((p, i) => [line[i], p])

/** Whether two polylines cross anywhere. */
export function polylinesCross(a: readonly Point[], b: readonly Point[]): boolean {
  return segments(a).some(([p, q]) => segments(b).some(([r, t]) => segmentsCross(p, q, r, t)))
}

/** How far outside an object a leader bends round it: clear of its edge, so it never traces it. */
const BEND = 10
/** What a bend costs, in pixels of length: a slightly longer line beats one more corner. */
const BEND_COST = 24

/**
 * The leader from a column label to its object.
 *
 * The anchor the scene asked for — the middle of the object's side — when a straight line reaches
 * it without crossing another object. Otherwise any visible point on the object's own outline
 * identifies it just as well, and the shortest line to one is found among paths that bend only at
 * the corners of the objects in the way, just outside them — how a draughtsman routes a callout
 * round a part rather than through it. Shortest path, so a straight line still wins wherever one
 * exists; nothing clear at all leaves the straight line to the asked-for anchor.
 */
function routeLeader(label: Rect, side: "left" | "right", preferred: Point, own: readonly Obstacle[], foreign: readonly Obstacle[]): Point[] {
  const start: Point = { x: side === "left" ? label.x + label.width + 2 : label.x - 2, y: label.y + label.height / 2 }
  const open = (a: Point, b: Point) => !foreign.some((o) => segmentHitsObstacle(a, b, o))
  const visible = (p: Point) => !foreign.some((o) => covered(p, o))
  if (open(start, preferred) && visible(preferred)) return [start, preferred]

  // Points on the object's own silhouette, a little inside it so the dot reads as on the object.
  const ends: Point[] = [preferred]
  for (const o of own) {
    const poly = grow(outlineOf(o), -2)
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length]
      for (const f of [0.5, 0.25, 0.75]) ends.push({ x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f })
    })
  }
  const targets = ends.filter(visible)
  const corners = foreign.flatMap((o) => grow(outlineOf(o), BEND)).filter(visible)

  // Dijkstra over start → corners → a target, edges only where the line is clear.
  const nodes: Point[] = [start, ...corners, ...targets]
  const firstTarget = 1 + corners.length
  const distance = nodes.map((_, i) => (i === 0 ? 0 : Infinity))
  const previous = nodes.map(() => -1)
  const done = nodes.map(() => false)
  for (;;) {
    let current = -1
    for (let i = 0; i < nodes.length; i++) if (!done[i] && distance[i] < Infinity && (current < 0 || distance[i] < distance[current])) current = i
    if (current < 0) break
    if (current >= firstTarget) {
      const path: Point[] = []
      for (let i = current; i >= 0; i = previous[i]) path.unshift(nodes[i])
      return path
    }
    done[current] = true
    for (let next = 1; next < nodes.length; next++) {
      if (done[next]) continue
      const step = Math.hypot(nodes[next].x - nodes[current].x, nodes[next].y - nodes[current].y) + (next < firstTarget ? BEND_COST : 0)
      if (distance[current] + step >= distance[next] || !open(nodes[current], nodes[next])) continue
      distance[next] = distance[current] + step
      previous[next] = current
    }
  }
  return [start, preferred]
}

/** The union of the obstacles' outlines: the scene the side columns stand outside of. */
export function unionRect(rects: readonly Rect[]): Rect | undefined {
  if (rects.length === 0) return undefined
  const left = Math.min(...rects.map((r) => r.x))
  const top = Math.min(...rects.map((r) => r.y))
  const right = Math.max(...rects.map((r) => r.x + r.width))
  const bottom = Math.max(...rects.map((r) => r.y + r.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * Stack a side column's labels in anchor order without letting them overlap.
 *
 * Each label wants to sit level with its anchor. Walking down, a label that would overlap the one
 * above is pushed below it; walking back up, a column that ran off the bottom is pushed back in.
 * Sorting by anchor first is what keeps the leaders from crossing each other.
 */
function stackColumn(requests: Array<{ index: number; request: LabelRequest }>, x: (request: LabelRequest) => number, height: number): Map<number, Rect> {
  const sorted = [...requests].sort((a, b) => a.request.anchor.y - b.request.anchor.y)
  const rects = sorted.map(({ request }) => ({ x: x(request), y: request.anchor.y - request.height / 2, width: request.width, height: request.height }))
  for (let i = 0; i < rects.length; i++) {
    const floor = i === 0 ? EDGE : rects[i - 1].y + rects[i - 1].height + GAP
    rects[i].y = Math.max(rects[i].y, floor)
  }
  for (let i = rects.length - 1; i >= 0; i--) {
    const ceiling = i === rects.length - 1 ? height - EDGE : rects[i + 1].y - GAP
    rects[i].y = Math.min(rects[i].y, ceiling - rects[i].height)
  }
  // A column taller than the canvas cannot fit either way; better the top labels readable.
  for (let i = 0; i < rects.length; i++) {
    const floor = i === 0 ? EDGE : rects[i - 1].y + rects[i - 1].height + GAP
    rects[i].y = Math.max(rects[i].y, floor)
  }
  return new Map(sorted.map(({ index }, i) => [index, rects[i]]))
}

/**
 * Place every label on screen.
 *
 * `left` and `right` labels go in a column outside the objects, each joined to its anchor by a
 * leader, the way a figure is annotated. `top` and `front` labels start at their anchor, and one
 * that would land on another label moves to the nearest free spot — up or down a line at a time,
 * or out beside its own object — and takes a leader back to where it belongs.
 * Nothing is dropped: a label with no free spot anywhere stays where it wanted to be.
 */
export function layoutLabels(requests: readonly LabelRequest[], context: LabelLayoutContext): PlacedLabel[] {
  const { width, height, obstacles } = context
  const placed: Array<PlacedLabel | undefined> = new Array(requests.length)
  const scene = unionRect(obstacles.map((o) => o.rect)) ?? { x: width / 2, y: height / 2, width: 0, height: 0 }
  const indexed = requests.map((request, index) => ({ index, request }))

  const left = indexed.filter(({ request }) => request.side === "left")
  const right = indexed.filter(({ request }) => request.side === "right")
  const columns: Array<[typeof left, (r: LabelRequest) => number]> = [
    [left, (r) => Math.max(EDGE, scene.x - COLUMN_GAP - r.width)],
    [right, (r) => Math.min(width - EDGE - r.width, scene.x + scene.width + COLUMN_GAP)],
  ]
  const ownRects = (owner: number) => obstacles.filter((o) => o.owner === owner)
  const foreignRects = (owner: number) => obstacles.filter((o) => o.owner !== owner)
  for (const [members, x] of columns) {
    const side = members[0]?.request.side as "left" | "right" | undefined
    if (!side) continue
    const stacked = stackColumn(members, x, height)
    const route = (index: number, rect: Rect) => routeLeader(rect, side, requests[index].anchor, ownRects(requests[index].owner), foreignRects(requests[index].owner))
    // The column's slots top to bottom, and which label sits in each.
    const order = [...stacked.keys()].sort((a, b) => stacked.get(a)!.y - stacked.get(b)!.y)
    const slots = order.map((index) => stacked.get(index)!)
    const at = (slot: number, index: number): Rect => ({ ...slots[slot], x: x(requests[index]), width: requests[index].width })
    const leaders = order.map((index, slot) => route(index, at(slot, index)))
    // Two neighbours whose leaders cross trade places — anchor order alone does not prevent it once
    // anchors sit at different depths — until no neighbouring pair crosses.
    for (let pass = 0, swapped = true; swapped && pass < order.length * order.length; pass++) {
      swapped = false
      for (let slot = 0; slot + 1 < order.length; slot++) {
        const [a, b] = [leaders[slot], leaders[slot + 1]]
        if (!polylinesCross(a, b)) continue
        ;[order[slot], order[slot + 1]] = [order[slot + 1], order[slot]]
        leaders[slot] = route(order[slot], at(slot, order[slot]))
        leaders[slot + 1] = route(order[slot + 1], at(slot + 1, order[slot + 1]))
        swapped = true
      }
    }
    order.forEach((index, slot) => {
      placed[index] = { rect: at(slot, index), leader: leaders[slot] }
    })
  }

  // Only other labels: a label over an object is where a top label has always been allowed to
  // be — above a tall thing seen from above it will cross whatever is behind — and chasing every
  // object off turns a scene that read fine into one full of long leaders. A scene whose labels
  // must keep clear of objects asks for the side columns.
  const taken = (rect: Rect): boolean => placed.some((label) => label && intersects(label.rect, rect, GAP))

  // Top to bottom on screen: the upper label keeps its place and the one below it moves.
  const free = indexed.filter(({ request }) => request.side === "top" || request.side === "front").sort((a, b) => a.request.anchor.y - b.request.anchor.y)
  for (const { index, request } of free) {
    const { anchor, width: w, height: h } = request
    const wanted = clampInto({ x: anchor.x - w / 2, y: request.side === "top" ? anchor.y - 6 - h : anchor.y - h / 2, width: w, height: h }, width, height)
    const own = unionRect(obstacles.filter((o) => o.owner === request.owner).map((o) => o.rect))
    const candidates: Rect[] = [wanted]
    for (let step = 1; step <= 12; step++) {
      candidates.push({ ...wanted, y: wanted.y - step * (h + GAP) }, { ...wanted, y: wanted.y + step * (h + GAP) })
    }
    if (own) {
      candidates.push({ ...wanted, x: own.x - COLUMN_GAP - w, y: anchor.y - h / 2 }, { ...wanted, x: own.x + own.width + COLUMN_GAP, y: anchor.y - h / 2 })
    }
    const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 })
    const cost = (r: Rect) => Math.hypot(centre(r).x - centre(wanted).x, centre(r).y - centre(wanted).y)
    const options = candidates.map((r) => clampInto(r, width, height)).sort((a, b) => cost(a) - cost(b))
    const rect = options.find((r) => !taken(r)) ?? wanted
    const moved = cost(rect) > h
    placed[index] = moved ? { rect, leader: [nearestOnRect(rect, anchor), anchor] } : { rect }
  }
  return placed as PlacedLabel[]
}

/**
 * How many placed labels sit on another label or on an object other than their own.
 *
 * Zero is the promise `layoutLabels` tries to keep; it can fail to when there is simply no room.
 * The scene records the count on its label layer, which is how a test — or someone puzzling over
 * a crowded picture — can tell the difference without reading pixels.
 */
export function countOverlaps(placed: readonly PlacedLabel[], requests: readonly LabelRequest[], obstacles: readonly Obstacle[]): number {
  let count = 0
  for (let i = 0; i < placed.length; i++) {
    const rect = placed[i].rect
    const onLabel = placed.some((other, j) => j !== i && intersects(other.rect, rect))
    const onObject = obstacles.some((o) => o.owner !== requests[i].owner && rectHitsObstacle(rect, o))
    if (onLabel || onObject) count++
  }
  return count
}

/**
 * How many leaders cross another leader or pass through an object other than their own.
 *
 * Not a failure the way an overlapping label is — the text still reads — but the thing that makes
 * a callout ambiguous, so the layout keeps it at zero where it can, and the tests hold it there.
 */
export function countLeaderTangles(placed: readonly PlacedLabel[], requests: readonly LabelRequest[], obstacles: readonly Obstacle[]): number {
  let count = 0
  for (let i = 0; i < placed.length; i++) {
    const leader = placed[i].leader
    if (!leader) continue
    const crossesLeader = placed.some((other, j) => j !== i && other.leader && polylinesCross(leader, other.leader))
    const throughObject = segments(leader).some(([a, b]) => obstacles.some((o) => o.owner !== requests[i].owner && segmentHitsObstacle(a, b, o)))
    if (crossesLeader || throughObject) count++
  }
  return count
}
