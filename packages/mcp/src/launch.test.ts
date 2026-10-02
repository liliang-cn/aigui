import { spawn } from "node:child_process"
import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { describe, expect, it } from "vitest"
import { createServer } from "./server"

/**
 * The Claude Code plugin's launcher, `plugin/launch.mjs` at the repository root. It has no
 * dependencies and is not part of this package, but it answers for this package on first use, so
 * its tests live beside the server whose behaviour it has to match.
 */
const repo = fileURLToPath(new URL("../../../", import.meta.url))
const launcher = join(repo, "plugin", "launch.mjs")

/** A stand-in for `npm install`: copies a fake server to where the real one would go. */
async function fakeNpm(dir: string, exitCode = 0, notYetListed = 0, lag: "listing" | "tarball" = "listing"): Promise<string> {
  const server = join(dir, "fake-server.js")
  await writeFile(
    server,
    [
      'export async function callTool(name, args) { return { content: [{ type: "text", text: `called ${name} ${JSON.stringify(args)} via ${installed}` }] } }',
      "export function ensureHeadlessShell() { return Promise.resolve(true) }",
      "export async function closeBrowser() {}",
      'export async function main() { process.stderr.write("REAL-MAIN\\n"); process.exit(0) }',
      "",
    ].join("\n"),
  )
  const script = join(dir, "fake-npm.mjs")
  await writeFile(
    script,
    [
      "#!/usr/bin/env node",
      'import { mkdirSync, readFileSync, writeFileSync } from "node:fs"',
      'import { join } from "node:path"',
      `if (${exitCode} !== 0) { console.error("npm ERR! network unreachable"); process.exit(${exitCode}) }`,
      // The first `notYetListed` runs fail the way npm does while its CDN lags a release.
      `const counter = ${JSON.stringify(join(dir, "runs"))}`,
      'let runs = 0; try { runs = Number(readFileSync(counter, "utf8")) } catch {}',
      "writeFileSync(counter, String(runs + 1))",
      `if (runs < ${notYetListed}) { console.error(${JSON.stringify(lag)} === "tarball" ? "npm error code E404\\nnpm error 404 Not Found - GET https://registry.npmjs.org/@ai-gui/plugin-motion/-/plugin-motion-9.9.9.tgz - Not found" : "npm error code ETARGET\\nnpm error notarget No matching version found for @ai-gui/cli@9.9.9."); process.exit(1) }`,
      'const prefix = process.argv[process.argv.indexOf("--prefix") + 1]',
      "const pkg = process.argv[process.argv.length - 1]",
      'const dist = join(prefix, "node_modules", "@ai-gui", "mcp", "dist")',
      "mkdirSync(dist, { recursive: true })",
      `writeFileSync(join(dist, "index.js"), readFileSync(${JSON.stringify(server)}, "utf8") + "export const installed = " + JSON.stringify(pkg) + "\\n")`,
      "",
    ].join("\n"),
  )
  await chmod(script, 0o755)
  return script
}

/** Run the launcher, send JSON-RPC lines, collect what comes back. */
function run(env: Record<string, string>, messages: object[], untilId: number): Promise<{ replies: Array<Record<string, any>>; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [launcher], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    const replies: Array<Record<string, any>> = []
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`timed out; stderr: ${stderr}`))
    }, 20_000)
    child.stdout.on("data", (chunk) => {
      stdout += chunk
      const lines = stdout.split("\n").filter(Boolean)
      replies.splice(0, replies.length, ...lines.map((line) => JSON.parse(line)))
      if (replies.some((reply) => reply.id === untilId)) {
        clearTimeout(timer)
        child.stdin.end()
        resolve({ replies, stdout, stderr })
      }
    })
    child.stderr.on("data", (chunk) => (stderr += chunk))
    child.on("exit", () => {
      clearTimeout(timer)
      resolve({ replies, stdout, stderr })
    })
    for (const message of messages) child.stdin.write(`${JSON.stringify(message)}\n`)
  })
}

const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } }

// Each case starts real node processes; with headless browsers drawing alongside (test:browser) a
// start can take seconds, which is load, not a hang.
describe("the plugin launcher", { timeout: 20_000 }, () => {
  it("lists exactly the tools the real server lists", async () => {
    // The launcher answers tools/list from a file while the server is being installed; if that
    // file drifts, the first session of every new user sees different tools from the second.
    const client = new Client({ name: "t", version: "0" })
    const [a, b] = InMemoryTransport.createLinkedPair()
    await Promise.all([createServer({ setup: async () => true }).connect(a), client.connect(b)])
    const live = (await client.listTools()).tools
    const shipped = JSON.parse(await readFile(join(repo, "plugin", "tools.json"), "utf8"))
    expect(shipped).toEqual(live)
  })

  it("starts an installed server directly", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aigui-launch-"))
    const serverDir = join(dir, "server")
    const npm = await fakeNpm(dir)
    // Install once through the fake npm, as the bootstrap would.
    const prefix = join(serverDir)
    await mkdir(prefix, { recursive: true })
    await new Promise((resolve) => spawn(npm, ["install", "--prefix", prefix, "@ai-gui/mcp@x"]).on("exit", resolve))
    const { stderr } = await run({ AIGUI_SERVER_DIR: serverDir }, [], -1)
    expect(stderr).toContain("REAL-MAIN")
  })

  it("answers at once while installing, and runs the first tool call once the install lands", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aigui-launch-"))
    const serverDir = join(dir, "server")
    const { replies, stdout, stderr } = await run(
      { AIGUI_SERVER_DIR: serverDir, AIGUI_NPM: await fakeNpm(dir) },
      [init, { jsonrpc: "2.0", method: "notifications/initialized" }, { jsonrpc: "2.0", id: 2, method: "tools/list" }, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "aigui_guide", arguments: { blocks: ["chart"] } } }],
      3,
    )
    expect(replies.find((r) => r.id === 1)?.result.serverInfo.name).toBe("aigui")
    expect(replies.find((r) => r.id === 2)?.result.tools.map((t: { name: string }) => t.name)).toEqual(["aigui_guide", "aigui_render", "aigui_open", "aigui_edit", "aigui_export"])
    const call = replies.find((r) => r.id === 3)?.result
    expect(call.content[0].text).toContain('called aigui_guide {"blocks":["chart"]}')
    // It installed the version the plugin manifest names.
    const { version } = JSON.parse(await readFile(join(repo, ".claude-plugin", "plugin.json"), "utf8"))
    expect(call.content[0].text).toContain(`@ai-gui/mcp@${version}`)
    // Nothing but protocol on stdout; progress went to stderr.
    for (const line of stdout.split("\n").filter(Boolean)) expect(() => JSON.parse(line)).not.toThrow()
    expect(stderr).toContain("installing @ai-gui/mcp@")
    // Moved into place, so the next session takes the fast path.
    expect((await stat(join(serverDir, "node_modules", "@ai-gui", "mcp", "dist", "index.js"))).isFile()).toBe(true)
  })

  it("waits out a registry that does not list the release yet", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aigui-launch-"))
    const { replies, stderr } = await run(
      { AIGUI_SERVER_DIR: join(dir, "server"), AIGUI_NPM: await fakeNpm(dir, 0, 2), AIGUI_INSTALL_RETRY_MS: "50" },
      [init, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "aigui_guide", arguments: {} } }],
      2,
    )
    expect(replies.find((r) => r.id === 2)?.result.content[0].text).toContain("called aigui_guide")
    expect(stderr).toContain("does not list this release yet")
  })

  it("waits out a listing that names a tarball the registry does not serve yet", async () => {
    // Seen after v0.44.0: every package listed, one tarball 404ing for over half an hour.
    const dir = await mkdtemp(join(tmpdir(), "aigui-launch-"))
    const { replies } = await run(
      { AIGUI_SERVER_DIR: join(dir, "server"), AIGUI_NPM: await fakeNpm(dir, 0, 2, "tarball"), AIGUI_INSTALL_RETRY_MS: "50" },
      [init, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "aigui_guide", arguments: {} } }],
      2,
    )
    expect(replies.find((r) => r.id === 2)?.result.content[0].text).toContain("called aigui_guide")
  })

  it("reports a failed install on the tool call instead of hanging or dying", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aigui-launch-"))
    const { replies } = await run(
      { AIGUI_SERVER_DIR: join(dir, "server"), AIGUI_NPM: await fakeNpm(dir, 1) },
      [init, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "aigui_render", arguments: { markdown: "x" } } }],
      2,
    )
    const call = replies.find((r) => r.id === 2)?.result
    expect(call.isError).toBe(true)
    expect(call.content[0].text).toContain("network unreachable")
  })

  it("rejects an unknown method with the JSON-RPC error for it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aigui-launch-"))
    const { replies } = await run({ AIGUI_SERVER_DIR: join(dir, "server"), AIGUI_NPM: await fakeNpm(dir) }, [init, { jsonrpc: "2.0", id: 9, method: "resources/list" }], 9)
    expect(replies.find((r) => r.id === 9)?.error.code).toBe(-32601)
  })
})
