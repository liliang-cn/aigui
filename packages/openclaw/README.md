# @ai-gui/openclaw

An [OpenClaw](https://openclaw.ai) plugin that renders [AIGUI](../../README.md) blocks as images, so charts, diagrams, formulas, tables, cards, dashboards, 3D scenes, orbits, data walls and molecules survive a channel that only carries pictures — WeChat above all.

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

If the Gateway is a failover resource, run the Chromium and font steps on **every** node it can land on. The plugin itself travels with the shared state directory, but Playwright's browser lives under the Gateway user's `$HOME/.cache`, which is normally local disk — so a node that has never had it installed silently degrades every reply to text the moment the resource moves there. Architectures may differ across the set (an arm64 node needs its own arm64 build); `playwright install` picks the right one per node.

The CJK fonts are not optional on Linux: without them every Chinese label in a chart or table renders as tofu (□□□) in the delivered image, and a picture cannot fall back to another font the way a web page can. Maths needs nothing extra — KaTeX's stylesheet and all twenty of its font faces are inlined into the rendered page.

### Checking it loaded

Check the Gateway's own startup line, not the CLI:

```sh
journalctl -u openclaw | grep "http server listening"
```

`ai-gui` must appear in the plugin list it prints — that list is the Gateway's loaded plugins, and it is the only place that answers the question.

`openclaw plugins inspect ai-gui --runtime --json` is worth running for `aigui_render` in `toolNames`, but do not read its `"status": "loaded"`, `"activated": true` and `"hookCount": 2` as proof: the CLI activates the plugin inside its **own** process to answer, so it reports all three even when the Gateway never activated it and every reply is going out with the fence intact. A plugin whose manifest lacks `activation.onStartup` is loaded but not activated at Gateway start, and the hooks it registers later in the agent runtime never reach the global hook runner that `reply_payload_sending` dispatches through. This manifest sets it; a fork that drops it will fail exactly this way, silently.

If Chromium is missing the plugin still loads and every reply is delivered as plain text — the failure is logged once, not per message, so check the Gateway log rather than waiting for it to repeat.

### The WeChat channel needs one more thing (OpenClaw ≤ 2026.7.1)

`reply_payload_sending` is dispatched by OpenClaw's core delivery pipeline — but the `@tencent-weixin/openclaw-weixin` channel plugin (verified at 2.4.6) runs its own inbound→agent→send pipeline through `dispatchReplyFromConfig`, an entry point that never installs this hook. Core only installs it in the `dispatchInboundMessage*` entry points. The result: on the one channel this plugin exists for, the hook never fires, silently.

Until that is fixed upstream, the channel plugin's `deliver` callback (in `dist/src/messaging/process-message.js`) needs a small patch: call `getGlobalHookRunner()?.runReplyPayloadSending({ payload, kind: info?.kind ?? "final", channel: "openclaw-weixin", runId, context }, context)` before it extracts `text`/`mediaUrl` from the payload, honour `result.cancel`, and replace the payload with `result.payload` when set — the result is a `{ payload, cancel, reason }` envelope, not a payload. The callback already receives `(payload, info)`; the stock code just ignores the second argument. Note the channel sends only `payload.mediaUrls[0]`, so one picture per reply reaches WeChat.

Do not try to verify any of this with `openclaw agent --deliver`: that CLI path delivers through the agent-command pipeline, which also skips the hook. Only a real inbound WeChat message exercises the channel pipeline; success is the channel log's `outbound:` line flipping from `mediaUrl=none` to `media sent OK`.

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
- `blocks` — which block kinds to draw. Defaults to all ten: `chart`, `mermaid`, `dashboard`, `card`, `math`, `table`, `scene`, `gravity`, `bigscreen`, `molecule`. The last four arrived with 0.35: a 3D scene, an orbit or collision figure, a data wall, and a molecule, each as one still picture.
- `theme` — `"light"` (default) or `"dark"`.
- `width` — viewport width in CSS pixels. Default 720.
- `scale` — device pixels per CSS pixel. Default 2, which is what a phone screen wants.
- `maxImages` — cap on pictures per reply. Default 6; the rest stay as text.
- `timeoutMs` — per-block render budget. Default 10000.
- `idleShutdownMs` — how long the resident browser stays open with nothing to do. Default 300000 (five minutes).

## Cost when idle

An ordinary text conversation pays nothing. The hook checks the channel, then the payload lane (skipping reasoning, commentary, status notices and errors), then a cheap regex — and only calls into the renderer, which is what launches Chromium, once that regex has confirmed there is a real block to draw. The browser shuts itself down after five idle minutes.
