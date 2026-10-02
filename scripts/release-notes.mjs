// Release notes for one version, gathered from every package's CHANGELOG.md.
//
//   node scripts/release-notes.mjs 0.47.0 > notes.md
//
// Changesets writes one entry per package a change touched, so the same line appears in several
// changelogs; here each change is listed once, "Updated dependencies" noise is dropped, and the
// install lines follow — a GitHub release is read by people deciding whether to upgrade.
import { readFile, readdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const version = process.argv[2]?.replace(/^v/, "")
if (!version) {
  console.error("usage: release-notes.mjs <version>")
  process.exit(1)
}

const sections = { "Minor Changes": new Map(), "Patch Changes": new Map(), "Major Changes": new Map() }
for (const dir of await readdir(`${root}packages`)) {
  const text = await readFile(`${root}packages/${dir}/CHANGELOG.md`, "utf8").catch(() => "")
  const start = text.indexOf(`\n## ${version}\n`)
  if (start < 0) continue
  const end = text.indexOf("\n## ", start + 4)
  const body = text.slice(start, end < 0 ? undefined : end)
  let heading = ""
  for (const line of body.split("\n")) {
    const h = /^### (.+)/.exec(line)
    if (h) heading = h[1]
    const entry = /^- (?:[0-9a-f]{7}: )?(.+)/.exec(line)
    // Skip the dependency bookkeeping: "Updated dependencies" and the version list under it.
    if (!entry || !sections[heading] || entry[1].startsWith("Updated dependencies") || /^@ai-gui\/[\w-]+@\d/.test(entry[1])) continue
    const key = entry[1].trim()
    const packages = sections[heading].get(key) ?? new Set()
    packages.add(dir)
    sections[heading].set(key, packages)
  }
}

const out = []
for (const [title, entries] of [["Breaking", sections["Major Changes"]], ["New", sections["Minor Changes"]], ["Fixes", sections["Patch Changes"]]]) {
  if (entries.size === 0) continue
  out.push(`## ${title}`, "", ...[...entries.keys()].map((e) => `- ${e}`), "")
}
if (out.length === 0) out.push("Version bump only: every package moves together, and this release carries no changes of its own.", "")
out.push(
  "## Install",
  "",
  "```text",
  "# Claude Code",
  "/plugin marketplace add liliang-cn/aigui",
  "/plugin install aigui@aigui",
  "",
  "# Codex",
  "codex plugin marketplace add liliang-cn/aigui",
  "codex plugin add aigui@aigui",
  "```",
  "",
  `npm: [\`@ai-gui/mcp@${version}\`](https://www.npmjs.com/package/@ai-gui/mcp/v/${version}) and every \`@ai-gui/*\` package at ${version}. Demos: https://liliang-cn.github.io/aigui/`,
)
process.stdout.write(`${out.join("\n")}\n`)
