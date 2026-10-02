import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { describeFeedback, readFeedback, startPageServer, type PageServer } from "./feedback"

let server: PageServer | undefined
afterEach(async () => {
  await server?.close()
  server = undefined
})

describe("the page server", () => {
  it("serves pages, takes comments, and hands each to the agent once", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aigui-fb-"))
    await writeFile(join(dir, "p.html"), "<h1>hi</h1>")
    server = await startPageServer(dir)
    expect(server.urlFor(join(dir, "p.html"))).toBe(`http://127.0.0.1:${server.port}/pages/p.html`)
    expect(await (await fetch(server.urlFor(join(dir, "p.html")))).text()).toBe("<h1>hi</h1>")
    const post = (body: unknown) => fetch(`http://127.0.0.1:${server!.port}/feedback`, { method: "POST", body: JSON.stringify(body) })
    expect((await post({ page: "../../p.html", block: 2, kind: "chart", excerpt: "Q1 Q2", comment: "  make it red  " })).status).toBe(204)
    expect((await post({ page: "p.html", comment: "" })).status).toBe(400)
    const items = await readFeedback(dir)
    expect(items).toMatchObject([{ page: "p.html", block: 2, kind: "chart", comment: "make it red" }])
    expect(describeFeedback(items)).toContain('- p.html, block 2 (chart: "Q1 Q2"): make it red')
    expect(await readFeedback(dir)).toEqual([])
  })

  it("serves nothing outside the pages directory, and not the comments themselves", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aigui-fb-"))
    server = await startPageServer(dir)
    const status = async (path: string) => (await fetch(`http://127.0.0.1:${server!.port}${path}`)).status
    expect(await status("/pages/..%2F..%2Fetc%2Fpasswd")).toBe(403)
    expect(await status("/pages/feedback.jsonl")).toBe(403)
    expect(await status("/etc/passwd")).toBe(404)
    expect(await status("/ping")).toBe(200)
  })
})
