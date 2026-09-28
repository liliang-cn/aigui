import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

/**
 * Make sure Playwright's own headless browser is on disk, downloading it once if it is not.
 *
 * `npx` installs Playwright but never its browser, and the fallback — the Chrome or Edge already
 * installed — is a poor stand-in for 3D: with software WebGL a three.js scene redraws a
 * double-resolution canvas as fast as it can and starves the page, so a scene that the headless
 * shell draws in two seconds took seventeen in Chrome, and could miss its screenshot. So the
 * server fetches the shell itself, in the background, as soon as it starts.
 *
 * `--only-shell` fetches just the headless build (about 100 MB, not the full browser);
 * `--no-remove` stops Playwright from deleting browser versions other projects on the machine
 * rely on. When the shell is already there the check takes a fraction of a second.
 *
 * The child's output goes to stderr and nowhere else: on a stdio MCP server, stdout is the
 * protocol, and one progress line there corrupts the stream.
 */
export type BrowserSetup = () => Promise<boolean>

let pending: Promise<boolean> | undefined

export function ensureHeadlessShell(env: Record<string, string | undefined> = process.env): Promise<boolean> {
  // A pinned channel means the host has chosen its browser; nothing to download.
  if (env.AIGUI_NO_BROWSER_DOWNLOAD === "1" || env.AIGUI_BROWSER_CHANNEL) return Promise.resolve(false)
  return (pending ??= new Promise<boolean>((resolve) => {
    let cli: string
    try {
      cli = join(dirname(createRequire(import.meta.url).resolve("playwright/package.json")), "cli.js")
    } catch {
      resolve(false)
      return
    }
    const child = spawn(process.execPath, [cli, "install", "--only-shell", "--no-remove", "--no-progress", "chromium"], { stdio: ["ignore", "pipe", "pipe"] })
    const relay = (chunk: Buffer) => process.stderr.write(`[aigui] ${chunk}`)
    child.stdout?.on("data", relay)
    child.stderr?.on("data", relay)
    child.on("error", () => resolve(false))
    child.on("exit", (code) => resolve(code === 0))
  }))
}

/**
 * Wait for the setup, but not forever.
 *
 * The first download can take minutes on a slow line. A render asked for meanwhile waits a
 * while, then goes ahead with whatever browser there is — Chrome draws a chart well enough — and
 * says the faster one is still on its way.
 */
export async function awaitSetup(setup: BrowserSetup, waitMs: number): Promise<"ready" | "pending" | "failed"> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<"pending">((resolve) => {
    timer = setTimeout(() => resolve("pending"), waitMs)
  })
  const outcome = await Promise.race([setup().then((ok) => (ok ? ("ready" as const) : ("failed" as const))), timeout])
  clearTimeout(timer)
  return outcome
}
