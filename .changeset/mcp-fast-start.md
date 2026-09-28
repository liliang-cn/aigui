---
"@ai-gui/mcp": patch
---

The Claude Code plugin launches the server pinned and with `npx --prefer-offline`, so a cached server starts in seconds instead of re-checking ~300 dependencies online on every start. The server downloads Playwright's headless shell in the background once it has connected, because the Chrome/Edge fallback draws 3D many times slower.
