#!/usr/bin/env node
/**
 * How the Claude Code plugin starts the aigui MCP server. No dependencies: it runs from the
 * plugin's own checkout, before anything is installed.
 *
 * Why not `npx`: the server brings ~300 packages (renderers, 3D engines, Playwright), and `npx`
 * either re-checks every one of them online on each start — a minute on a slow line, longer than
 * Claude Code waits for a server to connect — or, with `--prefer-offline`, trusts a cached copy
 * of the registry that predates the release it was asked for, and refuses to start at all.
 *
 * So the server is installed once per version, into a directory of its own, and started from
 * there directly. Until that first install finishes, this file answers the protocol itself: the
 * session connects at once, lists the tools, and the first tool call waits for the install.
 */
import { spawn } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { createInterface } from "node:readline"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const { version } = JSON.parse(readFileSync(join(here, "..", ".claude-plugin", "plugin.json"), "utf8"))
const cacheHome = process.env.XDG_CACHE_HOME || join(homedir(), ".cache")
const target = process.env.AIGUI_SERVER_DIR || join(cacheHome, "aigui", "server", version)
const entry = join(target, "node_modules", "@ai-gui", "mcp", "dist", "index.js")

/** Everything this process says goes to stderr: on a stdio MCP server stdout is the protocol. */
const log = (line) => process.stderr.write(`[aigui] ${line}\n`)

if (existsSync(entry)) {
  const { main } = await import(pathToFileURL(entry).href)
  await main()
} else {
  bootstrap()
}

/**
 * Install `@ai-gui/mcp@<version>` into `target`.
 *
 * Into a scratch directory first, renamed into place when complete: a session that starts while
 * another is still installing must never find — and import — a half-written tree. If two installs
 * race, the loser's rename fails, the winner's tree is already there, and the loser's is removed.
 */
async function install() {
  // Right after a release npm's CDN can list a package without yet listing its newest version,
  // and an install of the new version fails with ETARGET for a few minutes. Later still, the
  // listing can name a tarball the registry does not serve yet, and the install 404s on it. That
  // window is exactly when a plugin update arrives, so both are waited out rather than reported.
  const attempts = Number(process.env.AIGUI_INSTALL_ATTEMPTS ?? 6)
  const delay = Number(process.env.AIGUI_INSTALL_RETRY_MS ?? 30_000)
  for (let attempt = 1; ; attempt++) {
    try {
      return await installOnce()
    } catch (error) {
      if (attempt >= attempts || !/ETARGET|notarget|No matching version|E404|404 Not Found/i.test(String(error.message))) throw error
      log(`the registry does not list this release yet; retrying in ${Math.round(delay / 1000)}s (${attempt}/${attempts - 1})`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

function installOnce() {
  return new Promise((resolve, reject) => {
    const scratch = `${target}.partial-${process.pid}`
    mkdirSync(scratch, { recursive: true })
    log(`installing @ai-gui/mcp@${version} (first use only) …`)
    // `AIGUI_NPM` is for tests, which install a fake server rather than the real one.
    const npm = process.env.AIGUI_NPM || (process.platform === "win32" ? "npm.cmd" : "npm")
    // `--prefer-online`: npm otherwise answers from package listings it cached minutes ago, and a
    // listing cached before this release does not know the version asked for.
    const child = spawn(npm, ["install", "--prefix", scratch, "--prefer-online", "--no-audit", "--no-fund", "--loglevel=error", `@ai-gui/mcp@${version}`], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    })
    let output = ""
    child.stdout.on("data", (chunk) => (output += chunk))
    child.stderr.on("data", (chunk) => (output += chunk))
    child.on("error", (error) => reject(error))
    child.on("exit", (code) => {
      if (code !== 0) {
        rmSync(scratch, { recursive: true, force: true })
        reject(new Error(`npm install failed (exit ${code}): ${output.trim().split("\n").slice(-3).join(" ")}`))
        return
      }
      try {
        renameSync(scratch, target)
      } catch {
        rmSync(scratch, { recursive: true, force: true })
        if (!existsSync(entry)) {
          reject(new Error(`could not move the install into ${target}`))
          return
        }
      }
      log("installed.")
      resolve()
    })
  })
}

/** The protocol, answered by hand for the one session that has to wait for the install. */
function bootstrap() {
  const tools = JSON.parse(readFileSync(join(here, "tools.json"), "utf8"))
  let installed = install()
  let server
  installed.catch((error) => log(String(error.message)))
  // The server module, once there is one, and its headless-browser download started right away,
  // the same as the installed server does on its own start.
  const load = async () => {
    await installed
    if (!server) {
      server = await import(pathToFileURL(entry).href)
      void server.ensureHeadlessShell()
    }
    return server
  }

  const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)
  const reply = (id, result) => send({ jsonrpc: "2.0", id, result })
  const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } })

  const handle = async (message) => {
    const { id, method, params } = message
    if (id === undefined) return // a notification
    switch (method) {
      case "initialize":
        return reply(id, {
          protocolVersion: params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "aigui", version },
        })
      case "ping":
        return reply(id, {})
      case "tools/list":
        return reply(id, { tools })
      case "tools/call": {
        try {
          const module = await load()
          return reply(id, await module.callTool(params?.name, params?.arguments ?? {}))
        } catch (error) {
          // A failed install is retried on the next call rather than for the rest of the session.
          installed = install()
          installed.catch((retry) => log(String(retry.message)))
          return reply(id, {
            content: [{ type: "text", text: `The aigui server could not be installed: ${error.message}. Check that npm can reach the registry, then try again.` }],
            isError: true,
          })
        }
      }
      default:
        return fail(id, -32601, `Method not found: ${method}`)
    }
  }

  const lines = createInterface({ input: process.stdin })
  lines.on("line", (line) => {
    if (!line.trim()) return
    let message
    try {
      message = JSON.parse(line)
    } catch {
      return fail(null, -32700, "Parse error")
    }
    void handle(message)
  })
  lines.on("close", async () => {
    if (server) await server.closeBrowser?.().catch(() => {})
    process.exit(0)
  })
}
