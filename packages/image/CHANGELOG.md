# @ai-gui/image

## 0.49.0

### Minor Changes

- 946d5bd: Pictures stay readable, and can be zoomed and saved.

  - `@ai-gui/plugin-topology`: a topology is never shrunk past the scale its smallest text can be read at (0.82); wider than that, the page scrolls it sideways and a picture of it grows wider. A stated `direction` gives way to the other one when it would shrink the text past that and the other is clearly larger. Step numbers keep off nodes and their state badges.
  - `@ai-gui/image`: `exportBlock(url, { block })` draws one block of a page as a PNG; a block drawn wider than the page widens the picture instead of being cut off.
  - `@ai-gui/mcp`: every picture on a page gets a bar — zoom out, zoom level (press to reset), zoom in, full screen, save as PNG. On a page the session serves, Save draws the block at 2× in the headless browser, so charts, 3D and topologies all save as they look; from disk it saves what the browser can.

### Patch Changes

- Updated dependencies [946d5bd]
  - @ai-gui/plugin-topology@0.49.0
  - @ai-gui/core@0.49.0
  - @ai-gui/vanilla@0.49.0
  - @ai-gui/plugin-katex@0.49.0
  - @ai-gui/plugin-mermaid@0.49.0
  - @ai-gui/plugin-chart@0.49.0
  - @ai-gui/plugin-molecule@0.49.0
  - @ai-gui/plugin-scene@0.49.0
  - @ai-gui/plugin-gravity@0.49.0
  - @ai-gui/plugin-dashboard@0.49.0
  - @ai-gui/plugin-bigscreen@0.49.0

## 0.48.0

### Patch Changes

- @ai-gui/core@0.48.0
- @ai-gui/vanilla@0.48.0
- @ai-gui/plugin-katex@0.48.0
- @ai-gui/plugin-mermaid@0.48.0
- @ai-gui/plugin-chart@0.48.0
- @ai-gui/plugin-molecule@0.48.0
- @ai-gui/plugin-scene@0.48.0
- @ai-gui/plugin-gravity@0.48.0
- @ai-gui/plugin-dashboard@0.48.0
- @ai-gui/plugin-bigscreen@0.48.0
- @ai-gui/plugin-topology@0.48.0

## 0.47.0

### Minor Changes

- 86f8118: Custom blocks: a folder with `aigui.json`, a plain `plugin.js` and a `spec.md` in `~/.config/aigui/plugins` adds a block type to `aigui_guide`, pages, PNGs and standalone exports. `aigui plugin new <name>` scaffolds one; `aigui plugin list` shows what loaded and why anything did not.

### Patch Changes

- 3bd53d7: GIF recordings crop screencast frames at their real scale, so a recording is never offset or mixed with an earlier frame.
- 0ff92bf: GIF recordings capture with the browser's screencast — smooth at the page's own frame rate instead of a screenshot per frame — and merge identical frames, so a held step costs one frame.
  - @ai-gui/core@0.47.0
  - @ai-gui/vanilla@0.47.0
  - @ai-gui/plugin-katex@0.47.0
  - @ai-gui/plugin-mermaid@0.47.0
  - @ai-gui/plugin-chart@0.47.0
  - @ai-gui/plugin-molecule@0.47.0
  - @ai-gui/plugin-scene@0.47.0
  - @ai-gui/plugin-gravity@0.47.0
  - @ai-gui/plugin-dashboard@0.47.0
  - @ai-gui/plugin-bigscreen@0.47.0
  - @ai-gui/plugin-topology@0.47.0

## 0.46.0

### Minor Changes

- 1e1636f: `aigui_export` records a page playing as a GIF (encoded in-process) or a WebM; players restart at step 1 for the recording, on an `aigui:restart` event.

### Patch Changes

- 807388f: Visual regression tests compare rendered blocks with per-platform golden pictures; CI checks the Linux ones.
- Updated dependencies [1e1636f]
- Updated dependencies [caba124]
  - @ai-gui/plugin-topology@0.46.0
  - @ai-gui/plugin-scene@0.46.0
  - @ai-gui/plugin-chart@0.46.0
  - @ai-gui/core@0.46.0
  - @ai-gui/vanilla@0.46.0
  - @ai-gui/plugin-katex@0.46.0
  - @ai-gui/plugin-mermaid@0.46.0
  - @ai-gui/plugin-molecule@0.46.0
  - @ai-gui/plugin-gravity@0.46.0
  - @ai-gui/plugin-dashboard@0.46.0
  - @ai-gui/plugin-bigscreen@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies [5cc3c4d]
  - @ai-gui/plugin-bigscreen@0.45.0
  - @ai-gui/plugin-topology@0.44.1
  - @ai-gui/plugin-scene@0.45.0
  - @ai-gui/core@0.45.0
  - @ai-gui/vanilla@0.45.0
  - @ai-gui/plugin-katex@0.45.0
  - @ai-gui/plugin-mermaid@0.45.0
  - @ai-gui/plugin-chart@0.45.0
  - @ai-gui/plugin-molecule@0.45.0
  - @ai-gui/plugin-gravity@0.45.0
  - @ai-gui/plugin-dashboard@0.45.0

## 0.44.0

### Minor Changes

- 7268a6e: `aigui_edit` changes part of a page by find-and-replace; `aigui_export` saves a page as PNG or PDF, drawn still. Pages are listed in `pages/index.html`, and a page opened with `?still` plays nothing.
- 2c3af69: Drawn blocks are looked over for what a reader would trip over — clipped, tiny or low-contrast text, labels on top of each other, crowded panels — and `aigui_render` / `aigui_open` list the problems so the agent can fix them. Plugins flag their own with `data-aigui-issue`.
- 486b26c: New `topology` block: infrastructure diagrams laid out automatically, with steps that play a process — messages travelling, states changing — in the page, and are numbered on one picture in a PNG. The page check no longer waits forever on a page that animates, and flags labels drawn on top of each other.

### Patch Changes

- b913bc0: Scenes can play a process: objects take an `id`, and `steps` move, recolour, hide, show and outline them, easing between states in the page and drawn as the last step with the steps listed in a picture.
- Updated dependencies [2c3af69]
- Updated dependencies [d1000d6]
- Updated dependencies [b913bc0]
- Updated dependencies [486b26c]
  - @ai-gui/plugin-bigscreen@0.44.0
  - @ai-gui/plugin-scene@0.44.0
  - @ai-gui/plugin-topology@0.44.0
  - @ai-gui/core@0.44.0
  - @ai-gui/vanilla@0.44.0
  - @ai-gui/plugin-katex@0.44.0
  - @ai-gui/plugin-mermaid@0.44.0
  - @ai-gui/plugin-chart@0.44.0
  - @ai-gui/plugin-molecule@0.44.0
  - @ai-gui/plugin-gravity@0.44.0
  - @ai-gui/plugin-dashboard@0.44.0

## 0.43.0

### Patch Changes

- Updated dependencies [920189c]
  - @ai-gui/plugin-scene@0.43.0
  - @ai-gui/core@0.43.0
  - @ai-gui/vanilla@0.43.0
  - @ai-gui/plugin-katex@0.43.0
  - @ai-gui/plugin-mermaid@0.43.0
  - @ai-gui/plugin-chart@0.43.0
  - @ai-gui/plugin-molecule@0.43.0
  - @ai-gui/plugin-gravity@0.43.0
  - @ai-gui/plugin-dashboard@0.43.0
  - @ai-gui/plugin-bigscreen@0.43.0

## 0.42.0

### Patch Changes

- @ai-gui/core@0.42.0
- @ai-gui/vanilla@0.42.0
- @ai-gui/plugin-katex@0.42.0
- @ai-gui/plugin-mermaid@0.42.0
- @ai-gui/plugin-chart@0.42.0
- @ai-gui/plugin-molecule@0.42.0
- @ai-gui/plugin-scene@0.42.0
- @ai-gui/plugin-gravity@0.42.0
- @ai-gui/plugin-dashboard@0.42.0
- @ai-gui/plugin-bigscreen@0.42.0

## 0.41.2

### Patch Changes

- @ai-gui/core@0.41.2
- @ai-gui/vanilla@0.41.2
- @ai-gui/plugin-katex@0.41.2
- @ai-gui/plugin-mermaid@0.41.2
- @ai-gui/plugin-chart@0.41.2
- @ai-gui/plugin-molecule@0.41.2
- @ai-gui/plugin-scene@0.41.2
- @ai-gui/plugin-gravity@0.41.2
- @ai-gui/plugin-dashboard@0.41.2
- @ai-gui/plugin-bigscreen@0.41.2

## 0.41.1

### Patch Changes

- @ai-gui/core@0.41.1
- @ai-gui/vanilla@0.41.1
- @ai-gui/plugin-katex@0.41.1
- @ai-gui/plugin-mermaid@0.41.1
- @ai-gui/plugin-chart@0.41.1
- @ai-gui/plugin-molecule@0.41.1
- @ai-gui/plugin-scene@0.41.1
- @ai-gui/plugin-gravity@0.41.1
- @ai-gui/plugin-dashboard@0.41.1
- @ai-gui/plugin-bigscreen@0.41.1

## 0.41.0

### Minor Changes

- f04de8f: New package `@ai-gui/mcp`: an MCP server with three tools — `aigui_guide` returns the exact syntax for the blocks an agent is about to write, `aigui_render` draws them as PNGs, `aigui_open` writes the whole answer to a page and opens it in the browser, where every block is live. The repository is now also a Claude Code plugin and marketplace (`/plugin marketplace add liliang-cn/aigui`), bringing that server and two skills: one for drawing, one for integrating the SDK.

  `@ai-gui/image` falls back to the system's Chrome or Edge when Playwright's own Chromium was never downloaded, which is what a tool started with `npx` gets; `AIGUI_BROWSER_CHANNEL` pins one. It now declares ECharts itself: `echarts-gl` accepts ECharts 6 as a peer, so npm used to hoist 6 and give each chart plugin a private copy of 5 — 165 MB of duplicates, and `echarts-gl` registered on a different instance from the charts. It also exports `inlineKatexCss`, the KaTeX stylesheet with its fonts inlined.

  `@ai-gui/plugin-molecule` draws 3D structures on a transparent background, so a molecule on a dark page no longer sits in a white box.

### Patch Changes

- Updated dependencies [f04de8f]
  - @ai-gui/plugin-molecule@0.41.0
  - @ai-gui/core@0.41.0
  - @ai-gui/vanilla@0.41.0
  - @ai-gui/plugin-katex@0.41.0
  - @ai-gui/plugin-mermaid@0.41.0
  - @ai-gui/plugin-chart@0.41.0
  - @ai-gui/plugin-scene@0.41.0
  - @ai-gui/plugin-gravity@0.41.0
  - @ai-gui/plugin-dashboard@0.41.0
  - @ai-gui/plugin-bigscreen@0.41.0

## 0.40.0

### Patch Changes

- Updated dependencies [cb85d4a]
  - @ai-gui/plugin-bigscreen@0.40.0
  - @ai-gui/core@0.40.0
  - @ai-gui/vanilla@0.40.0
  - @ai-gui/plugin-katex@0.40.0
  - @ai-gui/plugin-mermaid@0.40.0
  - @ai-gui/plugin-chart@0.40.0
  - @ai-gui/plugin-molecule@0.40.0
  - @ai-gui/plugin-scene@0.40.0
  - @ai-gui/plugin-gravity@0.40.0
  - @ai-gui/plugin-dashboard@0.40.0

## 0.39.1

### Patch Changes

- Updated dependencies [25740cc]
  - @ai-gui/core@0.39.1
  - @ai-gui/plugin-mermaid@0.39.1
  - @ai-gui/plugin-molecule@0.39.1
  - @ai-gui/plugin-bigscreen@0.39.1
  - @ai-gui/plugin-chart@0.39.1
  - @ai-gui/plugin-dashboard@0.39.1
  - @ai-gui/plugin-gravity@0.39.1
  - @ai-gui/plugin-katex@0.39.1
  - @ai-gui/plugin-scene@0.39.1
  - @ai-gui/vanilla@0.39.1

## 0.39.0

### Patch Changes

- @ai-gui/core@0.39.0
- @ai-gui/vanilla@0.39.0
- @ai-gui/plugin-katex@0.39.0
- @ai-gui/plugin-mermaid@0.39.0
- @ai-gui/plugin-chart@0.39.0
- @ai-gui/plugin-molecule@0.39.0
- @ai-gui/plugin-scene@0.39.0
- @ai-gui/plugin-gravity@0.39.0
- @ai-gui/plugin-dashboard@0.39.0
- @ai-gui/plugin-bigscreen@0.39.0

## 0.38.0

### Patch Changes

- @ai-gui/core@0.38.0
- @ai-gui/vanilla@0.38.0
- @ai-gui/plugin-katex@0.38.0
- @ai-gui/plugin-mermaid@0.38.0
- @ai-gui/plugin-chart@0.38.0
- @ai-gui/plugin-molecule@0.38.0
- @ai-gui/plugin-scene@0.38.0
- @ai-gui/plugin-gravity@0.38.0
- @ai-gui/plugin-dashboard@0.38.0
- @ai-gui/plugin-bigscreen@0.38.0

## 0.37.1

### Patch Changes

- Updated dependencies [829bc82]
  - @ai-gui/plugin-bigscreen@0.37.1
  - @ai-gui/core@0.37.1
  - @ai-gui/vanilla@0.37.1
  - @ai-gui/plugin-katex@0.37.1
  - @ai-gui/plugin-mermaid@0.37.1
  - @ai-gui/plugin-chart@0.37.1
  - @ai-gui/plugin-molecule@0.37.1
  - @ai-gui/plugin-scene@0.37.1
  - @ai-gui/plugin-gravity@0.37.1
  - @ai-gui/plugin-dashboard@0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies [8f3663c]
- Updated dependencies [ae86ea6]
- Updated dependencies [84a9e1b]
  - @ai-gui/plugin-bigscreen@0.37.0
  - @ai-gui/core@0.37.0
  - @ai-gui/vanilla@0.37.0
  - @ai-gui/plugin-katex@0.37.0
  - @ai-gui/plugin-mermaid@0.37.0
  - @ai-gui/plugin-chart@0.37.0
  - @ai-gui/plugin-molecule@0.37.0
  - @ai-gui/plugin-scene@0.37.0
  - @ai-gui/plugin-gravity@0.37.0
  - @ai-gui/plugin-dashboard@0.37.0

## 0.36.3

### Patch Changes

- @ai-gui/core@0.36.3
- @ai-gui/vanilla@0.36.3
- @ai-gui/plugin-katex@0.36.3
- @ai-gui/plugin-mermaid@0.36.3
- @ai-gui/plugin-chart@0.36.3
- @ai-gui/plugin-molecule@0.36.3
- @ai-gui/plugin-scene@0.36.3
- @ai-gui/plugin-gravity@0.36.3
- @ai-gui/plugin-dashboard@0.36.3
- @ai-gui/plugin-bigscreen@0.36.3

## 0.36.2

### Patch Changes

- Updated dependencies [c57eae2]
  - @ai-gui/plugin-bigscreen@0.36.2
  - @ai-gui/core@0.36.2
  - @ai-gui/vanilla@0.36.2
  - @ai-gui/plugin-katex@0.36.2
  - @ai-gui/plugin-mermaid@0.36.2
  - @ai-gui/plugin-chart@0.36.2
  - @ai-gui/plugin-molecule@0.36.2
  - @ai-gui/plugin-scene@0.36.2
  - @ai-gui/plugin-gravity@0.36.2
  - @ai-gui/plugin-dashboard@0.36.2

## 0.36.1

### Patch Changes

- Updated dependencies [6183537]
  - @ai-gui/plugin-bigscreen@0.36.1
  - @ai-gui/plugin-gravity@0.36.1
  - @ai-gui/plugin-scene@0.36.1
  - @ai-gui/core@0.36.1
  - @ai-gui/vanilla@0.36.1
  - @ai-gui/plugin-katex@0.36.1
  - @ai-gui/plugin-mermaid@0.36.1
  - @ai-gui/plugin-chart@0.36.1
  - @ai-gui/plugin-molecule@0.36.1
  - @ai-gui/plugin-dashboard@0.36.1

## 0.36.0

### Patch Changes

- Updated dependencies [312391d]
  - @ai-gui/core@0.36.0
  - @ai-gui/plugin-bigscreen@0.36.0
  - @ai-gui/plugin-chart@0.36.0
  - @ai-gui/plugin-dashboard@0.36.0
  - @ai-gui/plugin-gravity@0.36.0
  - @ai-gui/plugin-katex@0.36.0
  - @ai-gui/plugin-mermaid@0.36.0
  - @ai-gui/plugin-molecule@0.36.0
  - @ai-gui/plugin-scene@0.36.0
  - @ai-gui/vanilla@0.36.0

## 0.35.2

### Patch Changes

- @ai-gui/core@0.35.2
- @ai-gui/vanilla@0.35.2
- @ai-gui/plugin-katex@0.35.2
- @ai-gui/plugin-mermaid@0.35.2
- @ai-gui/plugin-chart@0.35.2
- @ai-gui/plugin-molecule@0.35.2
- @ai-gui/plugin-scene@0.35.2
- @ai-gui/plugin-gravity@0.35.2
- @ai-gui/plugin-dashboard@0.35.2
- @ai-gui/plugin-bigscreen@0.35.2

## 0.35.1

### Patch Changes

- @ai-gui/core@0.35.1
- @ai-gui/vanilla@0.35.1
- @ai-gui/plugin-katex@0.35.1
- @ai-gui/plugin-mermaid@0.35.1
- @ai-gui/plugin-chart@0.35.1
- @ai-gui/plugin-molecule@0.35.1
- @ai-gui/plugin-scene@0.35.1
- @ai-gui/plugin-gravity@0.35.1
- @ai-gui/plugin-dashboard@0.35.1
- @ai-gui/plugin-bigscreen@0.35.1

## 0.35.0

### Minor Changes

- e0c759a: `@ai-gui/image` now draws four more block families — ` ```scene `, ` ```gravity `, ` ```bigscreen ` and ` ```molecule ` — so a picture-only channel gets the 3D scene, the orbit, the data wall and the molecule as PNGs. The WebGL ones render through SwiftShader in headless Chromium (the launcher now passes the flags that enable it), the animated ones are drawn at their finished state, and the page waits for a canvas to paint before it screenshots. `@ai-gui/openclaw` accepts the four new names in `blocks` and draws them by default.

### Patch Changes

- @ai-gui/core@0.35.0
- @ai-gui/vanilla@0.35.0
- @ai-gui/plugin-katex@0.35.0
- @ai-gui/plugin-mermaid@0.35.0
- @ai-gui/plugin-chart@0.35.0
- @ai-gui/plugin-molecule@0.35.0
- @ai-gui/plugin-scene@0.35.0
- @ai-gui/plugin-gravity@0.35.0
- @ai-gui/plugin-dashboard@0.35.0
- @ai-gui/plugin-bigscreen@0.35.0

## 0.34.0

### Patch Changes

- @ai-gui/core@0.34.0
- @ai-gui/vanilla@0.34.0
- @ai-gui/plugin-katex@0.34.0
- @ai-gui/plugin-mermaid@0.34.0
- @ai-gui/plugin-chart@0.34.0
- @ai-gui/plugin-dashboard@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies
  - @ai-gui/core@0.33.0
  - @ai-gui/plugin-chart@0.33.0
  - @ai-gui/plugin-mermaid@0.33.0
  - @ai-gui/plugin-dashboard@0.33.0
  - @ai-gui/plugin-katex@0.33.0
  - @ai-gui/vanilla@0.33.0

## 0.32.0

### Patch Changes

- @ai-gui/core@0.32.0
- @ai-gui/vanilla@0.32.0
- @ai-gui/plugin-katex@0.32.0
- @ai-gui/plugin-mermaid@0.32.0
- @ai-gui/plugin-chart@0.32.0
- @ai-gui/plugin-dashboard@0.32.0

## 0.31.0

### Minor Changes

- ab9dfba: Render AIGUI blocks as images for channels that only carry pictures.

  `@ai-gui/image` runs the real vanilla renderer in a headless Chromium and screenshots each chart, Mermaid diagram, KaTeX formula, table, card, or dashboard. `@ai-gui/openclaw` is an OpenClaw plugin that uses it to rewrite outbound replies, so a chart reaches WeChat as a chart rather than as ECharts JSON. A block that fails to render is left as text; the answer is never lost to a failed drawing.

### Patch Changes

- @ai-gui/core@0.31.0
- @ai-gui/vanilla@0.31.0
- @ai-gui/plugin-katex@0.31.0
- @ai-gui/plugin-mermaid@0.31.0
- @ai-gui/plugin-chart@0.31.0
- @ai-gui/plugin-dashboard@0.31.0
