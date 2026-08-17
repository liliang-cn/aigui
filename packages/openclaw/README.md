# @ai-gui/openclaw

An [OpenClaw](https://openclaw.ai) plugin that renders [AIGUI](../../README.md) blocks as images, so charts, diagrams, formulas, tables, cards and dashboards survive a channel that only carries pictures — WeChat above all.

WeChat messages are text or media, nothing else. Without this, a ` ```chart ` fence arrives as a wall of ECharts JSON.

## Install

Run these on the machine the Gateway runs on, not on your laptop:

```sh
openclaw plugins install "@ai-gui/openclaw"
openclaw config set plugins.entries.ai-gui.enabled true
```

Playwright arrives as a normal dependency, but OpenClaw installs plugins with `--ignore-scripts`, so the browser binary it would normally fetch does not come with it. Install it once, and on Linux take the system libraries too:

```sh
# Linux gateway
npx playwright install --with-deps chromium
apt-get install -y fonts-noto-cjk

# macOS gateway
npx playwright install chromium
```

Then restart:

```sh
openclaw gateway restart
```

The CJK fonts are not optional on Linux: without them every Chinese label in a chart or table renders as tofu (□□□) in the delivered image, and a picture cannot fall back to another font the way a web page can. Maths needs nothing extra — KaTeX's stylesheet and all twenty of its font faces are inlined into the rendered page.

### Checking it loaded

```sh
openclaw plugins inspect ai-gui --runtime --json
```

Expect `"status": "loaded"`, `"activated": true`, `"hookCount": 2`, and `aigui_render` in `toolNames`. If Chromium is missing the plugin still loads and every reply is delivered as plain text — the failure is logged once, not per message, so check the Gateway log rather than waiting for it to repeat.

## What it does

Two paths, both optional to use:

- **Automatic.** A `reply_payload_sending` hook scans outbound replies on the configured channels, draws any renderable block, removes the fence from the text, and attaches the PNGs. The model needs to know nothing about it.
- **Deliberate.** The optional `aigui_render` tool lets the model draw on purpose and returns file paths for the `message` tool to attach. It is marked `optional` in the manifest, so it stays invisible to the model until an operator adds it with `tools.allow`.

A drawing that fails never costs the answer: the reply is delivered as written, fence and all.

## Configuration

```json5
{
  plugins: {
    entries: {
      "ai-gui": {
        enabled: true,
        config: {
          channels: ["openclaw-weixin"],
          blocks: ["chart", "mermaid", "dashboard", "card", "math", "table"],
          theme: "light",
          width: 720,
          scale: 2,
          maxImages: 6,
          timeoutMs: 10000,
          idleShutdownMs: 300000,
        },
      },
    },
  },
}
```

All keys are optional and fall back to the defaults shown above if omitted or malformed — a typo in the config file leaves that one setting at its default rather than stopping replies from being delivered.

- `channels` — which OpenClaw channel ids get pictures. Defaults to WeChat alone (`openclaw-weixin`). Telegram and Slack already render markdown well, so turning pictures on for them is a decision an operator states rather than one an install makes.
- `blocks` — which block kinds to draw. Defaults to all six: `chart`, `mermaid`, `dashboard`, `card`, `math`, `table`.
- `theme` — `"light"` (default) or `"dark"`.
- `width` — viewport width in CSS pixels. Default 720.
- `scale` — device pixels per CSS pixel. Default 2, which is what a phone screen wants.
- `maxImages` — cap on pictures per reply. Default 6; the rest stay as text.
- `timeoutMs` — per-block render budget. Default 10000.
- `idleShutdownMs` — how long the resident browser stays open with nothing to do. Default 300000 (five minutes).

## Cost when idle

An ordinary text conversation pays nothing. The hook checks the channel, then the payload lane (skipping reasoning, commentary, status notices and errors), then a cheap regex — and only calls into the renderer, which is what launches Chromium, once that regex has confirmed there is a real block to draw. The browser shuts itself down after five idle minutes.
