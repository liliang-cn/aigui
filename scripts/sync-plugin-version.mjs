// Copies the workspace version into the Claude Code plugin manifest after `changeset version`:
// the plugin's own version, and the exact server version it launches. Changesets bumps
// package.json files only; the plugin is released by the same tag and must match, which
// `validate:release-tag` checks.
//
// The server is pinned rather than `@latest` because the launch uses `npx --prefer-offline`: a
// pinned spec already in the npm cache starts in seconds, where `@latest` makes npx re-check every
// one of the server's ~300 dependencies online on every start — a minute on a slow line, longer
// than Claude Code waits for a server to connect.
import { readFile, writeFile } from "node:fs/promises"

const root = new URL("../", import.meta.url)
const { version } = JSON.parse(await readFile(new URL("packages/core/package.json", root), "utf8"))
const path = new URL(".claude-plugin/plugin.json", root)
const plugin = JSON.parse(await readFile(path, "utf8"))
const server = plugin.mcpServers.aigui
const args = server.args.map((arg) => (arg.startsWith("@ai-gui/mcp@") ? `@ai-gui/mcp@${version}` : arg))
if (plugin.version !== version || JSON.stringify(args) !== JSON.stringify(server.args)) {
  plugin.version = version
  server.args = args
  await writeFile(path, `${JSON.stringify(plugin, null, 2)}\n`)
  console.log(`.claude-plugin/plugin.json → ${version}`)
}

// The install lines in the docs pin the same version, for the same reason.
for (const doc of ["README.md", "packages/mcp/README.md"]) {
  const url = new URL(doc, root)
  const text = await readFile(url, "utf8")
  const next = text.replace(/@ai-gui\/mcp@\d+\.\d+\.\d+/g, `@ai-gui/mcp@${version}`)
  if (next !== text) await writeFile(url, next)
}
