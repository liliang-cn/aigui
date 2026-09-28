# @ai-gui/mcp

## 0.41.0

### Minor Changes

- f04de8f: New package `@ai-gui/mcp`: an MCP server with three tools — `aigui_guide` returns the exact syntax for the blocks an agent is about to write, `aigui_render` draws them as PNGs, `aigui_open` writes the whole answer to a page and opens it in the browser, where every block is live. The repository is now also a Claude Code plugin and marketplace (`/plugin marketplace add liliang-cn/aigui`), bringing that server and two skills: one for drawing, one for integrating the SDK.

  `@ai-gui/image` falls back to the system's Chrome or Edge when Playwright's own Chromium was never downloaded, which is what a tool started with `npx` gets; `AIGUI_BROWSER_CHANNEL` pins one. It now declares ECharts itself: `echarts-gl` accepts ECharts 6 as a peer, so npm used to hoist 6 and give each chart plugin a private copy of 5 — 165 MB of duplicates, and `echarts-gl` registered on a different instance from the charts. It also exports `inlineKatexCss`, the KaTeX stylesheet with its fonts inlined.

  `@ai-gui/plugin-molecule` draws 3D structures on a transparent background, so a molecule on a dark page no longer sits in a white box.

### Patch Changes

- Updated dependencies [f04de8f]
  - @ai-gui/image@0.41.0
  - @ai-gui/plugin-molecule@0.41.0
  - @ai-gui/cli@0.41.0
  - @ai-gui/core@0.41.0
