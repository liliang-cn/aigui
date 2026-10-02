import { readFileSync } from "node:fs"
import { mkdtemp, readFile, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { describe, expect, it } from "vitest"
import { awaitSetup, ensureHeadlessShell } from "./browser"
import { createServer, type ServerDeps } from "./server"

async function connect(deps: ServerDeps = {}) {
  // Never the real installer here: in CI it would download a browser.
  // Nor a real page check: it would launch a browser for every aigui_open.
  const server = createServer({ setup: async () => true, inspect: false, ...deps })
  const client = new Client({ name: "test", version: "0" })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(a), client.connect(b)])
  return client
}

type Content = Array<{ type: string; text?: string; data?: string; mimeType?: string }>
const text = (result: { content: unknown }) => (result.content as Content).filter((c) => c.type === "text").map((c) => c.text).join("\n")

describe("the aigui MCP server", () => {
  it("offers exactly the six tools", async () => {
    const client = await connect()
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual(["aigui_edit", "aigui_export", "aigui_guide", "aigui_open", "aigui_render", "aigui_topology"])
    // The workflow an agent follows is in the descriptions, since that is all it sees before it decides to draw.
    for (const tool of tools.filter((t) => t.name === "aigui_render" || t.name === "aigui_open")) expect(tool.description).toContain("aigui_guide first")
  })

  it("lists the blocks when asked for no syntax, marking the ones that are page-only", async () => {
    const result = await (await connect()).callTool({ name: "aigui_guide", arguments: {} })
    const listing = text(result)
    expect(listing).toContain("- scene (```scene):")
    expect(listing).toMatch(/- solid \(```solid\) \[page only\]/)
    expect(listing).not.toMatch(/- chart[^\n]*page only/)
  })

  it("returns the same spec a browser's system prompt carries, for the blocks named", async () => {
    const result = await (await connect()).callTool({ name: "aigui_guide", arguments: { blocks: ["gravity", "scene"], locale: "zh-CN" } })
    const spec = text(result)
    expect(spec).toContain("```gravity")
    expect(spec).toContain("```scene")
    expect(spec).toContain("引力")
    expect(spec).not.toContain("```bigscreen")
  })

  it("says which names it does not know rather than guessing", async () => {
    const result = await (await connect()).callTool({ name: "aigui_guide", arguments: { blocks: ["charts"] } })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain("Unknown block charts")
  })

  it("writes a page with the viewer beside it, and embeds the answer so it cannot break out of its tag", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-mcp-"))
    const client = await connect({ outDir, open: false })
    const markdown = "# Hi\n\nA page that mentions </script><img src=x onerror=alert(1)>.\n\n```chart\n{\"series\":[{\"type\":\"bar\",\"data\":[1,2]}]}\n```"
    const result = await client.callTool({ name: "aigui_open", arguments: { markdown, title: "测试 Page" } })
    expect(result.isError).toBeFalsy()
    const files = await readdir(join(outDir, "pages"))
    const viewer = files.find((f) => /^aigui-viewer-\d/.test(f))!
    expect(await readdir(join(outDir, "pages", viewer))).toEqual(expect.arrayContaining(["core.js", "echarts.js", "katex.js"]))
    const page = files.find((f) => f.endsWith(".html"))!
    expect(page).toMatch(/-测试-page\.html$/)
    const html = await readFile(join(outDir, "pages", page), "utf8")
    expect(html).toContain("<title>测试 Page</title>")
    expect(html).toContain(`<script src="./${viewer}/core.js"></script>`)
    // One closing script tag for the data block and one for the viewer — none smuggled in by the answer.
    expect(html.match(/<\/script>/g)).toHaveLength(2)
    const data = html.match(/<script type="application\/json" id="aigui-data">(.*?)<\/script>/s)![1]
    expect(JSON.parse(data).markdown).toBe(markdown)
    // KaTeX's fonts ride inline: a file:// page cannot load them from beside itself.
    expect(html).toContain("data:font/woff2;base64,")
    expect(text(result)).toContain(join(outDir, "pages", page))
  })

  it("says what a look over the opened page found, so the agent can fix it", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-mcp-"))
    const seen: string[] = []
    const client = await connect({
      outDir,
      open: false,
      inspect: async (url) => {
        seen.push(url)
        return [{ block: "scene", kind: "plugin", message: "2 labels sit on another label or object" }]
      },
    })
    const result = await client.callTool({ name: "aigui_open", arguments: { markdown: "# x" } })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatch(/^file:/)
    expect(text(result)).toContain("! scene: 2 labels sit on another label or object")
    const clean = await (await connect({ outDir, open: false, inspect: async () => [] })).callTool({ name: "aigui_open", arguments: { markdown: "# x" } })
    expect(text(clean)).toContain("no problems found")
    // A check that cannot run is said, not fatal: the page is already open in front of the user.
    const broken = await (await connect({ outDir, open: false, inspect: async () => { throw new Error("no browser") } })).callTool({ name: "aigui_open", arguments: { markdown: "# x" } })
    expect(broken.isError).toBeFalsy()
    expect(text(broken)).toContain("Not checked")
  })

  it("writes the page's own words in English unless asked for another language, and keeps it on edit", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-mcp-"))
    const client = await connect({ outDir, open: false })
    await client.callTool({ name: "aigui_open", arguments: { markdown: "# a", title: "en" } })
    const html = async (suffix: string) => readFile(join(outDir, "pages", (await readdir(join(outDir, "pages"))).find((f) => f.endsWith(suffix))!), "utf8")
    expect(await html("-en.html")).toContain('<html lang="en"')
    expect(await html("-en.html")).toContain("All pages")
    await client.callTool({ name: "aigui_open", arguments: { markdown: "# b x", title: "zh", locale: "zh-CN" } })
    expect(await html("-zh.html")).toContain("全部页面")
    await client.callTool({ name: "aigui_edit", arguments: { edits: [{ find: "b x", replace: "b y" }] } })
    expect(await html("-zh.html")).toContain('<html lang="zh-CN"')
  })

  it("keeps a history of pages, newest first, and links it from every page", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-mcp-"))
    const client = await connect({ outDir, open: false })
    await client.callTool({ name: "aigui_open", arguments: { markdown: "# one", title: "第一页" } })
    const second = await client.callTool({ name: "aigui_open", arguments: { markdown: "# two", title: "Second <page>" } })
    expect(text(second)).toMatch(/All pages: file:.*\/pages\/index\.html/)
    const index = await readFile(join(outDir, "pages", "index.html"), "utf8")
    expect(index.indexOf("Second &lt;page&gt;")).toBeLessThan(index.indexOf("第一页"))
    const page = (await readdir(join(outDir, "pages"))).find((f) => f.endsWith("-second-page.html"))!
    expect(await readFile(join(outDir, "pages", page), "utf8")).toContain('href="./index.html"')
  })

  it("edits the last page in place by find and replace, and refuses an edit that does not name one place", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-mcp-"))
    const client = await connect({ outDir, open: false })
    await client.callTool({ name: "aigui_open", arguments: { markdown: '# Sales\n\n```chart\n{"series":[{"type":"bar","data":[1,2]}]}\n```\n\nA and A.', title: "Sales" } })
    const files = async () => (await readdir(join(outDir, "pages"))).filter((f) => f.endsWith(".html") && f !== "index.html")
    const [page] = await files()
    const edited = await client.callTool({ name: "aigui_edit", arguments: { edits: [{ find: '"data":[1,2]', replace: '"data":[1,2,3]' }] } })
    expect(edited.isError).toBeFalsy()
    expect(text(edited)).toContain(`Edited ${page} (1 change)`)
    expect(await files()).toEqual([page])
    const html = await readFile(join(outDir, "pages", page), "utf8")
    expect(html).toContain('\\"data\\":[1,2,3]')
    expect(html).toContain("<title>Sales</title>")
    const twice = await client.callTool({ name: "aigui_edit", arguments: { edits: [{ find: "A", replace: "B" }] } })
    expect(twice.isError).toBe(true)
    expect(text(twice)).toMatch(/occurs \d+ times/)
    const missing = await client.callTool({ name: "aigui_edit", arguments: { page, edits: [{ find: "nowhere", replace: "x" }] } })
    expect(text(missing)).toContain("does not occur in the page")
  })

  it("exports the last page beside it, as PNG by default", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-mcp-"))
    const calls: Array<{ url: string; format: string; path: string }> = []
    const client = await connect({ outDir, open: false, exportFile: async (url, o) => (calls.push({ url, ...o }), o.path) })
    expect(text(await client.callTool({ name: "aigui_export", arguments: {} }))).toContain("no page to export yet")
    await client.callTool({ name: "aigui_open", arguments: { markdown: "# x", title: "Report" } })
    const png = await client.callTool({ name: "aigui_export", arguments: {} })
    const pdf = await client.callTool({ name: "aigui_export", arguments: { format: "pdf" } })
    expect(calls.map((c) => c.format)).toEqual(["png", "pdf"])
    expect(calls[0].url).toMatch(/^file:.*-report\.html$/)
    expect(calls[1].path).toMatch(/-report\.pdf$/)
    expect(text(png)).toMatch(/Saved .*-report\.png/)
    expect(text(pdf)).toMatch(/Saved .*-report\.pdf/)
  })

  it("fills a page's blocks from data files and says where the numbers came from", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-mcp-"))
    const csv = join(outDir, "q.csv")
    const { writeFile } = await import("node:fs/promises")
    await writeFile(csv, "q,v\nQ1,3\nQ2,7\n")
    const client = await connect({ outDir, open: false })
    const markdown = '```chart\n{"xAxis":{"type":"category","data":{"$data":"q","column":"q"}},"yAxis":{"type":"value"},"series":[{"type":"bar","data":{"$data":"q","column":"v"}}]}\n```'
    const result = await client.callTool({ name: "aigui_open", arguments: { markdown, title: "data", data: { q: csv } } })
    expect(text(result)).toContain(`- chart: ${csv} (2 rows)`)
    const page = (await readdir(join(outDir, "pages"))).find((f) => f.endsWith("-data.html"))!
    const html = await readFile(join(outDir, "pages", page), "utf8")
    expect(html).toContain('[\\"Q1\\",\\"Q2\\"]')
    expect(html).toContain("*Data: q.csv (2 rows)*")
    const missing = await client.callTool({ name: "aigui_open", arguments: { markdown } })
    expect(missing.isError).toBe(true)
    expect(text(missing)).toContain("no data files were given")
  })

  it("exports a page as one file carrying only the packs it uses", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-mcp-"))
    const client = await connect({ outDir, open: false })
    await client.callTool({ name: "aigui_open", arguments: { markdown: "# x\n\n```mermaid\ngraph TD; A-->B\n```\n\nIt mentions </script> in prose.", title: "one" } })
    const result = await client.callTool({ name: "aigui_export", arguments: { format: "html" } })
    const out = text(result).match(/Saved (\S+\.html)/)![1]
    const html = await readFile(out, "utf8")
    expect(html).not.toContain('src="./aigui-viewer')
    expect([...html.matchAll(/data-aigui-pack="(\w+)"/g)].map((m) => m[1])).toEqual(["mermaid", "core"])
    // Exactly the data block's, the two inlined scripts' closing tags — nothing ended early.
    expect(html.match(/<\/script>/g)).toHaveLength(3)
  })

  it("records the last page as a GIF or WebM beside it", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-mcp-"))
    const calls: Array<{ format: string; path: string }> = []
    const client = await connect({ outDir, open: false, recordAnimation: async (_url, o) => (calls.push(o), o.path) })
    await client.callTool({ name: "aigui_open", arguments: { markdown: "# x", title: "Flow" } })
    const gif = await client.callTool({ name: "aigui_export", arguments: { format: "gif" } })
    await client.callTool({ name: "aigui_export", arguments: { format: "webm" } })
    expect(calls.map((c) => c.format)).toEqual(["gif", "webm"])
    expect(calls[0].path).toMatch(/-flow\.gif$/)
    expect(text(gif)).toMatch(/Saved .*-flow\.gif/)
  })

  it("refuses markdown with nothing drawable instead of launching a browser for it", async () => {
    let launched = false
    const client = await connect({
      acquire: async () => {
        launched = true
        throw new Error("should not launch")
      },
    })
    const result = await client.callTool({ name: "aigui_render", arguments: { markdown: "Just prose, and ```solid is page-only anyway." } })
    expect(result.isError).toBe(true)
    expect(launched).toBe(false)
    expect(text(result)).toContain("aigui_open")
  })

  it("turns a missing browser into advice the agent can relay", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-mcp-"))
    const client = await connect({
      outDir,
      acquire: async () => {
        throw new Error("browserType.launch: Executable doesn't exist at /x/chromium")
      },
    })
    const result = await client.callTool({ name: "aigui_render", arguments: { markdown: "```mermaid\ngraph TD; A-->B;\n```" } })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain("npx playwright install chromium")
  })
})

describe("the background browser download", () => {
  it("is skipped when the host pinned a browser or opted out", async () => {
    await expect(ensureHeadlessShell({ AIGUI_BROWSER_CHANNEL: "chrome" })).resolves.toBe(false)
    await expect(ensureHeadlessShell({ AIGUI_NO_BROWSER_DOWNLOAD: "1" })).resolves.toBe(false)
  })

  it("is waited for, but only so long", async () => {
    expect(await awaitSetup(async () => true, 1000)).toBe("ready")
    expect(await awaitSetup(async () => false, 1000)).toBe("failed")
    expect(await awaitSetup(() => new Promise(() => {}), 20)).toBe("pending")
  })

  it("says so when a picture was drawn before the download finished", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-mcp-"))
    const client = await connect({
      outDir,
      setup: () => new Promise(() => {}),
      setupWaitMs: 50,
      acquire: async () => {
        throw new Error("Executable doesn't exist")
      },
    })
    // The render still goes ahead after the wait — here it fails for want of a browser, and the
    // advice is the missing-browser one, not a hang.
    const result = await client.callTool({ name: "aigui_render", arguments: { markdown: "```mermaid\ngraph TD; A-->B;\n```" } })
    expect(text(result)).toContain("npx playwright install chromium")
  })
})

describe.skipIf(process.env.AIGUI_IMAGE_E2E !== "1")("aigui_render (real browser)", () => {
  it("returns the PNGs inline and on disk", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-mcp-e2e-"))
    let shown: string[] = []
    const client = await connect({ outDir, showImages: (paths) => ((shown = paths), true) })
    const markdown = [
      "```chart\n{\"xAxis\":{\"type\":\"category\",\"data\":[\"A\",\"B\"]},\"yAxis\":{\"type\":\"value\"},\"series\":[{\"type\":\"bar\",\"data\":[3,7]}]}\n```",
      "```scene\n{\"objects\":[{\"shape\":\"box\",\"size\":[2,1,1],\"anchor\":\"bottom\",\"color\":\"wheat\"}]}\n```",
    ].join("\n\n")
    const result = await client.callTool({ name: "aigui_render", arguments: { markdown } })
    const content = result.content as Content
    expect(result.isError).toBeFalsy()
    expect(content.filter((c) => c.type === "image")).toHaveLength(2)
    expect(content[1].mimeType).toBe("image/png")
    expect(text(result)).toMatch(/Drew 2 pictures/)
    // Shown to the person too, and the agent is told so it does not also paste the paths.
    expect(shown).toHaveLength(2)
    expect(text(result)).toContain("open in the user's image viewer")
  }, 90_000)
})

describe.skipIf(process.env.AIGUI_IMAGE_E2E !== "1")("aigui_open (real browser)", () => {
  /**
   * The page path of the stacked-labels regression: the same scene the PNG test draws, written by
   * aigui_open and opened the way a person's browser would open it — from a file, with the viewer
   * bundle beside it. Each scene reports on its label layer how many labels it drew and how many
   * sit on another label or another object.
   */
  it("lays out a stacked scene's labels without overlaps on the page", async () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const sided = readFileSync(join(here, "../../plugin-scene/src/fixtures/regression/stacked-labels.json"), "utf8")
    const { camera: _camera, ...framed } = JSON.parse(sided)
    const outDir = await mkdtemp(join(tmpdir(), "aigui-mcp-labels-"))
    const client = await connect({ outDir, open: false, inspect: undefined })
    const markdown = ["```scene\n" + sided + "\n```", "```scene\n" + JSON.stringify(framed) + "\n```"].join("\n\n")
    const result = await client.callTool({ name: "aigui_open", arguments: { markdown, title: "labels" } })
    const path = text(result).match(/Wrote (\S+\.html)/)![1]
    // The server's own look over the page agrees before the test looks for itself.
    expect(text(result)).toContain("no problems found")

    const { chromium } = await import("playwright")
    const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] })
    try {
      const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } })
      await page.goto(pathToFileURL(path).href)
      await page.waitForFunction(() => document.querySelectorAll("[data-aigui-scene-labels][data-overlaps]").length === 2, undefined, { timeout: 30_000 })
      // Let damping settle: the layout is redone whenever the view moves.
      await page.waitForTimeout(1500)
      const layers = await page.evaluate(() =>
        [...document.querySelectorAll("[data-aigui-scene-labels]")].map((el) => ({ labels: el.getAttribute("data-labels"), overlaps: el.getAttribute("data-overlaps") })),
      )
      expect(layers).toEqual([{ labels: "6", overlaps: "0" }, { labels: "6", overlaps: "0" }])
    } finally {
      await browser.close()
    }
  }, 90_000)

  it("records a topology playing as a GIF, every step in it", async () => {
    const { topologyPromptSpec } = await import("@ai-gui/plugin-topology")
    const block = topologyPromptSpec("en").split("```topology\n")[1]
    const outDir = await mkdtemp(join(tmpdir(), "aigui-mcp-gif-"))
    const client = await connect({ outDir, open: false })
    await client.callTool({ name: "aigui_open", arguments: { markdown: "```topology\n" + block.slice(0, block.indexOf("```")) + "```", title: "flow" } })
    const result = await client.callTool({ name: "aigui_export", arguments: { format: "gif" } })
    expect(text(result)).toMatch(/Saved/)
    const out = text(result).match(/Saved (\S+\.gif)/)![1]
    const bytes = await readFile(out)
    expect(bytes.subarray(0, 6).toString()).toBe("GIF89a")
    // One image descriptor per frame: a dozen seconds at 8 fps is far more than a handful.
    expect(bytes.filter((b, i) => b === 0x2c && bytes[i - 1] === 0x00).length).toBeGreaterThan(20)
  }, 120_000)
})
