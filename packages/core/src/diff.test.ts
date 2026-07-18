import { describe, expect, it } from "vitest"
import { diffAst } from "./diff"
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
  it("removed node produces remove", () => {
    expect(diffAst([n("0:p", "a"), n("1:p", "b")], [n("0:p", "a")])).toEqual([
      { op: "remove", key: "1:p" },
    ])
  })
})
