# Rendering AIGUI blocks as images in OpenClaw WeChat

Date: 2026-08-17

## Problem

OpenClaw talks to WeChat through Tencent's external `openclaw-weixin` channel plugin.
WeChat carries text and media — nothing else. A reply that contains a ` ```chart `
fence therefore arrives as a wall of raw ECharts JSON, and a Mermaid diagram arrives
as an unreadable pile of arrows. Every rich block AIGUI knows how to draw is lost the
moment the answer leaves the gateway.

AIGUI already renders all of these correctly in a browser. The gap is that nothing
turns that rendering into a PNG the WeChat channel can send.

## Goal

Charts, Mermaid diagrams, KaTeX math, tables, cards, and dashboards in an OpenClaw
reply arrive in WeChat as images, with the surrounding prose intact and readable.

Non-goals: WeChat group chats (the plugin advertises direct chats only), interactive
controls inside the image, and rendering for channels that already display markdown
well (Telegram, Slack) — those stay opt-in through configuration.

## Architecture

Two packages in this repo, split so the rendering capability does not depend on
OpenClaw at all.

```
packages/image/                  @ai-gui/image        — no OpenClaw import
  src/
    render.ts     renderMarkdownToImages(md, opts) -> RenderedImage[]
    browser.ts    long-lived Chromium: lazy launch, page reuse, idle shutdown
    page/         in-page bundle (tsdown -> single IIFE, shipped in dist):
                    @ai-gui/vanilla + chart/mermaid/katex/dashboard/ui plugins
                    exposes window.__aigui.render(markdown) -> block handles
    blocks.ts     createParserWithMetadata -> which blocks become images, and
                  where their source ranges are
    index.ts

packages/openclaw/               @ai-gui/openclaw     — thin
  src/
    hook.ts       reply_payload_sending: automatic interception
    tool.ts       aigui_render agent tool
    index.ts      plugin entry + config
```

`@ai-gui/image` knows only about markdown and images. `@ai-gui/openclaw` holds no
rendering logic — it rewrites payloads and writes files. The rendering path can be
tested to the pixel without starting a gateway, and an OpenClaw API change cannot
break it.

Playwright is a **peer dependency** of `@ai-gui/image`, not a dependency. Installing
any other AIGUI package must not drag in a 300 MB Chromium.

## Data flow

### Automatic path — the `reply_payload_sending` hook

Guards run cheapest-first and short-circuit, so an ordinary text conversation never
launches a browser:

1. Channel not in the allowlist (default: `openclaw-weixin` only) → return unchanged.
2. `payload.text` matches no trigger marker (regex for ` ```chart `, ` ```mermaid `,
   ` ```card: `, `$$`, table pipes) → return unchanged.
3. `isReasoning` / `isCommentary` / `isStatusNotice` / `isError` → skip; these are not
   answer prose.

Past the guards:

4. `createParserWithMetadata({ plugins })` parses the text into `nodes` plus
   `blocks[{ start, end }]`.
5. Node types configured as renderable are selected, carrying their source ranges.
6. `renderMarkdownToImages` writes PNGs under the OpenClaw state directory at
   `media/outbound/aigui/`. The state directory is resolved through the SDK, never
   hardcoded to `~/.openclaw`.
7. The payload is rewritten: source ranges are cut **back to front** so earlier
   offsets stay valid, leftover blank lines are collapsed, and
   `mediaUrls = [...existing, ...rendered]`.

### Deliberate path — the `aigui_render` tool

Parameters `{ markdown, theme?, width? }`. The tool renders, then returns text of the
form `图片已生成: <absolute path>`. The model attaches it with OpenClaw's built-in
`message` tool. This is the same route OpenClaw's own `image_generate` takes; no new
mechanism is invented.

Registered with `optional: true` and declared in the manifest under
`contracts.tools` plus `toolMetadata.aigui_render.optional`, so it requires an
explicit `tools.allow` opt-in.

## Failure handling

One rule: a failed drawing never swallows a reply.

| Situation | Behaviour |
| --- | --- |
| Render timeout (default 10 s) or thrown error | Original text sent verbatim, fences kept, one warn line |
| Chromium missing or fails to launch | Same, plus a single entry in plugin diagnostics (reported once, not per message) |
| One block fails | Only that block falls back to text; the others still render |
| More images than the cap (default 6) | First 6 render; the rest stay as text |
| Image too large for the channel | Downscaled through `api.runtime.media.resizeToJpeg` |

Browser lifecycle: lazy launch → shut down after 5 minutes idle → a crash is not
retried in place, the next render relaunches → disposed on gateway shutdown.

## Rendering internals

**The page.** `tsdown` builds `src/page/entry.ts` into a single IIFE shipped in
`dist`. At render time the browser gets `page.setContent(html)` plus
`addScriptTag({ path })` — entirely local, no network request. Styles come from
core's already-exported `baseCss` and `collectPluginStyles(plugins)`, so the image and
the web page share one source of styling rather than drifting apart.

**Knowing when drawing has finished.** This is the subtle part. AIGUI's `mount`
output is invoked synchronously, but what it starts — `mermaid.render`, ECharts
`init` — is asynchronous, and there is no settled signal to wait on. So:

1. Page CSS disables all `animation` and `transition`; the chart plugin is configured
   with `animation: false`. Nothing can be captured mid-frame.
2. After `push(markdown)`, await `document.fonts.ready`.
3. A MutationObserver waits for the block's subtree to stay unchanged for 150 ms. This
   is what covers Mermaid's asynchronous insertion.
4. Two `requestAnimationFrame` ticks, then `elementHandle.screenshot()`.
5. A hard 10 s timeout wraps the whole sequence; on expiry the block degrades per the
   table above.

Core's `exportRenderedImages` is deliberately **not** reused. It is a canvas route,
and to escape `foreignObject` canvas tainting it rewrites Mermaid's HTML labels into
plain SVG `<text>`, losing wrapping and styling. A Playwright element screenshot has
neither problem and keeps labels faithful.

**Fonts.** The page CSS pins a font stack that includes CJK faces. macOS ships those,
so Chinese renders correctly on this gateway. A Linux gateway needs `fonts-noto-cjk`;
that is a documented prerequisite in the README, not a runtime probe.

**Sizing.** A 720 px viewport at `deviceScaleFactor: 2` produces 1440 px PNGs, sharp
on a phone. Chart width is overridden to fit the viewport rather than using
plugin-chart's 600 × 400 default. Theme defaults to light — a WeChat user in dark mode
gets no adaptation from a raster image either way — and is configurable to dark.

## Testing

| Layer | Covers | Browser |
| --- | --- | --- |
| Pure functions | Block selection, back-to-front range stripping, blank-line collapsing, cap truncation | No — plain vitest |
| Hook | Guard short-circuits, payload rewriting, every degradation path (renderer injected as a fake) | No |
| Render | Real screenshots; one image per block family asserted non-empty, correctly sized, not blank | Yes |

The repo currently tests with jsdom and has no Playwright dependency. The screenshot
layer is a separate vitest project gated behind `AIGUI_IMAGE_E2E=1`, so it stays out of
`pnpm test` and CI does not fail for want of a browser.

## Configuration

```json5
{
  plugins: {
    entries: {
      "ai-gui": {
        enabled: true,
        config: {
          channels: ["openclaw-weixin"],
          blocks: ["chart", "mermaid", "math", "table", "card", "dashboard"],
          theme: "light",
          width: 720,
          scale: 2,
          maxImages: 6,
          timeoutMs: 10_000,
          idleShutdownMs: 300_000,
        },
      },
    },
  },
}
```

## Delivery order

1. `@ai-gui/image` — browser lifecycle, page bundle, `renderMarkdownToImages`, chart
   only. Pure-function and screenshot tests.
2. Remaining block families in the page bundle: mermaid, math, table, card, dashboard.
3. `@ai-gui/openclaw` — hook, guards, payload rewriting, degradation paths.
4. `aigui_render` tool plus manifest declarations.
5. READMEs for both packages, root README plugin list, changeset.
