# @ai-gui/mcp

An [MCP](https://modelcontextprotocol.io) server that lets an agent draw [AIGUI](../../README.md) blocks — charts, diagrams, maths, 3D scenes, orbits, molecules, data walls — as PNGs, or as a live page in the browser.

It is what the AIGUI Claude Code plugin runs. A terminal shows only text; with this server the agent writes the same markdown an AIGUI frontend would render, and gets pictures back.

## Use it from Claude Code

As a plugin, which also brings the skills that tell Claude when to draw:

```text
/plugin marketplace add liliang-cn/aigui
/plugin install aigui@aigui
```

Or the server on its own:

```sh
claude mcp add aigui -- npx --prefer-offline -y @ai-gui/mcp@0.41.1
```

Any other MCP client takes the same command, over stdio. Pin a version and keep `--prefer-offline`: with both, a cached server starts in seconds. With `@latest`, or without the flag, `npx` re-checks the metadata of all ~300 dependencies online on every start, which on a slow line takes longer than Claude Code waits for a server to connect. (The plugin already launches it this way.)

The first launch installs the server and its renderers — a few hundred megabytes, charts, diagrams and 3D engines included — and can itself outlast that wait. If `/mcp` shows it failed the first time, reconnect it there; or install ahead of time with the same spec:

```sh
npx --prefer-offline -y @ai-gui/mcp@0.41.1 --version
```

## Tools

| Tool | What it does |
| --- | --- |
| `aigui_guide` | With no arguments, lists the blocks. With `blocks: ["chart", "scene"]`, returns their exact syntax — the text `buildSystemPrompt` gives a browser, from the same plugins. |
| `aigui_render` | Draws the blocks in a markdown string as PNGs and returns them inline and as file paths. Chart, mermaid, maths, tables, bigscreen, dashboard, scene, gravity, molecule. |
| `aigui_open` | Writes the whole answer to an HTML page and opens it in the default browser, where charts are live, 3D can be turned and walls and orbits animate. Draws every block, including the page-only ones: graph, solid, function, optics, motion, physics, figure, quote and more. |

The syntax is fetched on demand rather than written into the tool descriptions: every plugin's spec together is tens of kilobytes, and a description is sent on every turn whether anything is drawn or not.

## A browser for the pictures

`aigui_render` draws in Playwright's headless Chromium. `npx` installs Playwright but not that browser, so the server downloads it itself (about 100 MB, once) in the background as soon as it starts; later starts check it in a fraction of a second. The first picture waits up to a minute for the download, then goes ahead with the Google Chrome or Microsoft Edge already on the machine, which draws charts and diagrams well but 3D slowly. `AIGUI_NO_BROWSER_DOWNLOAD=1` skips the download; `AIGUI_BROWSER_CHANNEL` pins a browser (`chromium`, `chrome`, `msedge`) and also skips it.

`aigui_open` needs no headless browser at all: it writes a file and hands it to the system's default one.

## Files

Pictures go to `~/.cache/aigui/images`, pages to `~/.cache/aigui/pages` with the viewer script beside them — not the temp directory, because a page is something a person reopens. `AIGUI_OUT_DIR` moves both; `XDG_CACHE_HOME` is honoured. `AIGUI_NO_OPEN=1` writes pages without opening them.

A page is self-contained apart from that one viewer script (about 20 MB, every plugin inlined, copied once per version): it loads nothing from the network, and its maths fonts are embedded, because a page opened from `file://` cannot load fonts from beside itself.

## Programmatic use

```ts
import { createServer, renderToContent, writePage, guide } from "@ai-gui/mcp"
```

`createServer()` returns the `McpServer` without connecting it, for a host that wants its own transport.
