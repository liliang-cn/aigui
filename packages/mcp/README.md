# @ai-gui/mcp

An [MCP](https://modelcontextprotocol.io) server that lets an agent draw [AIGUI](../../README.md) blocks — charts, diagrams, maths, 3D scenes, orbits, molecules, data walls — as PNGs, or as a live page in the browser.

It is what the AIGUI Claude Code plugin runs. A terminal shows only text; with this server the agent writes the same markdown an AIGUI frontend would render, and gets pictures back.

## Use it from Claude Code

As a plugin, which also brings the skills that tell Claude when to draw:

```text
/plugin marketplace add liliang-cn/aigui
/plugin install aigui@aigui
```

The plugin starts the server through a small launcher that ships with it. On first use it installs this package into `~/.cache/aigui/server/<version>` — a few hundred megabytes, charts, diagrams and 3D engines included — while the session is already connected; the first tool call waits for the install, and every later start runs the installed server directly, in well under a second. It does not use `npx`, which with a dependency tree this size either re-checks every package online on each start (longer than Claude Code waits for a server to connect) or, with `--prefer-offline`, trusts a cached registry listing that predates the release it was asked for and refuses to start.

Or the server on its own, installed once:

```sh
npm install -g @ai-gui/mcp@0.43.0
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
| `aigui_export` | Saves a page as one full-length PNG or a PDF, drawn still (nothing mid-animation), beside the page. |

The syntax is fetched on demand rather than written into the tool descriptions: every plugin's spec together is tens of kilobytes, and a description is sent on every turn whether anything is drawn or not.

## A browser for the pictures

`aigui_render` draws in Playwright's headless Chromium. `npx` installs Playwright but not that browser, so the server downloads it itself (about 100 MB, once) in the background as soon as it starts; later starts check it in a fraction of a second. The first picture waits up to a minute for the download, then goes ahead with the Google Chrome or Microsoft Edge already on the machine, which draws charts and diagrams well but 3D slowly. `AIGUI_NO_BROWSER_DOWNLOAD=1` skips the download; `AIGUI_BROWSER_CHANNEL` pins a browser (`chromium`, `chrome`, `msedge`) and also skips it.

`aigui_open` needs no headless browser at all: it writes a file and hands it to the system's default one.

## Files

Pictures go to `~/.cache/aigui/images`, pages to `~/.cache/aigui/pages` with the viewer script beside them — not the temp directory, because a page is something a person reopens. `AIGUI_OUT_DIR` moves both; `XDG_CACHE_HOME` is honoured. `AIGUI_NO_OPEN=1` writes pages without opening them. Every page is listed, newest first, in `pages/index.html`, which each page links to; a page opened with `?still` plays nothing, which is how exports and the look-over see it. `AIGUI_OPEN_IMAGES=1` also opens `aigui_render`'s PNGs in the system image viewer — the Claude Code plugin sets it, since a terminal cannot show them; leave it off in a client that shows images inline.

A page is self-contained apart from that one viewer script (about 20 MB, every plugin inlined, copied once per version): it loads nothing from the network, and its maths fonts are embedded, because a page opened from `file://` cannot load fonts from beside itself.

## Programmatic use

```ts
import { createServer, renderToContent, writePage, guide } from "@ai-gui/mcp"
```

`createServer()` returns the `McpServer` without connecting it, for a host that wants its own transport.
