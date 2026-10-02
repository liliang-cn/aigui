# @ai-gui/mcp

An [MCP](https://modelcontextprotocol.io) server that lets an agent draw [AIGUI](../../README.md) blocks — charts, diagrams, maths, 3D scenes, orbits, molecules, data walls — as PNGs, or as a live page in the browser.

It is what the AIGUI plugin for Claude Code and Codex runs. A terminal shows only text; with this server the agent writes the same markdown an AIGUI frontend would render, and gets pictures back.

## Use it from Claude Code

As a plugin, which also brings the skills that tell Claude when to draw:

```text
/plugin marketplace add liliang-cn/aigui
/plugin install aigui@aigui
```

The plugin starts the server through a small launcher that ships with it. On first use it installs this package into `~/.cache/aigui/server/<version>` — a few hundred megabytes, charts, diagrams and 3D engines included — while the session is already connected; the first tool call waits for the install, and every later start runs the installed server directly, in well under a second. It does not use `npx`, which with a dependency tree this size either re-checks every package online on each start (longer than Claude Code waits for a server to connect) or, with `--prefer-offline`, trusts a cached registry listing that predates the release it was asked for and refuses to start.

Or the server on its own, installed once:

```sh
npm install -g @ai-gui/mcp@0.46.0
claude mcp add aigui -- aigui-mcp
```

Any other MCP client runs the same `aigui-mcp` command, over stdio.

## Tools

| Tool | What it does |
| --- | --- |
| `aigui_guide` | With no arguments, lists the blocks. With `blocks: ["chart", "scene"]`, returns their exact syntax — the text `buildSystemPrompt` gives a browser, from the same plugins. |
| `aigui_render` | Draws the blocks in a markdown string as PNGs and returns them inline and as file paths. Chart, mermaid, maths, tables, bigscreen, dashboard, scene, gravity, molecule. |
| `aigui_open` | Writes the whole answer to an HTML page and opens it in the default browser, where charts are live, 3D can be turned and walls and orbits animate. Draws every block, including the page-only ones: graph, solid, function, optics, motion, physics, figure, quote and more. |
| `aigui_edit` | Changes part of a page `aigui_open` wrote — a number, a panel, a step — by find-and-replace on its markdown, without sending the whole answer again. Each `find` must occur exactly once. Rewrites the page in place and looks it over again. |
| `aigui_topology` | Reads a docker-compose file, a Kubernetes manifest or a directory of manifests and draws the system as a topology — services, databases, queues, Services, Ingresses, volumes and their links — from the config, not from memory. Returns the block too, to add steps to. |
| `aigui_feedback` | Reads the comments the reader left on pages (a Comment button on every page opened while the session runs): page, block, what to change. Act on them with `aigui_edit`. |
| `aigui_export` | Saves a page as one full-length PNG or a PDF, drawn still (nothing mid-animation), as a single self-contained HTML file that stays interactive and opens offline — carrying only the code its blocks use — or as a GIF or WebM of one play of what moves on it (a topology's or a scene's steps, a wall counting up). |

The syntax is fetched on demand rather than written into the tool descriptions: every plugin's spec together is tens of kilobytes, and a description is sent on every turn whether anything is drawn or not.

## Data from files

`aigui_render` and `aigui_open` take `data: {"sales": "/abs/path/sales.csv"}` (`.csv`, `.tsv`, `.json`, up to 5 MB). In a block's JSON, `{"$data":"sales"}` becomes the rows, `{"$data":"sales","column":"revenue"}` one column, `{"$data":"sales","pick":["month","revenue"]}` rows as arrays, and `{"$data":"sales","sum":"revenue"}` a total — also `count`, `max`, `min`, `avg`. The numbers then come from the file, and the result names the file behind each block; a page shows it under the block.

## A browser for the pictures

`aigui_render` draws in Playwright's headless Chromium. `npx` installs Playwright but not that browser, so the server downloads it itself (about 100 MB, once) in the background as soon as it starts; later starts check it in a fraction of a second. The first picture waits up to a minute for the download, then goes ahead with the Google Chrome or Microsoft Edge already on the machine, which draws charts and diagrams well but 3D slowly. `AIGUI_NO_BROWSER_DOWNLOAD=1` skips the download; `AIGUI_BROWSER_CHANNEL` pins a browser (`chromium`, `chrome`, `msedge`) and also skips it.

`aigui_open` needs no headless browser at all: it writes a file and hands it to the system's default one.

## Custom blocks

Add your own block type without touching this package. `npx @ai-gui/cli plugin new ticket` writes `~/.config/aigui/plugins/ticket/` (or `AIGUI_PLUGIN_DIR`) with three files:

| File | What it is |
| --- | --- |
| `aigui.json` | `name`, `fences`, a one-line `description`, `picture` (whether `aigui_render` may draw it) |
| `plugin.js` | A plain browser script — no build step — that registers its plugins: `(globalThis.__aiguiPacks ??= {}).ticket = (theme, still) => [{ name, nodeRenderers, isBlockComplete, css }]`. Same shape as `@ai-gui/core`'s `AIGuiPlugin`; its HTML is sanitized like any plugin's. |
| `spec.md` | The rules the model follows to write the block — what `aigui_guide` returns for it. |

The block then appears in `aigui_guide` marked `[custom]`, draws in pages, PNGs and standalone exports, and is picked up without a restart. Blocks installed when the server starts are also named in the tool descriptions, so the agent reaches for them unprompted — restart the session after adding one for that. A folder with a bad manifest is skipped with a reason in the listing; a name that collides with a built-in block is refused. Scripts run only from that folder, on your machine — the same trust as installing a package.

## Comments from the page

While the session runs, pages are served from `127.0.0.1` on a port the system picks, and each carries a Comment button: pick a block, say what should change, send. The agent reads the comments with `aigui_feedback`. Only files under the pages directory are served; a page opened from disk, or after the session ends, simply has no button.

## Files

Pictures go to `~/.cache/aigui/images`, pages to `~/.cache/aigui/pages` with the viewer script beside them — not the temp directory, because a page is something a person reopens. `AIGUI_OUT_DIR` moves both; `XDG_CACHE_HOME` is honoured. `AIGUI_NO_OPEN=1` writes pages without opening them. Every page is listed, newest first, in `pages/index.html`, which each page links to; a page opened with `?still` plays nothing, which is how exports and the look-over see it. `AIGUI_OPEN_IMAGES=1` also opens `aigui_render`'s PNGs in the system image viewer — the Claude Code and Codex plugins set it, since a terminal cannot show them; leave it off in a client that shows images inline.

A page is self-contained apart from that one viewer script (about 20 MB, every plugin inlined, copied once per version): it loads nothing from the network, and its maths fonts are embedded, because a page opened from `file://` cannot load fonts from beside itself.

## Programmatic use

```ts
import { createServer, renderToContent, writePage, guide } from "@ai-gui/mcp"
```

`createServer()` returns the `McpServer` without connecting it, for a host that wants its own transport.
