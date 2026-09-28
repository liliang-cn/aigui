import { mkdtemp, readFile, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { describe, expect, it } from "vitest"
import { awaitSetup, ensureHeadlessShell } from "./browser"
import { createServer, type ServerDeps } from "./server"

async function connect(deps: ServerDeps = {}) {
  // Never the real installer here: in CI it would download a browser.
  const server = createServer({ setup: async () => true, ...deps })
  const client = new Client({ name: "test", version: "0" })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(a), client.connect(b)])
  return client
}

type Content = Array<{ type: string; text?: string; data?: string; mimeType?: string }>
const text = (result: { content: unknown }) => (result.content as Content).filter((c) => c.type === "text").map((c) => c.text).join("\n")

describe("the aigui MCP server", () => {
  it("offers exactly the three tools", async () => {
    const client = await connect()
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual(["aigui_guide", "aigui_open", "aigui_render"])
    // The workflow an agent follows is in the descriptions, since that is all it sees before it decides to draw.
    for (const tool of tools.filter((t) => t.name !== "aigui_guide")) expect(tool.description).toContain("aigui_guide first")
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
    expect(files.some((f) => /^aigui-viewer-.+\.js$/.test(f))).toBe(true)
    const page = files.find((f) => f.endsWith(".html"))!
    expect(page).toMatch(/-测试-page\.html$/)
    const html = await readFile(join(outDir, "pages", page), "utf8")
    expect(html).toContain("<title>测试 Page</title>")
    // One closing script tag for the data block and one for the viewer — none smuggled in by the answer.
    expect(html.match(/<\/script>/g)).toHaveLength(2)
    const data = html.match(/<script type="application\/json" id="aigui-data">(.*?)<\/script>/s)![1]
    expect(JSON.parse(data).markdown).toBe(markdown)
    // KaTeX's fonts ride inline: a file:// page cannot load them from beside itself.
    expect(html).toContain("data:font/woff2;base64,")
    expect(text(result)).toContain(join(outDir, "pages", page))
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
