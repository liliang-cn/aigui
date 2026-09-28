---
"@ai-gui/mcp": patch
---

The Claude Code plugin no longer starts the server with `npx`. With `--prefer-offline`, npx trusted a cached registry listing from before the release it was asked for and refused to start (0.41.1 failed this way); without it, npx re-checked ~300 dependencies online on every start, slower than Claude Code waits for a server. The plugin now ships a dependency-free launcher that installs the server once per version into `~/.cache/aigui/server/<version>` and runs it from there, answering the protocol itself during that first install so the session connects at once and the first tool call waits. `@ai-gui/mcp` exports `callTool` and `closeBrowser` for it.
