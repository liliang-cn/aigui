import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { fillData, loadData, parseDelimited } from "./data"

async function files() {
  const dir = await mkdtemp(join(tmpdir(), "aigui-data-"))
  await writeFile(join(dir, "sales.csv"), 'month,revenue,region,id\nJan,1200,"North, upper",007\nFeb,1350,South,008\nMar,,West,009\n')
  await writeFile(join(dir, "kpi.json"), '{"target":0.8}')
  await writeFile(join(dir, "notes.txt"), "x")
  return { dir, sources: await loadData({ sales: join(dir, "sales.csv"), kpi: join(dir, "kpi.json") }) }
}
const block = (json: unknown) => "```chart\n" + JSON.stringify(json) + "\n```"
const bodyOf = (md: string) => JSON.parse(md.split("\n")[1])

describe("parseDelimited", () => {
  it("reads quoted fields, makes number columns numbers and leaves ids as text", () => {
    const rows = parseDelimited('a,b,id\n"x, y",1,007\n"say ""hi""",2.5,010\n')
    expect(rows).toEqual([{ a: "x, y", b: 1, id: "007" }, { a: 'say "hi"', b: 2.5, id: "010" }])
  })
})

describe("fillData", () => {
  it("fills rows, a column, picked columns and totals from the file", async () => {
    const { sources } = await files()
    const { markdown, provenance } = fillData(block({
      dataset: { source: { $data: "sales" } },
      x: { $data: "sales", column: "month" },
      pairs: { $data: "sales", pick: ["month", "revenue"] },
      total: { $data: "sales", sum: "revenue" },
      n: { $data: "sales", count: true },
      target: { $data: "kpi" },
    }), sources)
    const body = bodyOf(markdown)
    expect(body.dataset.source).toHaveLength(3)
    expect(body.dataset.source[0]).toEqual({ month: "Jan", revenue: 1200, region: "North, upper", id: "007" })
    expect(body.x).toEqual(["Jan", "Feb", "Mar"])
    expect(body.pairs).toEqual([["Jan", 1200], ["Feb", 1350], ["Mar", null]])
    expect(body.total).toBe(2550)
    expect(body.n).toBe(3)
    expect(body.target).toEqual({ target: 0.8 })
    expect(provenance[0].block).toBe("chart")
    expect(provenance[0].sources.map((s) => [s.name, s.rows])).toEqual([["sales", 3], ["kpi", 0]])
  })

  it("leaves blocks without references alone, and notes the source under a page's block", async () => {
    const { sources } = await files()
    const plain = block({ series: [] })
    expect(fillData(plain, sources).markdown).toBe(plain)
    const noted = fillData(block({ data: { $data: "sales", column: "revenue" } }), sources, { note: true }).markdown
    expect(noted).toContain("*Data: sales.csv (3 rows)*")
  })

  it("says exactly what is wrong with a reference", async () => {
    const { sources } = await files()
    const err = (ref: unknown) => {
      try {
        fillData(block({ v: ref }), sources)
        return ""
      } catch (e) {
        return (e as Error).message
      }
    }
    expect(err({ $data: "nope" })).toBe('no data named "nope" — pass it in data: {"nope": "/path/to/file.csv"}')
    expect(err({ $data: "sales", column: "profit" })).toBe('data "sales" has no column "profit" — it has month, revenue, region, id')
    expect(err({ $data: "sales", filter: "x" })).toMatch(/unknown key "filter"/)
    expect(err({ $data: "sales", sum: "region" })).toBe('data "sales" column "region" has no numbers to sum')
    expect(err({ $data: "kpi", column: "target" })).toMatch(/is a JSON value, not a list of rows/)
  })

  it("reads only absolute paths to csv, tsv and json files", async () => {
    const { dir } = await files()
    await expect(loadData({ a: "sales.csv" })).rejects.toThrow("give an absolute path")
    await expect(loadData({ a: join(dir, "notes.txt") })).rejects.toThrow("only .csv, .tsv and .json")
    await expect(loadData({ a: join(dir, "missing.csv") })).rejects.toThrow("is not a file")
  })
})
