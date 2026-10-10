import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { basename, dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import { closeBrowser, exportAnimation, exportBlock, exportPage, inspectPage, type InternalRenderOptions, type Issue } from "@ai-gui/image"
import { z } from "zod"
import { BLOCKS } from "./blocks"
import { ensureHeadlessShell, type BrowserSetup } from "./browser"
import { guide } from "./guide"
import { ensureViewer, openFiles, standalonePage, writePage } from "./open"
import { applyEdits, readPage, resolvePage } from "./pages"
import { describeProvenance, fillData, loadData, type Provenance } from "./data"
import { importTopology } from "./topology-import"
import { customPluginDir, loadCustomPlugins, type CustomPlugin } from "@ai-gui/cli"
import { describeFeedback, readFeedback, startPageServer, type PageServer } from "./feedback"
import { mkdir } from "node:fs/promises"
import { outputRoot, packageVersion } from "./paths"
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
  /**
   * Look over a page aigui_open wrote, in the headless browser, before saying it is done. Default:
   * `inspectPage` from @ai-gui/image; tests inject a stand-in, or `false` to skip it.
   */
  inspect?: ((url: string) => Promise<Issue[]>) | false
  /**
   * Open aigui_render's PNGs on the user's screen as well. Default: on when `AIGUI_OPEN_IMAGES=1`,
   * which the Claude Code plugin sets — its terminal cannot show an image, so without this only
   * the agent ever sees the picture. Off elsewhere: a client that shows images inline would get
   * every picture twice.
   */
  showImages?: (paths: string[]) => boolean
  /** Injected in tests: how a page becomes a PNG or PDF. Default `exportPage` from @ai-gui/image. */
  exportFile?: (url: string, options: { format: "png" | "pdf"; path: string; theme?: "light" | "dark" }) => Promise<string>
  /** Injected in tests: how a page becomes a GIF or WebM. Default `exportAnimation` from @ai-gui/image. */
  /** Where custom blocks are read from. Default `AIGUI_PLUGIN_DIR` or ~/.config/aigui/plugins. */
  customDir?: string
  /**
   * The custom blocks installed when the server started, named in the tool descriptions. Measured:
   * listed only by aigui_guide, a custom block was used in 5 of 9 runs — the agent that never
   * called aigui_guide without arguments never learned it existed.
   */
  announce?: readonly CustomPlugin[]
  /** The page server `main` starts: pages opened through it can take the reader's comments. */
  pageServer?: PageServer
  recordAnimation?: (url: string, options: { format: "gif" | "webm"; path: string; theme?: "light" | "dark" }) => Promise<string>
}

function defaultShowImages(): ((paths: string[]) => boolean) | undefined {
  return process.env.AIGUI_OPEN_IMAGES === "1" && process.env.AIGUI_NO_OPEN !== "1" ? openFiles : undefined
}

export type ToolResult = RenderedContent

/**
 * Fill `{"$data": …}` references from the files the agent named, or say why not.
 * Markdown that references data without naming any files is refused, not drawn half-empty.
 */
async function withData(markdown: string, data: unknown, note: boolean): Promise<{ markdown: string; provenance: Provenance[] } | { error: string }> {
  const files = data && typeof data === "object" && !Array.isArray(data) ? (Object.fromEntries(Object.entries(data).filter(([, v]) => typeof v === "string")) as Record<string, string>) : undefined
  if (!files || Object.keys(files).length === 0) {
    return markdown.includes('"$data"') ? { error: 'The markdown references {"$data": …} but no data files were given — pass data: {"name": "/absolute/path.csv"}.' } : { markdown, provenance: [] }
  }
  try {
    return fillData(markdown, await loadData(files), { note })
  } catch (error) {
    return { error: String((error as Error).message) }
  }
}

/** Names a custom block may not take: every built-in block and fence. */
const RESERVED = [...BLOCKS.map((b) => b.name), "list", "table", "key-value", "layout", "sources", "flashcards", "card", "math"]

/** The custom blocks installed now — read on every call, so a new one works without a restart. */
async function customBlocks(deps: ServerDeps): Promise<{ plugins: CustomPlugin[]; problems: string[] }> {
  return loadCustomPlugins(deps.customDir ?? customPluginDir(), RESERVED)
}

/** The custom blocks a markdown answer actually uses. */
const usedIn = (markdown: string, plugins: readonly CustomPlugin[]) =>
  plugins.filter((p) => p.fences.some((f) => new RegExp(`^ {0,3}(\`{3,}|~{3,})[ \t]*${f}\\b`, "m").test(markdown)))

const failure = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true })

/** What to tell the agent about a page it just wrote: where it is, and where all of them are. */
function opened(page: { path: string; url: string; opened: boolean }): string {
  const head = page.opened ? `Opened ${page.url}\nFile: ${page.path}` : `Wrote ${page.path} — open ${page.url} in a browser.`
  return `${head}\nAll pages: ${pathToFileURL(join(dirname(page.path), "index.html")).href}`
}

/**
 * The page, looked over in the headless browser: what a reader would trip over, as lines the agent
 * can act on. Best effort — no browser yet, or a page that takes too long, is said and not fatal,
 * since the page is already open in front of the user.
 */
async function pageCheck(url: string, deps: ServerDeps): Promise<string> {
  if (deps.inspect === false) return ""
  const inspect = deps.inspect ?? ((target: string) => inspectPage(target, { timeoutMs: 20_000 }))
  try {
    const issues = await inspect(url)
    if (issues.length === 0) return "\nChecked in a headless browser: no problems found."
    return [
      "\nChecked in a headless browser. Problems a reader would trip over:",
      ...issues.map((issue) => `! ${issue.block}: ${issue.message}`),
      "Fix those blocks and open the page again, or tell the user what is wrong with it.",
    ].join("\n")
  } catch {
    return "\n(Not checked: no headless browser was available to look the page over.)"
  }
}

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
  const pageLocale = str("locale") === "zh-CN" ? "zh-CN" : str("locale") === "en" ? "en" : undefined
  switch (name) {
    case "aigui_guide":
      try {
        const blocks = Array.isArray(args.blocks) ? args.blocks.filter((b): b is string => typeof b === "string") : undefined
        const custom = await customBlocks(deps)
        const text = await guide(blocks, str("locale"), custom.plugins)
        const skipped = !blocks?.length && custom.problems.length > 0 ? `\n\nCustom blocks skipped (fix their folder in ${deps.customDir ?? customPluginDir()}):\n${custom.problems.map((p) => `- ${p}`).join("\n")}` : ""
        return { content: [{ type: "text", text: text + skipped }] }
      } catch (error) {
        return failure(String((error as Error).message))
      }
    case "aigui_render": {
      const given = str("markdown")
      if (!given) return failure("markdown is required.")
      const filled = await withData(given, args.data, false)
      if ("error" in filled) return failure(filled.error)
      const markdown = filled.markdown
      const width = typeof args.width === "number" ? args.width : undefined
      const used = usedIn(markdown, (await customBlocks(deps)).plugins).filter((p) => p.picture)
      const result = await renderToContent(markdown, {
        custom: used,
        theme,
        width,
        outDir: deps.outDir,
        acquire: deps.acquire,
        setup: deps.setup ?? (() => ensureHeadlessShell()),
        setupWaitMs: deps.setupWaitMs,
        show: "showImages" in deps ? deps.showImages : defaultShowImages(),
      })
      const first = result.content[0]
      if (first?.type === "text") first.text += describeProvenance(filled.provenance)
      return result
    }
    case "aigui_open": {
      const given = str("markdown")
      if (!given) return failure("markdown is required.")
      const filled = await withData(given, args.data, true)
      if ("error" in filled) return failure(filled.error)
      const markdown = filled.markdown
      try {
        const page = await writePage(markdown, { title: str("title"), theme, locale: pageLocale, outDir: deps.outDir, open: deps.open, servedAt: deps.pageServer?.urlFor, custom: usedIn(markdown, (await customBlocks(deps)).plugins) })
        return { content: [{ type: "text", text: `${opened(page)}${describeProvenance(filled.provenance)}${await pageCheck(page.url, deps)}` }] }
      } catch (error) {
        return failure(`Could not write the page: ${String((error as Error).message)}`)
      }
    }
    case "aigui_edit": {
      const pages = join(deps.outDir ?? outputRoot(), "pages")
      const path = await resolvePage(pages, str("page"))
      if (!path) return failure("There is no page to edit yet — write one with aigui_open first.")
      const edits = Array.isArray(args.edits)
        ? args.edits.filter((e): e is { find: string; replace: string } => typeof e === "object" && e !== null && typeof (e as { find?: unknown }).find === "string" && typeof (e as { replace?: unknown }).replace === "string")
        : []
      if (edits.length === 0) return failure('edits is required: [{"find": "exact text in the page", "replace": "what it becomes"}].')
      try {
        const current = await readPage(path)
        const markdown = applyEdits(current.markdown, edits)
        const page = await writePage(markdown, { title: str("title") ?? current.title, theme: theme ?? current.theme, locale: pageLocale ?? current.locale, outDir: deps.outDir, open: deps.open, path, servedAt: deps.pageServer?.urlFor, custom: usedIn(markdown, (await customBlocks(deps)).plugins) })
        return { content: [{ type: "text", text: `Edited ${basename(path)} (${edits.length} change${edits.length === 1 ? "" : "s"}). ${opened(page)}${await pageCheck(page.url, deps)}` }] }
      } catch (error) {
        return failure(`Could not edit ${basename(path)}: ${String((error as Error).message)}`)
      }
    }
    case "aigui_topology": {
      const path = str("path")
      if (!path) return failure("path is required: a docker-compose file, a Kubernetes manifest, or a directory of manifests.")
      try {
        const topology = await importTopology(path)
        const block = `\`\`\`topology\n${JSON.stringify(topology, null, 2)}\n\`\`\``
        const summary = `Read ${path}: ${topology.nodes.length} parts, ${topology.links?.length ?? 0} links.`
        if (args.open === false) return { content: [{ type: "text", text: `${summary} The block below draws it — add steps to it, or put it in an answer:\n\n${block}` }] }
        const page = await writePage(`${block}\n\n*From ${path}*`, { title: str("title") ?? topology.title, theme, locale: pageLocale, outDir: deps.outDir, open: deps.open, servedAt: deps.pageServer?.urlFor })
        return { content: [{ type: "text", text: `${summary} ${opened(page)}${await pageCheck(page.url, deps)}\n\nThe block, to add steps to or reuse:\n\n${block}` }] }
      } catch (error) {
        return failure(`Could not read a topology from ${path}: ${String((error as Error).message)}`)
      }
    }
    case "aigui_feedback": {
      const pages = join(deps.outDir ?? outputRoot(), "pages")
      const items = await readFeedback(pages, args.keep !== true)
      return { content: [{ type: "text", text: describeFeedback(items) }] }
    }
    case "aigui_export": {
      const pages = join(deps.outDir ?? outputRoot(), "pages")
      const path = await resolvePage(pages, str("page"))
      if (!path) return failure("There is no page to export yet — write one with aigui_open first.")
      if (str("format") === "html") {
        try {
          const out = await standalonePage(path)
          return { content: [{ type: "text", text: `Saved ${out} — one file with everything it needs; it opens anywhere, offline, and stays interactive.` }] }
        } catch (error) {
          return failure(`Could not export ${basename(path)}: ${String((error as Error).message)}`)
        }
      }
      if (str("format") === "gif" || str("format") === "webm") {
        const motion = str("format") as "gif" | "webm"
        const out = join(dirname(path), basename(path).replace(/\.html$/, `.${motion}`))
        try {
          await ensureViewer(dirname(path))
          const record = deps.recordAnimation ?? ((url: string, o: { format: "gif" | "webm"; path: string; theme?: "light" | "dark" }) => exportAnimation(url, o))
          await record(pathToFileURL(path).href, { format: motion, path: out, theme })
          const shown = deps.open !== false && process.env.AIGUI_NO_OPEN !== "1" && openFiles([out])
          return { content: [{ type: "text", text: `Saved ${out} — one play of the page${shown ? ", open on the user's screen" : ""}.` }] }
        } catch (error) {
          return failure(`Could not record ${basename(path)}: ${String((error as Error).message)}. aigui_export needs the headless browser aigui_render uses.`)
        }
      }
      const format = str("format") === "pdf" ? "pdf" : "png"
      const out = join(dirname(path), basename(path).replace(/\.html$/, `.${format}`))
      try {
        // The page names its viewer by version; a page written before this build updated it would
        // otherwise be exported with the old one.
        await ensureViewer(dirname(path))
        const run = deps.exportFile ?? ((url: string, o: { format: "png" | "pdf"; path: string; theme?: "light" | "dark" }) => exportPage(url, o))
        await run(pathToFileURL(path).href, { format, path: out, theme })
        const shown = deps.open !== false && process.env.AIGUI_NO_OPEN !== "1" && openFiles([out])
        return { content: [{ type: "text", text: `Saved ${out}${shown ? " — open on the user's screen." : ""}` }] }
      } catch (error) {
        return failure(`Could not export ${basename(path)}: ${String((error as Error).message)}. aigui_export needs the headless browser aigui_render uses.`)
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
  const custom = deps.announce ?? []
  const customLine = custom.length
    ? [`Custom blocks installed here — use them whenever the content is what they show, rather than a generic block or plain text: ${custom.map((p) => `${p.fences.map((f) => `\`\`\`${f}`).join("/")} (${p.description})`).join("; ")}. Get their syntax from aigui_guide.`]
    : []

  server.registerTool(
    "aigui_guide",
    {
      title: "How to write AIGUI blocks",
      description: [
        "Get the exact syntax for AIGUI blocks before writing any. Call with no arguments for the list of blocks, then with the names you will use.",
        `Blocks: ${ALL}.`,
        "Each block is a fenced code block of JSON (or mermaid text, or $$ maths) inside ordinary markdown. The rules matter: most blocks take conditions, not results, and compute the numbers themselves.",
        ...customLine,
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
        "Use it when a picture answers better than text — a chart of numbers, a diagram of a flow, a 3D shape, an orbit, a molecule. The images come back to you and are saved to disk; the result says whether they were also opened on the user's screen — if not, tell the user the paths.",
        "Call aigui_guide first for the syntax of any block you have not written in this session.",
        ...customLine.filter(() => custom.some((p) => p.picture)),
      ].join(" "),
      inputSchema: {
        markdown: z.string().min(1).describe("Markdown containing one or more AIGUI blocks."),
        data: z.record(z.string(), z.string()).optional().describe('Local data files by name, e.g. {"sales": "/abs/path/sales.csv"} (.csv, .tsv, .json). In a block\'s JSON, {"$data":"sales"} becomes its rows, {"$data":"sales","column":"revenue"} one column, {"$data":"sales","pick":["month","revenue"]} rows as arrays, {"$data":"sales","sum":"revenue"} a total (also count, max, min, avg). Use this whenever the numbers are in a file: the figures then come from the file, not from you retyping them.'),
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
        ...customLine,
      ].join(" "),
      inputSchema: {
        markdown: z.string().min(1).describe("The whole answer: prose and AIGUI blocks."),
        data: z.record(z.string(), z.string()).optional().describe('Local data files by name, e.g. {"sales": "/abs/path/sales.csv"} (.csv, .tsv, .json). In a block\'s JSON, {"$data":"sales"} becomes its rows, {"$data":"sales","column":"revenue"} one column, {"$data":"sales","pick":["month","revenue"]} rows as arrays, {"$data":"sales","sum":"revenue"} a total (also count, max, min, avg). Use this whenever the numbers are in a file: the figures then come from the file, not from you retyping them.'),
        title: z.string().max(120).optional().describe("Page title."),
        theme: z.enum(["light", "dark"]).optional().describe("Default: follow the system setting."),
        locale: z.enum(["en", "zh-CN"]).optional().describe("Language of the page's own buttons and labels. Default en; use the user's language when they ask for one."),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async (args) => callTool("aigui_open", args, deps),
  )

  server.registerTool(
    "aigui_edit",
    {
      title: "Change a page aigui_open wrote",
      description: [
        "Change part of a page written by aigui_open — a number, a panel, a step — without sending the whole answer again.",
        "Each edit replaces text in the page's markdown: find must be quoted exactly from what you wrote and occur once; include enough of the surrounding JSON to make it unique.",
        "The page is rewritten in place, opened again, and looked over like a new one. page defaults to the most recent one.",
      ].join(" "),
      inputSchema: {
        page: z.string().optional().describe('The page file path or name, or "last" (default).'),
        edits: z.array(z.object({ find: z.string().min(1), replace: z.string() })).min(1).describe("Find-and-replace edits on the page's markdown, applied in order."),
        title: z.string().max(120).optional().describe("A new title, if it should change."),
        locale: z.enum(["en", "zh-CN"]).optional().describe("Change the language of the page's own buttons and labels."),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async (args) => callTool("aigui_edit", args, deps),
  )

  server.registerTool(
    "aigui_topology",
    {
      title: "Draw a topology from real config",
      description: [
        "Read a docker-compose file, a Kubernetes manifest, or a directory of manifests and draw the system it describes as a topology — services, databases, queues, Services and Ingresses, volumes, and what connects to what — from the config itself rather than from memory.",
        "Opens it as a page and returns the ```topology block, which you can extend with steps (a request's path, a failover) and draw again with aigui_open.",
      ].join(" "),
      inputSchema: {
        path: z.string().min(1).describe("Absolute path to a compose file, a manifest, or a directory of .yaml manifests."),
        open: z.boolean().optional().describe("Open it as a page (default true). false returns only the block."),
        title: z.string().max(120).optional(),
        theme: z.enum(["light", "dark"]).optional(),
        locale: z.enum(["en", "zh-CN"]).optional(),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async (args) => callTool("aigui_topology", args, deps),
  )

  server.registerTool(
    "aigui_feedback",
    {
      title: "Read the reader's comments on pages",
      description: "Read the comments the user left on pages opened by aigui_open — each names the page, the block and what they want changed. Call it when the user says they commented, or asks you to look at their notes. Comments are taken when read (keep: true leaves them). Act on them with aigui_edit.",
      inputSchema: {
        keep: z.boolean().optional().describe("Leave the comments in place after reading. Default false."),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async (args) => callTool("aigui_feedback", args, deps),
  )

  server.registerTool(
    "aigui_export",
    {
      title: "Save a page as PNG or PDF",
      description: "Save a page written by aigui_open as one full-length PNG, a PDF, a single self-contained HTML file that stays interactive, or a GIF / WebM of it playing — for sending or attaching. Returns the file path. page defaults to the most recent one.",
      inputSchema: {
        page: z.string().optional().describe('The page file path or name, or "last" (default).'),
        format: z.enum(["png", "pdf", "html", "gif", "webm"]).optional().describe("png (default) or pdf: drawn still. html: the page as one self-contained file that stays interactive — for sending to someone. gif or webm: one play of what moves on the page — a topology's or a scene's steps, a wall counting up — for a chat or a slide."),
        theme: z.enum(["light", "dark"]).optional().describe("Colour scheme to draw it in. Default light."),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async (args) => callTool("aigui_export", args, deps),
  )

  return server
}

/** Run over stdio, the way Claude Code starts an MCP server, and shut the browser down with it. */
export async function main(): Promise<void> {
  // Pages are served from here while the session runs, so a reader can comment on them. Without
  // a server (a port refused, say) they open from disk as before, minus the comments.
  const pagesDir = join(outputRoot(), "pages")
  await mkdir(pagesDir, { recursive: true })
  const pageServer = await startPageServer(pagesDir, {
    snapshot: (url, block, theme) => exportBlock(url, { block, theme }),
  }).catch(() => undefined)
  const announce = (await loadCustomPlugins(customPluginDir(), RESERVED).catch(() => ({ plugins: [] }))).plugins
  const server = createServer({ pageServer, announce })
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
