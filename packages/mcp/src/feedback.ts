import { createReadStream } from "node:fs"
import { appendFile, readFile, stat, writeFile } from "node:fs/promises"
import { createServer, type Server } from "node:http"
import { basename, extname, join, normalize, relative, sep } from "node:path"

/** One comment a reader left on a page: where, on what, and what they said. */
export interface FeedbackItem {
  page: string
  /** Position of the block among the page's top-level elements, from 1. */
  block: number
  /** What the block is — "chart", "topology", "markdown" — and a few words of what it shows. */
  kind: string
  excerpt: string
  comment: string
  at: string
}

const FILE = "feedback.jsonl"

/** The comments waiting in `pagesDir`, oldest first; with `clear`, they are taken (deleted). */
export async function readFeedback(pagesDir: string, clear = true): Promise<FeedbackItem[]> {
  let text = ""
  try {
    text = await readFile(join(pagesDir, FILE), "utf8")
  } catch {
    return []
  }
  const items = text
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as FeedbackItem]
      } catch {
        return []
      }
    })
  if (clear) await writeFile(join(pagesDir, FILE), "")
  return items
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
}

export interface PageServer {
  port: number
  /** The address a page in `pagesDir` is served at. */
  urlFor(path: string): string
  close(): Promise<void>
}

/**
 * Serve the pages over HTTP on 127.0.0.1, and take the comments readers leave on them.
 *
 * A page opened from disk cannot send anything anywhere; served from here it can, to the one
 * place that listens: this process, on loopback, on a port the system picks. Only files under the
 * pages directory are served, comments are capped in size, and nothing listens beyond this
 * machine. A comment is appended to a file, so it survives this process ending and waits for the
 * next session's `aigui_feedback`.
 */
export async function startPageServer(pagesDir: string): Promise<PageServer> {
  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (req.method === "GET" && url.pathname === "/ping") {
      res.writeHead(200, { "content-type": "text/plain" }).end("aigui")
      return
    }
    if (req.method === "POST" && url.pathname === "/feedback") {
      let body = ""
      for await (const chunk of req) {
        body += chunk
        if (body.length > 16_384) {
          res.writeHead(413).end()
          return
        }
      }
      try {
        const raw = JSON.parse(body) as Partial<FeedbackItem>
        const comment = String(raw.comment ?? "").trim().slice(0, 4000)
        if (!comment) throw new Error("empty")
        const item: FeedbackItem = {
          page: basename(String(raw.page ?? "")),
          block: Math.max(0, Math.trunc(Number(raw.block) || 0)),
          kind: String(raw.kind ?? "").slice(0, 40),
          excerpt: String(raw.excerpt ?? "").slice(0, 120),
          comment,
          at: new Date().toISOString(),
        }
        await appendFile(join(pagesDir, FILE), `${JSON.stringify(item)}\n`)
        res.writeHead(204).end()
      } catch {
        res.writeHead(400).end()
      }
      return
    }
    if (req.method !== "GET" || !url.pathname.startsWith("/pages/")) {
      res.writeHead(404).end()
      return
    }
    // Only what is under the pages directory: no `..`, no absolute paths, no feedback file.
    const wanted = normalize(join(pagesDir, decodeURIComponent(url.pathname.slice("/pages/".length))))
    const inside = relative(pagesDir, wanted)
    if (inside.startsWith("..") || inside.includes(`..${sep}`) || basename(wanted) === FILE) {
      res.writeHead(403).end()
      return
    }
    const info = await stat(wanted).catch(() => undefined)
    if (!info?.isFile()) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { "content-type": TYPES[extname(wanted)] ?? "application/octet-stream", "cache-control": "no-cache" })
    createReadStream(wanted).pipe(res)
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => resolve())
  })
  const port = (server.address() as { port: number }).port
  return {
    port,
    urlFor: (path) => `http://127.0.0.1:${port}/pages/${encodeURIComponent(basename(path))}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

/** The comments as lines an agent can act on. */
export function describeFeedback(items: readonly FeedbackItem[]): string {
  if (items.length === 0) return "No comments waiting. Comments are left with the Comment button on a page opened by aigui_open while this session runs."
  return [
    `${items.length} comment${items.length === 1 ? "" : "s"} from the reader:`,
    ...items.map((i) => `- ${i.page}, block ${i.block} (${i.kind}${i.excerpt ? `: "${i.excerpt}"` : ""}): ${i.comment}`),
    "Change the blocks they name with aigui_edit (page: the file named above), then tell the reader what changed.",
  ].join("\n")
}
