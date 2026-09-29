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
  /** A thin line from the label to its anchor, when the label is not sitting on the anchor. */
  leader?: [Point, Point]
}

export interface LabelLayoutContext {
  width: number
  height: number
  /** Screen outline of every object that labels must not cover, by object index; one object may have several. */
  obstacles: Array<{ owner: number; rect: Rect }>
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
  for (const [members, x] of columns) {
    for (const [index, rect] of stackColumn(members, x, height)) {
      const anchor = requests[index].anchor
      placed[index] = { rect, leader: [nearestOnRect(rect, anchor), anchor] }
    }
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
export function countOverlaps(placed: readonly PlacedLabel[], requests: readonly LabelRequest[], obstacles: LabelLayoutContext["obstacles"]): number {
  let count = 0
  for (let i = 0; i < placed.length; i++) {
    const rect = placed[i].rect
    const onLabel = placed.some((other, j) => j !== i && intersects(other.rect, rect))
    const onObject = obstacles.some((o) => o.owner !== requests[i].owner && intersects(o.rect, rect))
    if (onLabel || onObject) count++
  }
  return count
}
