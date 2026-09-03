import { beforeEach, describe, expect, it } from "vitest"
import { forgetPositions, graphKey, recallPositions, rememberPositions, REMEMBERED_GRAPHS } from "./positions"
import type { Graph3dPanel } from "./types"

const panel = (extra: Partial<Graph3dPanel> = {}): Graph3dPanel => ({
  kind: "graph3d",
  nodes: [{ id: "kyiv", name: "Kyiv" }, { id: "moscow", name: "Moscow" }],
  edges: [],
  ...extra,
})

beforeEach(() => forgetPositions())

describe("graphKey", () => {
  it("is the panel's title, so a graph that gained three entities is still the same graph", () => {
    // The whole point. A key over the node ids would change the moment the model wrote one more
    // entity, and the twenty already on screen would jump to new places for no reason a reader
    // could see.
    const before = graphKey(panel({ title: "Who reported what" }))
    const after = graphKey(panel({ title: "Who reported what", nodes: [...panel().nodes, { id: "afp", name: "AFP" }] }))
    expect(after).toBe(before)
  })
  it("keeps two differently titled graphs apart", () => {
    expect(graphKey(panel({ title: "Entities" }))).not.toBe(graphKey(panel({ title: "Sources" })))
  })
  it("falls back to the first entity when the panel has no title", () => {
    expect(graphKey(panel())).toContain("kyiv")
    expect(graphKey(panel())).not.toBe(graphKey(panel({ title: "kyiv" })))
    expect(graphKey({ kind: "graph3d", nodes: [], edges: [] })).toBe(graphKey({ kind: "graph3d", nodes: [], edges: [] }))
  })
})

describe("remembering where a graph settled", () => {
  it("gives every id back the position it had", () => {
    rememberPositions("a", ["kyiv", "moscow"], new Float32Array([1, 2, 3, -1, -2, -3]))
    const recalled = recallPositions("a")
    expect(recalled?.get("kyiv")).toEqual([1, 2, 3])
    expect(recalled?.get("moscow")).toEqual([-1, -2, -3])
    expect(recalled?.get("afp")).toBeUndefined()
  })
  it("knows nothing about a graph it has not seen", () => {
    expect(recallPositions("never-drawn")).toBeUndefined()
  })
  it("copies the layout's buffer rather than holding on to it", () => {
    // `positions()` hands back the live array the layout keeps stepping; remembering it by
    // reference would remember whatever it became later, which for a running layout is anything.
    const live = new Float32Array([1, 2, 3])
    rememberPositions("a", ["kyiv"], live)
    live[0] = 99
    expect(recallPositions("a")?.get("kyiv")).toEqual([1, 2, 3])
  })
  it("forgets the graph nobody has looked at for longest, and no others", () => {
    for (let i = 0; i < REMEMBERED_GRAPHS; i++) rememberPositions(`g${i}`, ["a"], new Float32Array([i, 0, 0]))
    // Touching the oldest makes it the newest, so the next one in is what falls off.
    expect(recallPositions("g0")).toBeDefined()
    rememberPositions("overflow", ["a"], new Float32Array([0, 0, 0]))
    expect(recallPositions("g0")).toBeDefined()
    expect(recallPositions("g1")).toBeUndefined()
    expect(recallPositions("overflow")).toBeDefined()
  })
})
