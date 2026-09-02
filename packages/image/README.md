# @ai-gui/image

Render [AIGUI](../../README.md) markdown blocks — ECharts charts, Mermaid diagrams, KaTeX math, tables, cards, dashboards, 3D scenes, orbits, data walls and molecules — to PNG, by running the real `@ai-gui/vanilla` renderer in a headless Chromium and screenshotting each block.

Use it where a channel carries pictures but not markup: WeChat, email, an image-only webhook.

The 3D families (`scene`, `molecule` in 3D, the big screen's 3D and globe panels) draw with WebGL. Headless Chromium has no GPU, so the browser is launched with SwiftShader — software WebGL — enabled; it is slower than a real GPU, which is why the per-block budget is ten seconds and a canvas is given a moment to paint before the screenshot. Anything animated is drawn at its finished state: the counted number, the grown bar, the bodies at the end of their run.

## Install

```sh
pnpm add @ai-gui/image playwright
pnpm exec playwright install chromium
```

Playwright is an optional peer dependency. Without it every render throws `BrowserUnavailableError`, so a host can treat pictures as a bonus rather than a requirement.

On Linux the container also needs CJK faces, or Chinese renders as tofu in the delivered image:

```sh
apt-get install -y fonts-noto-cjk
```

Maths needs nothing: KaTeX's stylesheet and all twenty of its font faces are inlined into the page, so formulas typeset correctly with no network and no system fonts. Only CJK text depends on what the host has installed.

## Usage

```ts
import { renderMarkdownToImages } from "@ai-gui/image"

const { text, images } = await renderMarkdownToImages(answer, { outDir: "/tmp/aigui" })
// text   — the answer with every rendered block removed
// images — [{ kind: "chart", path: "/tmp/aigui/aigui-chart-0-83421-0.png", width, height }]
```

Blocks that fail to render are left in `text` as their original source, so a broken diagram costs a picture, never the answer.

## Exports

- `renderMarkdownToImages(markdown, options)` — the whole job.
- `selectRenderableBlocks(markdown, options)` / `stripBlocks(markdown, selections)` — the pure parts, if you want to drive rendering yourself.
- `hasTrigger(markdown)` — a cheap pre-filter for hot paths.
- `closeBrowser()` — shut the resident Chromium down now instead of waiting for the idle timer.
- `BrowserUnavailableError` — thrown when Playwright is not installed.
- Types — `RenderOptions`, `RenderResult`, `RenderedImage`, `BlockSelection`, `RenderableKind`, `SelectOptions` — plus the `DEFAULT_KINDS` / `DEFAULT_WIDTH` / `DEFAULT_SCALE` / `DEFAULT_MAX` / `DEFAULT_TIMEOUT_MS` / `DEFAULT_IDLE_SHUTDOWN_MS` constants backing the defaults below.

## Options

- `outDir` — where PNGs are written (required).
- `kinds` — which families to draw. Default: all ten — `chart`, `mermaid`, `dashboard`, `card`, `math`, `table`, `scene`, `gravity`, `bigscreen`, `molecule`.
- `theme` — `"light"` (default) or `"dark"`.
- `width` — viewport width in CSS pixels. Default 720.
- `scale` — device pixels per CSS pixel. Default 2, which is what a phone screen wants.
- `max` — cap on pictures per call. Default 6; the rest stay as text.
- `timeoutMs` — per-block budget. Default 10000.
- `idleShutdownMs` — how long the browser stays resident with nothing to do. Default 300000.

## Cost when there is nothing to draw

`renderMarkdownToImages` parses before it launches anything, and returns the source untouched if no block qualifies. The browser is lazy and shuts itself down after five idle minutes, so a process that renders one chart an hour does not hold a Chromium open in between.

## Testing

The screenshot tests need a real browser and are opt-in:

```sh
pnpm exec playwright install chromium
AIGUI_IMAGE_E2E=1 pnpm exec vitest run --project image render.e2e
```
