#!/usr/bin/env node
// `--version` exits at once, so the first, slow `npx` install can be done ahead of time:
// `npx -y @ai-gui/mcp@latest --version`. Otherwise it happens while Claude Code waits for the
// server to connect, and a cold install can outlast that wait.
if (process.argv.includes("--version")) {
  const { createRequire } = await import("node:module")
  console.log(createRequire(import.meta.url)("../package.json").version)
} else {
  const { main } = await import("../dist/index.js")
  await main()
}
