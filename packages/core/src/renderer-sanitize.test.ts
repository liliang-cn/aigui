// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { Renderer } from "./renderer"

describe("Renderer html sanitization", () => {
  it("sanitizes html node content by default", () => {
    const onPatch = vi.fn()
    const r = new Renderer({ onPatch })
    r.push("- <img src=x onerror=alert(1)>\n")
    const all = onPatch.mock.calls.flatMap((c) => c[0])
    const htmlNode = all.map((p: any) => p.node).find((n: any) => n?.type === "html")
    expect(htmlNode?.content ?? "").not.toContain("onerror")
  })
  it("can disable sanitization", () => {
    const onPatch = vi.fn()
    const r = new Renderer({ sanitize: false, onPatch })
    r.push("- <img src=x onerror=alert(1)>\n")
    const all = onPatch.mock.calls.flatMap((c) => c[0])
    const htmlNode = all.map((p: any) => p.node).find((n: any) => n?.type === "html")
    expect(htmlNode?.content ?? "").toContain("onerror")
  })
  it("sanitizes the html field of a paragraph node", () => {
    const onPatch = vi.fn()
    const r = new Renderer({ onPatch })
    r.push("a <img src=x onerror=alert(1)> b")
    const all = onPatch.mock.calls.flatMap((c) => c[0])
    const p = all.map((x: any) => x.node).find((n: any) => n?.type === "paragraph")
    expect(p?.html ?? "").not.toContain("onerror")
  })
})
