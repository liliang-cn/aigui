import { describe, expect, it } from "vitest"
import { applyPatches, diffAst } from "./diff"
import type { ASTNode } from "./types"

const n = (key: string, content: string): ASTNode => ({ key, type: "paragraph", content })

describe("diffAst", () => {
  it("first render inserts all", () => {
    expect(diffAst([], [n("0:p", "a"), n("1:p", "b")])).toEqual([
      { op: "insert", index: 0, node: n("0:p", "a") },
      { op: "insert", index: 1, node: n("1:p", "b") },
    ])
  })
  it("appending at the tail only produces insert", () => {
    expect(diffAst([n("0:p", "a")], [n("0:p", "a"), n("1:p", "b")])).toEqual([
      { op: "insert", index: 1, node: n("1:p", "b") },
    ])
  })
  it("same key with changed content produces update", () => {
    expect(diffAst([n("0:p", "hel")], [n("0:p", "hello")])).toEqual([
      { op: "update", key: "0:p", node: n("0:p", "hello") },
    ])
  })
  it("no change produces no patch", () => {
    expect(diffAst([n("0:p", "a")], [n("0:p", "a")])).toEqual([])
  })
  it("short-circuits equality when stable nodes are reused by reference", () => {
    const node = n("0:0", "a")
    const circular = node as ASTNode & { self?: ASTNode }
    circular.self = circular
    expect(diffAst([circular], [circular])).toEqual([])
    delete circular.self
  })
  it("removed node produces remove", () => {
    expect(diffAst([n("0:p", "a"), n("1:p", "b")], [n("0:p", "a")])).toEqual([
      { op: "remove", key: "1:p" },
    ])
  })
  it("moves reordered nodes", () => {
    const prev = [n("a", "A"), n("b", "B"), n("c", "C")]
    const next = [n("c", "C"), n("a", "A"), n("b", "B")]
    const patches = diffAst(prev, next)
    expect(patches).toContainEqual({ op: "move", key: "c", index: 0 })
    expect(applyPatches(prev, patches)).toEqual(next)
  })
  it("round-trips mixed inserts, removals, moves, and updates", () => {
    const prev = [n("a", "A"), n("b", "B"), n("c", "C"), n("d", "D")]
    const next = [n("d", "D2"), n("x", "X"), n("b", "B")]
    expect(applyPatches(prev, diffAst(prev, next))).toEqual(next)
  })
  it("round-trips a property-like matrix of unique-key lists", () => {
    const lists = [
      [],
      [n("a", "A")],
      [n("a", "A"), n("b", "B")],
      [n("b", "B"), n("a", "A2")],
      [n("c", "C"), n("a", "A"), n("d", "D")],
      [n("d", "D2"), n("b", "B"), n("c", "C2")],
    ]
    for (const prev of lists) {
      for (const next of lists) expect(applyPatches(prev, diffAst(prev, next))).toEqual(next)
    }
  })
})
