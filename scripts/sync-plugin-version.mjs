// Copies the workspace version into the Claude Code and Codex plugin manifests after `changeset version`.
// Changesets bumps package.json files only; the plugin is released by the same tag and must
// match, which `validate:release-tag` checks. The plugin's launcher installs exactly this version
// of `@ai-gui/mcp`, so the manifest's version is also the server's.
import { readFile, writeFile } from "node:fs/promises"

const root = new URL("../", import.meta.url)
const { version } = JSON.parse(await readFile(new URL("packages/core/package.json", root), "utf8"))
// The Claude Code and Codex manifests both name the version; the launcher reads the Claude one.
for (const manifest of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
  const path = new URL(manifest, root)
  const plugin = JSON.parse(await readFile(path, "utf8"))
  if (plugin.version !== version) {
    plugin.version = version
    await writeFile(path, `${JSON.stringify(plugin, null, 2)}\n`)
    console.log(`${manifest} → ${version}`)
  }
}

// The install lines in the docs pin the same version.
for (const doc of ["README.md", "packages/mcp/README.md"]) {
  const url = new URL(doc, root)
  const text = await readFile(url, "utf8")
  const next = text.replace(/@ai-gui\/mcp@\d+\.\d+\.\d+/g, `@ai-gui/mcp@${version}`)
  if (next !== text) await writeFile(url, next)
}
