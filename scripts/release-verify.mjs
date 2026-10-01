#!/usr/bin/env node
/**
 * After a release: wait until npm serves it, then start the Claude Code plugin's server the way a
 * user's first session does, and check it answers as the version just released.
 *
 *   pnpm release:verify            # the version in the workspace
 *   pnpm release:verify 0.44.0     # a given one
 *   pnpm release:verify --plugin   # and update the locally installed Claude Code plugin
 *   pnpm release:verify --no-wait  # skip waiting for the registry; just check the server
 *
 * Every step here was once done by hand after a release, and each hid a trap: npm's CDN lists a
 * new version minutes after the publish succeeds, `npm install` trusts a listing it cached before
 * the release, and a server that starts is not proof it is the new one. The install goes through
 * plugin/launch.mjs itself — the code path a user hits — not a copy of it.
 */
import { spawn, spawnSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
const plugin = args.includes("--plugin")
const wait = !args.includes("--no-wait")
const version = args.find((a) => /^\d+\.\d+\.\d+/.test(a)) ?? JSON.parse(readFileSync(join(root, "packages/core/package.json"), "utf8")).version
const log = (line) => console.log(`[release:verify] ${line}`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const pluginVersion = JSON.parse(readFileSync(join(root, ".claude-plugin/plugin.json"), "utf8")).version
if (pluginVersion !== version) {
  console.error(`plugin.json says ${pluginVersion}, checking ${version}: the launcher installs plugin.json's version, so check out the release first.`)
  process.exit(1)
}

const publicPackages = readdirSync(join(root, "packages"))
  .map((dir) => join(root, "packages", dir, "package.json"))
  .filter(existsSync)
  .map((file) => JSON.parse(readFileSync(file, "utf8")))
  .filter((pkg) => !pkg.private)
  .map((pkg) => pkg.name)

/** Whether the registry's full document — not the abbreviated, CDN-cached one — lists `version`. */
async function listed(name) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return false
    return Boolean((await res.json()).versions?.[version])
  } catch {
    return false
  }
}

if (wait) log(`waiting for npm to list ${version} for ${publicPackages.length} packages…`)
const deadline = Date.now() + 15 * 60_000
let missing = wait ? publicPackages : []
while (missing.length > 0) {
  const checks = await Promise.all(missing.map(async (name) => [name, await listed(name)]))
  missing = checks.filter(([, ok]) => !ok).map(([name]) => name)
  if (missing.length === 0) break
  if (Date.now() > deadline) {
    console.error(`still not listed after 15 minutes: ${missing.join(", ")}`)
    process.exit(1)
  }
  log(`${missing.length} not listed yet (${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ", …" : ""}); checking again in 20s`)
  await sleep(20_000)
}
if (wait) log("all packages listed")

/** Talk to the launcher over stdio: initialize, list the tools, make one real call. */
function smoke() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, "plugin/launch.mjs")], {
      env: { ...process.env, AIGUI_NO_BROWSER_DOWNLOAD: "1", AIGUI_NO_OPEN: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    })
    const replies = new Map()
    let buffer = ""
    child.stdout.on("data", (chunk) => {
      buffer += chunk
      for (let at = buffer.indexOf("\n"); at >= 0; at = buffer.indexOf("\n")) {
        const line = buffer.slice(0, at).trim()
        buffer = buffer.slice(at + 1)
        if (!line) continue
        const message = JSON.parse(line)
        replies.set(message.id, message)
        if (replies.has(3)) {
          child.stdin.end()
          resolve(replies)
        }
      }
    })
    child.stderr.on("data", (chunk) => process.stderr.write(chunk))
    child.on("error", reject)
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error("the server did not answer within 6 minutes"))
    }, 6 * 60_000)
    child.on("exit", () => clearTimeout(timer))
    const send = (message) => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`)
    send({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "release-verify", version } } })
    send({ id: 2, method: "tools/list" })
    send({ id: 3, method: "tools/call", params: { name: "aigui_guide", arguments: {} } })
  })
}

log("starting the plugin's server (installs it first if this machine has not yet)…")
const replies = await smoke()
const info = replies.get(1)?.result?.serverInfo
const tools = replies.get(2)?.result?.tools?.map((t) => t.name) ?? []
const guide = replies.get(3)?.result
const problems = []
if (info?.version !== version) problems.push(`server says it is ${info?.version}, not ${version}`)
if (!tools.includes("aigui_render") || !tools.includes("aigui_open")) problems.push(`tools listed: ${tools.join(", ") || "none"}`)
if (!guide || guide.isError || !String(guide.content?.[0]?.text).includes("```")) problems.push(`aigui_guide failed: ${JSON.stringify(guide).slice(0, 200)}`)
if (problems.length > 0) {
  for (const p of problems) console.error(`✗ ${p}`)
  process.exit(1)
}
const cache = process.env.AIGUI_SERVER_DIR || join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "aigui", "server", version)
log(`✓ server ${version} answers: ${tools.length} tools, guide ok — installed at ${cache}`)

if (plugin) {
  const claude = (cmd) => spawnSync("claude", cmd, { encoding: "utf8" })
  if (claude(["--version"]).status !== 0) {
    log("--plugin: no `claude` on PATH; skipped")
  } else {
    for (const cmd of [["plugin", "marketplace", "update", "aigui"], ["plugin", "update", "aigui@aigui"]]) {
      const run = claude(cmd)
      log(`claude ${cmd.join(" ")}: ${(run.stdout || run.stderr).trim().split("\n").pop()}`)
    }
    log("restart Claude Code to pick the plugin up")
  }
}
