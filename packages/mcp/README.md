# @ai-gui/mcp

[![npm](https://img.shields.io/npm/v/@ai-gui/mcp)](https://www.npmjs.com/package/@ai-gui/mcp)
[![license](https://img.shields.io/npm/l/@ai-gui/mcp)](https://github.com/liliang-cn/aigui/blob/main/LICENSE)
[![CI](https://github.com/liliang-cn/aigui/actions/workflows/ci.yml/badge.svg)](https://github.com/liliang-cn/aigui/actions/workflows/ci.yml)

**Let your coding agent draw.** An [MCP](https://modelcontextprotocol.io) server — and the engine of the AIGUI plugin for Claude Code and Codex — that turns charts, diagrams, maths, 3D scenes, molecules, orbits, dashboards and step-by-step infrastructure topologies into PNGs the agent can check, or a live page in your browser.

![A failover topology, drawn and played by the agent](https://raw.githubusercontent.com/liliang-cn/aigui/main/docs/images/demo.gif)

[Live demos](https://liliang-cn.github.io/aigui/) · [Source](https://github.com/liliang-cn/aigui) · [All packages](https://www.npmjs.com/org/ai-gui)

## Install

**Claude Code** — the plugin also brings the skills that tell the agent when a picture beats text:

```text
/plugin marketplace add liliang-cn/aigui
/plugin install aigui@aigui
```

**Codex:**

```sh
codex plugin marketplace add liliang-cn/aigui
codex plugin add aigui@aigui
```

**Any MCP client** — run `aigui-mcp` over stdio:

```sh
npm install -g @ai-gui/mcp@0.47.0
claude mcp add aigui -- aigui-mcp
```

Requires Node.js 18.11+. The first drawing downloads a headless browser (about 100 MB, once); everything runs locally, with no account or API key.

## What it draws

| | |
| --- | --- |
| ![Chart](https://raw.githubusercontent.com/liliang-cn/aigui/main/docs/images/chart.png) | ![3D scene](https://raw.githubusercontent.com/liliang-cn/aigui/main/docs/images/scene.png) |
| ![Molecule](https://raw.githubusercontent.com/liliang-cn/aigui/main/docs/images/molecule.png) | ![Orbits](https://raw.githubusercontent.com/liliang-cn/aigui/main/docs/images/gravity.png) |

21 block types: ECharts charts (3D too), Mermaid, KaTeX, dashboards and data walls, 3D scenes, molecules from SMILES, orbits and collisions, topologies whose steps play, knowledge graphs, geometry, function plots, optics, mechanics, labelled figures, candlesticks, tables and more. Nine of them render straight to PNG; all of them draw in a page.

## Tools

| Tool | What it does |
| --- | --- |
| `aigui_guide` | Lists the blocks, or returns the exact syntax for the ones named — read before writing a block. |
| `aigui_render` | Draws the blocks in a markdown string as PNGs, returned to the agent and saved to disk. |
| `aigui_open` | Opens the whole answer as a live page: charts to hover, 3D to turn, topologies and walls that play. |
| `aigui_edit` | Changes part of a page by find-and-replace, without sending the whole answer again. |
| `aigui_export` | Saves a page as PNG, PDF, one self-contained HTML file, or a GIF / WebM of it playing. |
| `aigui_topology` | Draws a system from its docker-compose file or Kubernetes manifests. |
| `aigui_feedback` | Reads the comments the user left on a page's blocks. |

## Why it can be trusted

- **Numbers come from your files.** Pass `data: {"sales": "/abs/path/sales.csv"}` and write `{"$data":"sales","column":"revenue"}` in the chart — or `pick`, `sum`, `count`, `max`, `min`, `avg`. The figures are read from the file, never retyped by the model, and the result names the file behind each block.
- **Every drawing is checked.** A headless browser looks for labels on top of each other, text cut off or under 9 px, poor contrast and crowded charts, and tells the agent to fix them before you see anything.
- **Topologies from real config.** `aigui_topology` reads what is actually deployed, not what the model remembers.
- **Local.** Pictures go to `~/.cache/aigui/images`, pages to `~/.cache/aigui/pages`, listed newest first in `pages/index.html`. A page loads nothing from the network.

## Custom blocks

Add your own block type in three files — no build step, no fork:

```sh
npx @ai-gui/cli plugin new ticket   # writes ~/.config/aigui/plugins/ticket/
```

| File | What it is |
| --- | --- |
| `aigui.json` | Name, fences, a one-line description, whether it may render to PNG |
| `plugin.js` | A plain browser script registering an `AIGuiPlugin`: `(globalThis.__aiguiPacks ??= {}).ticket = (theme, still) => [...]`. Its HTML is sanitized like any plugin's. |
| `spec.md` | The rules the model follows to write the block |

It then appears in `aigui_guide` as `[custom]` and draws in pages, PNGs and exports. Blocks installed when a session starts are named in the tool descriptions too: in a measured run, agents used a custom block in 9 of 9 sessions with that, against 5 of 9 without. A broken folder is skipped with its reason; a name that collides with a built-in block is refused.

## Comments from the page

While the session runs, pages are served on `127.0.0.1` (a port the system picks) with a **Comment** button: pick a block, say what should change, send. The agent reads it with `aigui_feedback` and edits the page. Only the pages directory is served.

## Configuration

| Variable | Effect |
| --- | --- |
| `AIGUI_OUT_DIR` | Where pictures and pages go. Default `~/.cache/aigui` (`XDG_CACHE_HOME` honoured). |
| `AIGUI_NO_OPEN=1` | Write pages without opening them. |
| `AIGUI_OPEN_IMAGES=1` | Also open `aigui_render`'s PNGs in the image viewer — the plugins set it, since a terminal cannot show images. |
| `AIGUI_PLUGIN_DIR` | Where custom blocks live. Default `~/.config/aigui/plugins`. |
| `AIGUI_NO_BROWSER_DOWNLOAD=1` | Skip the headless-browser download; draw with an installed Chrome or Edge. |
| `AIGUI_BROWSER_CHANNEL` | Pin a browser: `chromium`, `chrome` or `msedge`. |

## Programmatic use

```ts
import { createServer, callTool, renderToContent, writePage } from "@ai-gui/mcp"
```

`createServer()` returns the `McpServer` unconnected, for a host with its own transport; `callTool(name, args)` runs one tool directly.

## License

MIT © Liang Li
