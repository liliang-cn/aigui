import { describe, expect, it } from "vitest"
import type { ASTNode, Patch } from "@ai-gui/core"
import { applyPatches } from "./apply-patches"

const n = (key: string, content: string): ASTNode => ({ key, type: "paragraph", content })

describe("applyPatches", () => {
  it("insert adds by index", () => {
    expect(applyPatches([], [{ op: "insert", index: 0, node: n("0:p", "a") }] as Patch[])).toEqual([n("0:p", "a")])
  })
  it("update replaces by key", () => {
    expect(applyPatches([n("0:p", "a")], [{ op: "update", key: "0:p", node: n("0:p", "b") }] as Patch[])).toEqual([n("0:p", "b")])
  })
  it("remove drops by key", () => {
    expect(applyPatches([n("0:p", "a"), n("1:p", "b")], [{ op: "remove", key: "1:p" }] as Patch[])).toEqual([n("0:p", "a")])
  })
  it("applies a batch in order", () => {
    expect(applyPatches([n("0:p", "a")], [
      { op: "update", key: "0:p", node: n("0:p", "A") },
      { op: "insert", index: 1, node: n("1:p", "b") },
    ] as Patch[])).toEqual([n("0:p", "A"), n("1:p", "b")])
  })
})
