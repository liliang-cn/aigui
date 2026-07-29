import { describe, expect, it } from "vitest"
import { evidence, parseEvidenceDefinition, serializeEvidenceFence } from "./index"

const one = { queries: [{ query: "SELECT count(*) FROM sales", rows: 1, ms: 12, source: "shop" }] }

describe("parseEvidenceDefinition", () => {
  it("accepts a host-written block", () => {
    const result = parseEvidenceDefinition(JSON.stringify(one))
    expect(result).toMatchObject({ valid: true })
    if (!result.valid) return
    expect(result.data.queries[0]).toMatchObject({ query: "SELECT count(*) FROM sales", rows: 1, ok: true })
  })

  it("defaults ok to true and keeps a failure with its error", () => {
    const result = parseEvidenceDefinition(
      JSON.stringify({ queries: [{ query: "SELECT 1", ok: false, error: "boom" }] }),
    )
    expect(result).toMatchObject({ valid: true })
    if (!result.valid) return
    expect(result.data.queries[0]).toMatchObject({ ok: false, error: "boom" })
  })

  it("rejects malformed input", () => {
    expect(parseEvidenceDefinition("not json")).toMatchObject({ valid: false })
    expect(parseEvidenceDefinition(JSON.stringify({ queries: [] }))).toMatchObject({ valid: false })
    expect(parseEvidenceDefinition(JSON.stringify({ queries: [{}] }))).toMatchObject({ valid: false })
    expect(parseEvidenceDefinition(JSON.stringify({ queries: [{ query: "x", rows: -1 }] }))).toMatchObject({
      valid: false,
    })
    expect(parseEvidenceDefinition(JSON.stringify({ queries: [{ query: "x" }], oops: 1 }))).toMatchObject({
      valid: false,
    })
  })
})

describe("evidence plugin", () => {
  it("claims the evidence fence and renders a disclosure", () => {
    const plugin = evidence()
    expect(Object.keys(plugin.nodeRenderers ?? {})).toEqual(["evidence"])
    const out = plugin.nodeRenderers!.evidence({
      type: "evidence",
      content: JSON.stringify(one),
      complete: true,
    } as never)
    expect(out).toMatchObject({ kind: "element", tag: "details" })
  })

  it("holds back until the fence is complete", () => {
    const plugin = evidence()
    const out = plugin.nodeRenderers!.evidence({ type: "evidence", content: "{", complete: false } as never)
    expect(out).toMatchObject({ kind: "element", tag: "div" })
  })

  it("escapes markup found in a query", () => {
    const plugin = evidence()
    const out = plugin.nodeRenderers!.evidence({
      type: "evidence",
      content: JSON.stringify({ queries: [{ query: "SELECT '<img onerror=x>'" }] }),
      complete: true,
    } as never)
    expect(JSON.stringify(out)).not.toContain("<img")
  })

  it("tells the model to leave the fence to the host", () => {
    expect(evidence().promptSpec).toContain("Never emit")
  })
})

describe("serializeEvidenceFence", () => {
  it("round-trips through the parser", () => {
    const fence = serializeEvidenceFence(one)
    expect(fence.startsWith("```evidence")).toBe(true)
    const body = fence.split("\n")[1]
    expect(parseEvidenceDefinition(body!)).toMatchObject({ valid: true })
  })
})
