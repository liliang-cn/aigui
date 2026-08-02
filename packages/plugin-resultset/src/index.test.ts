import { describe, expect, it } from "vitest"
import {
  parseResultsetDefinition,
  resultset,
  resultsetPromptSpec,
  serializeResultsetFence,
} from "./index"

const render = (content: string, complete = true) => {
  const plugin = resultset()
  const r = plugin.nodeRenderers?.resultset
  if (!r) throw new Error("no renderer")
  return r({ type: "resultset", content, complete } as never, {} as never)
}

const html = (out: unknown): string => JSON.stringify(out)

describe("parse", () => {
  it("accepts a table the host wrote", () => {
    const r = parseResultsetDefinition(
      JSON.stringify({ id: "by_city", columns: ["city", "n"], rows: [["Shanghai", 2], ["Beijing", 1]] }),
    )
    expect(r.valid).toBe(true)
    if (r.valid) {
      expect(r.data.columns).toEqual(["city", "n"])
      expect(r.data.rows).toHaveLength(2)
      expect(r.data.id).toBe("by_city")
    }
  })

  // A row that does not match the header puts a number under the wrong column —
  // the exact failure this plugin exists to make impossible.
  it("rejects a row whose width does not match the header", () => {
    const r = parseResultsetDefinition(
      JSON.stringify({ columns: ["a", "b"], rows: [[1, 2], [3]] }),
    )
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.issues.join(" ")).toContain("expected 2")
  })

  it("rejects malformed input rather than rendering something plausible", () => {
    expect(parseResultsetDefinition("not json").valid).toBe(false)
    expect(parseResultsetDefinition("[]").valid).toBe(false)
    expect(parseResultsetDefinition(JSON.stringify({ columns: [], rows: [] })).valid).toBe(false)
    expect(parseResultsetDefinition(JSON.stringify({ columns: ["a"], rows: [[{}]] })).valid).toBe(false)
    expect(parseResultsetDefinition(JSON.stringify({ columns: ["a"], rows: [], oops: 1 })).valid).toBe(false)
  })

  it("keeps null distinct from an empty string", () => {
    const r = parseResultsetDefinition(JSON.stringify({ columns: ["a"], rows: [[null], [""]] }))
    expect(r.valid).toBe(true)
    if (r.valid) expect(r.data.rows).toEqual([[null], [""]])
  })
})

describe("render", () => {
  it("renders a table with the rows verbatim", () => {
    const out = html(render(JSON.stringify({
      label: "Orders by city", columns: ["city", "amount"],
      rows: [["Shanghai", 4624290], ["Beijing", 1200.5]],
    })))
    expect(out).toContain("Orders by city")
    expect(out).toContain("Shanghai")
    // Grouped, not exponential: a column of numbers has to be comparable at a glance.
    expect(out).toContain("4,624,290")
    expect(out).toContain("1,200.5")
  })

  // A table that grows a row at a time reads, mid-stream, as one that is done.
  it("shows nothing until the fence is complete", () => {
    const out = html(render(JSON.stringify({ columns: ["a"], rows: [[1]] }), false))
    expect(out).toContain("resultset-loading")
    expect(out).not.toContain("<td")
  })

  it("says so when rows were cut", () => {
    const out = html(render(JSON.stringify({
      columns: ["a"], rows: [[1], [2]], truncated: true,
    })))
    expect(out).toContain("more rows exist")
  })

  it("escapes cell content — a database cell is data, never markup", () => {
    const out = html(render(JSON.stringify({
      columns: ["note"], rows: [["<img src=x onerror=alert(1)>"]],
    })))
    expect(out).toContain("&lt;img")
    expect(out).not.toContain("<img src=x")
  })

  it("reports invalid input instead of rendering a blank table", () => {
    expect(html(render("{"))).toContain("resultset-invalid")
  })
})

describe("host ownership", () => {
  it("tells the model not to write the fence or retype the numbers", () => {
    const spec = resultsetPromptSpec()
    expect(spec).toContain("Never emit a ```resultset fence")
    expect(spec).toContain("Do not retype figures")
  })

  it("round-trips a fence the host serialized", () => {
    const def = { id: "q1", columns: ["n"], rows: [[3564]] }
    const fence = serializeResultsetFence(def)
    expect(fence.startsWith("```resultset")).toBe(true)
    const body = fence.split("\n")[1] ?? ""
    const parsed = parseResultsetDefinition(body)
    expect(parsed.valid).toBe(true)
    if (parsed.valid) expect(parsed.data.rows).toEqual([[3564]])
  })
})
