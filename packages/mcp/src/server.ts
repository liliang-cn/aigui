import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { closeBrowser, type InternalRenderOptions } from "@ai-gui/image"
import { z } from "zod"
import { BLOCKS } from "./blocks"
import { ensureHeadlessShell, type BrowserSetup } from "./browser"
import { guide } from "./guide"
import { writePage } from "./open"
import { packageVersion } from "./paths"
import { renderToContent, type RenderedContent } from "./render"

const PICTURE = BLOCKS.filter((block) => block.picture).map((block) => block.name).join(", ")
const ALL = BLOCKS.map((block) => block.name).join(", ")

export interface ServerDeps {
  /** Injected in tests: the browser behind aigui_render. */
  acquire?: InternalRenderOptions["acquire"]
  /** Injected in tests: where files go, and whether a browser window is opened. */
  outDir?: string
  open?: boolean
  /** The background download of the headless browser. Default: Playwright's installer. */
  setup?: BrowserSetup
  /** How long a render waits for that download before going ahead. Default 60 s. */
  setupWaitMs?: number
}

export type ToolResult = RenderedContent

const failure = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true })

/**
 * What each tool does, apart from the protocol around it.
 *
 * Exported because the Claude Code plugin's launcher answers the protocol itself while this
 * package is still being installed on first use, and then calls straight into here — so the two
 * paths cannot disagree about what a tool returns.
 */
export async function callTool(name: string, args: Record<string, unknown>, deps: ServerDeps = {}): Promise<ToolResult> {
  const str = (key: string) => (typeof args[key] === "string" ? (args[key] as string) : undefined)
  const theme = str("theme") === "light" || str("theme") === "dark" ? (str("theme") as "light" | "dark") : undefined
  switch (name) {
    case "aigui_guide":
      try {
        const blocks = Array.isArray(args.blocks) ? args.blocks.filter((b): b is string => typeof b === "string") : undefined
        return { content: [{ type: "text", text: await guide(blocks, str("locale")) }] }
      } catch (error) {
        return failure(String((error as Error).message))
      }
    case "aigui_render": {
      const markdown = str("markdown")
      if (!markdown) return failure("markdown is required.")
      const width = typeof args.width === "number" ? args.width : undefined
      return renderToContent(markdown, {
        theme,
        width,
        outDir: deps.outDir,
        acquire: deps.acquire,
        setup: deps.setup ?? (() => ensureHeadlessShell()),
        setupWaitMs: deps.setupWaitMs,
      })
    }
    case "aigui_open": {
      const markdown = str("markdown")
      if (!markdown) return failure("markdown is required.")
      try {
        const page = await writePage(markdown, { title: str("title"), theme, outDir: deps.outDir, open: deps.open })
        const text = page.opened ? `Opened ${page.url}\nFile: ${page.path}` : `Wrote ${page.path} — open ${page.url} in a browser.`
        return { content: [{ type: "text", text }] }
      } catch (error) {
        return failure(`Could not write the page: ${String((error as Error).message)}`)
      }
    }
    default:
      return failure(`Unknown tool ${name}.`)
  }
}

/**
 * The three tools.
 *
 * The descriptions carry the workflow, because they are all an agent sees before it decides to
 * draw: read the syntax first, then pick the picture or the page. They do not carry the syntax
 * itself — that is aigui_guide's job, fetched only for the blocks about to be written.
 */
export function createServer(deps: ServerDeps = {}): McpServer {
  const server = new McpServer({ name: "aigui", version: packageVersion() })

  server.registerTool(
    "aigui_guide",
    {
      title: "How to write AIGUI blocks",
      description: [
        "Get the exact syntax for AIGUI blocks before writing any. Call with no arguments for the list of blocks, then with the names you will use.",
        `Blocks: ${ALL}.`,
        "Each block is a fenced code block of JSON (or mermaid text, or $$ maths) inside ordinary markdown. The rules matter: most blocks take conditions, not results, and compute the numbers themselves.",
      ].join(" "),
      inputSchema: {
        blocks: z.array(z.string()).optional().describe("Block names to get the syntax for, e.g. [\"chart\", \"scene\"]. Omit for the list."),
        locale: z.enum(["en", "zh-CN"]).optional().describe("Language of the guidance. Default en."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => callTool("aigui_guide", args, deps),
  )

  server.registerTool(
    "aigui_render",
    {
      title: "Draw AIGUI blocks as PNG",
      description: [
        "Draw the AIGUI blocks in a markdown string as PNG images and return them.",
        `Draws: ${PICTURE}, and markdown tables. Anything else in the markdown is ignored.`,
        "Use it when a picture answers better than text — a chart of numbers, a diagram of a flow, a 3D shape, an orbit, a molecule. The images come back to you and are saved to disk; tell the user the paths.",
        "Call aigui_guide first for the syntax of any block you have not written in this session.",
      ].join(" "),
      inputSchema: {
        markdown: z.string().min(1).describe("Markdown containing one or more AIGUI blocks."),
        theme: z.enum(["light", "dark"]).optional(),
        width: z.number().int().min(320).max(1600).optional().describe("Picture width in CSS pixels. Default 720; use ~1100 for a bigscreen."),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async (args) => callTool("aigui_render", args, deps),
  )

  server.registerTool(
    "aigui_open",
    {
      title: "Open AIGUI blocks in the browser",
      description: [
        "Write a markdown answer with AIGUI blocks to an HTML page and open it in the user's browser, where charts are interactive, 3D scenes and molecules can be turned, and walls and orbits animate.",
        `Draws every block: ${ALL}, plus maths, tables and code.`,
        "Use it for a long answer that is mostly visual, for anything the user will want to explore, or for a [page only] block. Returns the file path.",
        "Call aigui_guide first for the syntax of any block you have not written in this session.",
      ].join(" "),
      inputSchema: {
        markdown: z.string().min(1).describe("The whole answer: prose and AIGUI blocks."),
        title: z.string().max(120).optional().describe("Page title."),
        theme: z.enum(["light", "dark"]).optional().describe("Default: follow the system setting."),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async (args) => callTool("aigui_open", args, deps),
  )

  return server
}

/** Run over stdio, the way Claude Code starts an MCP server, and shut the browser down with it. */
export async function main(): Promise<void> {
  const server = createServer()
  const shutdown = async () => {
    await closeBrowser().catch(() => {})
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
  process.stdin.on("close", shutdown)
  await server.connect(new StdioServerTransport())
  // After connecting, never before: the first download can take minutes, and Claude Code gives
  // a server about thirty seconds to answer. The first picture waits for it; nothing else does.
  void ensureHeadlessShell()
}
