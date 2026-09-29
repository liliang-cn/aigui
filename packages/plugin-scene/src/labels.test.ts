import { describe, expect, it } from "vitest"
import { COLUMN_GAP, countOverlaps, layoutLabels, unionRect, type LabelRequest, type Rect } from "./labels"

const W = 760
const H = 456
const label = (side: LabelRequest["side"], x: number, y: number, owner: number, width = 90): LabelRequest => ({ side, anchor: { x, y }, width, height: 19, owner })
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/** Two stacks of two boxes, the shape of the scene that broke labels: one object resting on another. */
const stacks = [
  { owner: 0, rect: { x: 200, y: 250, width: 120, height: 80 } },
  { owner: 1, rect: { x: 200, y: 170, width: 120, height: 80 } },
  { owner: 2, rect: { x: 420, y: 250, width: 120, height: 80 } },
  { owner: 3, rect: { x: 420, y: 170, width: 120, height: 80 } },
]

describe("layoutLabels", () => {
  it("puts side labels in columns outside the scene, joined to their anchors", () => {
    const requests = [label("left", 200, 290, 0), label("left", 200, 210, 1), label("right", 540, 290, 2), label("right", 540, 210, 3)]
    const placed = layoutLabels(requests, { width: W, height: H, obstacles: stacks })
    const scene = unionRect(stacks.map((s) => s.rect))!
    for (const [i, { rect, leader }] of placed.entries()) {
      if (requests[i].side === "left") expect(rect.x + rect.width).toBeLessThanOrEqual(scene.x - COLUMN_GAP + 0.01)
      else expect(rect.x).toBeGreaterThanOrEqual(scene.x + scene.width + COLUMN_GAP - 0.01)
      // Level with its anchor when nothing is in the way, and a leader to it either way.
      expect(Math.abs(rect.y + rect.height / 2 - requests[i].anchor.y)).toBeLessThan(0.01)
      expect(leader?.[1]).toEqual(requests[i].anchor)
    }
    expect(countOverlaps(placed, requests, stacks)).toBe(0)
  })

  it("stacks labels whose anchors share a height instead of drawing them on top of each other", () => {
    const requests = [label("right", 540, 210, 3), label("right", 320, 210, 1), label("right", 540, 212, 2)]
    const placed = layoutLabels(requests, { width: W, height: H, obstacles: stacks })
    expect(countOverlaps(placed, requests, stacks)).toBe(0)
    // In anchor order down the column, which is what keeps the leaders apart.
    const ys = placed.map((p) => p.rect.y)
    expect(ys[0]).toBeLessThan(ys[2])
  })

  it("pushes a column back up when it would run off the bottom", () => {
    const requests = Array.from({ length: 6 }, (_, i) => label("left", 200, H - 10 + i, i % 4))
    const placed = layoutLabels(requests, { width: W, height: H, obstacles: stacks })
    for (const { rect } of placed) expect(rect.y + rect.height).toBeLessThanOrEqual(H)
    expect(countOverlaps(placed, requests, [])).toBe(0)
  })

  it("moves a top label off another label, and says where it came from", () => {
    // Both boxes of a stack want their label at the same spot on screen; the lower one moves.
    const requests = [label("top", 260, 170, 1), label("top", 262, 172, 0)]
    const placed = layoutLabels(requests, { width: W, height: H, obstacles: stacks })
    expect(overlap(placed[0].rect, placed[1].rect)).toBe(false)
    expect(placed[0].leader).toBeUndefined()
    expect(placed[1].leader?.[1]).toEqual({ x: 262, y: 172 })
  })

  it("leaves a top label over an object where it was — objects are what the side columns are for", () => {
    // The lower box's top is covered by the upper one. That is the case labelSide exists for;
    // without it the label stays put, as it always has, rather than wandering off on a leader.
    const [placed] = layoutLabels([label("top", 260, 250, 0)], { width: W, height: H, obstacles: stacks })
    expect(placed.leader).toBeUndefined()
    expect(overlap(placed.rect, stacks[1].rect)).toBe(true)
  })

  it("leaves a label that has room exactly where it was, with no leader", () => {
    const requests = [label("top", 480, 170, 3)]
    const [placed] = layoutLabels(requests, { width: W, height: H, obstacles: stacks })
    expect(placed.leader).toBeUndefined()
    expect(placed.rect.x + placed.rect.width / 2).toBeCloseTo(480)
    expect(placed.rect.y + placed.rect.height).toBeLessThanOrEqual(170)
  })

  it("keeps every label on the canvas", () => {
    const requests = [label("top", 2, 2, 0, 200), label("left", 5, 100, 1, 300), label("right", W - 5, 100, 2, 300), label("front", W, H, 3)]
    for (const { rect } of layoutLabels(requests, { width: W, height: H, obstacles: [] })) {
      expect(rect.x).toBeGreaterThanOrEqual(0)
      expect(rect.y).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.width).toBeLessThanOrEqual(W)
      expect(rect.y + rect.height).toBeLessThanOrEqual(H)
    }
  })
})
