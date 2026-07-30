import { describe, expect, it } from "vitest"
import { createParser } from "./parser"
import { Renderer } from "./renderer"
import type { ASTNode } from "./types"

const inline = (src: string): string => createParser()(src)[0]?.html ?? ""

describe("emphasis around East Asian text", () => {
  it("closes bold between a bracket and a Chinese character", () => {
    // The shape that started this: CommonMark will not let `**` close when it follows punctuation
    // and precedes a CJK character, so the asterisks were rendered literally.
    expect(inline("只有**严格单调（单射/One-to-One）**的函数")).toContain("<strong>严格单调（单射/One-to-One）</strong>")
    expect(inline("只有**严格单调(单射/One-to-One)**的函数")).toContain("<strong>")
  })
  it("closes italics in the same position", () => {
    expect(inline("*斜体（测试）*中文")).toContain("<em>斜体（测试）</em>")
  })
  it.each([
    "只有**严格单调**的函数",
    "只有**严格单调(单射)** 的函数",
    "只有**严格单调(单射)**。",
    "「**引用**」的用法",
  ])("keeps working for %j, which CommonMark already allowed", (src) => {
    expect(inline(src)).toContain("<strong>")
  })
  it("leaves ASCII emphasis exactly as it was", () => {
    expect(inline("only **strict (one-to-one)** functions")).toContain("<strong>strict (one-to-one)</strong>")
    // Intraword and spaced asterisks must not become emphasis just because the rules were relaxed.
    expect(inline("a * b * c")).toBe("a * b * c")
    expect(inline("snake_case_word stays")).toContain("snake_case_word stays")
  })
  it("holds for Japanese and Korean too", () => {
    expect(inline("これは**太字（かっこ）**です")).toContain("<strong>太字（かっこ）</strong>")
    expect(inline("이것은**굵게(괄호)**입니다")).toContain("<strong>")
  })
  it("reaches the renderer, streaming and all", () => {
    const snapshots: ASTNode[][] = []
    const r = new Renderer({ sanitize: false, onPatch: (_patches, nodes) => snapshots.push(nodes) })
    r.push("只有**严格单调（单")
    r.push("射）**的函数")
    expect(snapshots.at(-1)?.[0]?.html).toContain("<strong>严格单调（单射）</strong>")
  })
})
