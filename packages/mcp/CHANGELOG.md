# @ai-gui/mcp

## 0.48.0

### Patch Changes

- 5b35d82: Listed in the MCP Registry as `io.github.liliang-cn/aigui` (published from CI on every release), with a rewritten npm README: demo, install for Claude Code, Codex and any MCP client, and the configuration in one table.
  - @ai-gui/cli@0.48.0
  - @ai-gui/core@0.48.0
  - @ai-gui/plugin-molecule@0.48.0
  - @ai-gui/image@0.48.0

## 0.47.0

### Minor Changes

- 86f8118: Custom blocks: a folder with `aigui.json`, a plain `plugin.js` and a `spec.md` in `~/.config/aigui/plugins` adds a block type to `aigui_guide`, pages, PNGs and standalone exports. `aigui plugin new <name>` scaffolds one; `aigui plugin list` shows what loaded and why anything did not.

### Patch Changes

- 37583cd: Installed custom blocks are named in the tool descriptions, so an agent knows of them before it writes anything (measured: used in 9 of 9 runs, up from 5 of 9 when only aigui_guide listed them).
- 3bd53d7: GIF recordings crop screencast frames at their real scale, so a recording is never offset or mixed with an earlier frame.
- Updated dependencies [86f8118]
- Updated dependencies [3bd53d7]
- Updated dependencies [0ff92bf]
  - @ai-gui/cli@0.47.0
  - @ai-gui/image@0.47.0
  - @ai-gui/core@0.47.0
  - @ai-gui/plugin-molecule@0.47.0

## 0.46.0

### Minor Changes

- 1e1636f: `aigui_export` records a page playing as a GIF (encoded in-process) or a WebM; players restart at step 1 for the recording, on an `aigui:restart` event.
- 60c7211: `aigui_render` and `aigui_open` take `data` files (CSV, TSV, JSON); blocks reference them with `{"$data": …}` for rows, a column, picked columns or a total, so the numbers come from the file rather than being retyped.
- 68eebea: Pages are served on 127.0.0.1 while the session runs and carry a Comment button: the reader picks a block and says what should change, and `aigui_feedback` hands the comments to the agent.
- a92dd7f: `aigui_export` with `format: "html"` writes the page as one self-contained, interactive file that opens offline, carrying only the viewer packs its blocks use.
- dc7e162: `aigui_topology` draws a system from its docker-compose file or Kubernetes manifests — services, databases, queues, Services, Ingresses, volumes and their links — and returns the topology block to extend with steps.
- 9263c68: The page viewer is a 300 KB main script plus packs — ECharts, mermaid, KaTeX, code highlighting, three.js, molecules, topology — loaded only for an answer that uses them, instead of one 21 MB script on every page.

### Patch Changes

- Updated dependencies [1e1636f]
- Updated dependencies [807388f]
  - @ai-gui/image@0.46.0
  - @ai-gui/cli@0.46.0
  - @ai-gui/core@0.46.0
  - @ai-gui/plugin-molecule@0.46.0

## 0.45.0

### Minor Changes

- 5cc3c4d: Pages default to English with a `locale` option on `aigui_open` / `aigui_edit`. A KPI without `decimals` keeps the value's own precision, and the gauge reading no longer sits on its scale. A topology without a direction picks the one that draws larger; state badges and link labels no longer collide with the links. Examples use generic names.

### Patch Changes

- @ai-gui/cli@0.45.0
- @ai-gui/image@0.45.0
- @ai-gui/core@0.45.0
- @ai-gui/plugin-molecule@0.45.0

## 0.44.0

### Minor Changes

- 7268a6e: `aigui_edit` changes part of a page by find-and-replace; `aigui_export` saves a page as PNG or PDF, drawn still. Pages are listed in `pages/index.html`, and a page opened with `?still` plays nothing.
- 2c3af69: Drawn blocks are looked over for what a reader would trip over — clipped, tiny or low-contrast text, labels on top of each other, crowded panels — and `aigui_render` / `aigui_open` list the problems so the agent can fix them. Plugins flag their own with `data-aigui-issue`.
- 486b26c: New `topology` block: infrastructure diagrams laid out automatically, with steps that play a process — messages travelling, states changing — in the page, and are numbered on one picture in a PNG. The page check no longer waits forever on a page that animates, and flags labels drawn on top of each other.

### Patch Changes

- Updated dependencies [7268a6e]
- Updated dependencies [2c3af69]
- Updated dependencies [b913bc0]
- Updated dependencies [486b26c]
  - @ai-gui/image@0.44.0
  - @ai-gui/cli@0.44.0
  - @ai-gui/core@0.44.0
  - @ai-gui/plugin-molecule@0.44.0

## 0.43.0

### Patch Changes

- @ai-gui/cli@0.43.0
- @ai-gui/image@0.43.0
- @ai-gui/core@0.43.0
- @ai-gui/plugin-molecule@0.43.0

## 0.42.0

### Minor Changes

- `aigui_render` can open its PNGs in the system image viewer (`AIGUI_OPEN_IMAGES=1`, set by the Claude Code plugin), and the draw skill now defaults to `aigui_open` in a terminal.

### Patch Changes

- @ai-gui/core@0.42.0
- @ai-gui/plugin-molecule@0.42.0
- @ai-gui/cli@0.42.0
- @ai-gui/image@0.42.0

## 0.41.2

### Patch Changes

- 63c55fd: The Claude Code plugin no longer starts the server with `npx`. With `--prefer-offline`, npx trusted a cached registry listing from before the release it was asked for and refused to start (0.41.1 failed this way); without it, npx re-checked ~300 dependencies online on every start, slower than Claude Code waits for a server. The plugin now ships a dependency-free launcher that installs the server once per version into `~/.cache/aigui/server/<version>` and runs it from there, answering the protocol itself during that first install so the session connects at once and the first tool call waits. `@ai-gui/mcp` exports `callTool` and `closeBrowser` for it.
  - @ai-gui/core@0.41.2
  - @ai-gui/plugin-molecule@0.41.2
  - @ai-gui/cli@0.41.2
  - @ai-gui/image@0.41.2

## 0.41.1

### Patch Changes

- 6b91a4b: The Claude Code plugin launches the server pinned and with `npx --prefer-offline`, so a cached server starts in seconds instead of re-checking ~300 dependencies online on every start. The server downloads Playwright's headless shell in the background once it has connected, because the Chrome/Edge fallback draws 3D many times slower.
  - @ai-gui/core@0.41.1
  - @ai-gui/plugin-molecule@0.41.1
  - @ai-gui/cli@0.41.1
  - @ai-gui/image@0.41.1

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
