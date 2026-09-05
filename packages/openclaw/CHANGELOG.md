# @ai-gui/openclaw

## 0.38.0

### Patch Changes

- @ai-gui/image@0.38.0

## 0.37.1

### Patch Changes

- @ai-gui/image@0.37.1

## 0.37.0

### Patch Changes

- @ai-gui/image@0.37.0

## 0.36.3

### Patch Changes

- @ai-gui/image@0.36.3

## 0.36.2

### Patch Changes

- @ai-gui/image@0.36.2

## 0.36.1

### Patch Changes

- @ai-gui/image@0.36.1

## 0.36.0

### Patch Changes

- @ai-gui/image@0.36.0

## 0.35.2

### Patch Changes

- @ai-gui/image@0.35.2

## 0.35.1

### Patch Changes

- @ai-gui/image@0.35.1

## 0.35.0

### Minor Changes

- e0c759a: `@ai-gui/image` now draws four more block families — ` ```scene `, ` ```gravity `, ` ```bigscreen ` and ` ```molecule ` — so a picture-only channel gets the 3D scene, the orbit, the data wall and the molecule as PNGs. The WebGL ones render through SwiftShader in headless Chromium (the launcher now passes the flags that enable it), the animated ones are drawn at their finished state, and the page waits for a canvas to paint before it screenshots. `@ai-gui/openclaw` accepts the four new names in `blocks` and draws them by default.

### Patch Changes

- Updated dependencies [e0c759a]
  - @ai-gui/image@0.35.0

## 0.34.0

### Patch Changes

- @ai-gui/image@0.34.0

## 0.33.0

### Patch Changes

- @ai-gui/image@0.33.0

## 0.32.0

### Patch Changes

- Declare `activation.onStartup` in the plugin manifest, without which the reply hook never runs.

  OpenClaw loads a plugin at Gateway start but only _activates_ one whose manifest asks for it. Without the flag the plugin's `register` ran later, in the agent runtime, and the `reply_payload_sending` hook it adds there never reached the global hook runner the delivery path dispatches through — so every reply on a configured channel went out with its fence intact and no picture attached.

  The failure was invisible from the usual vantage point: `openclaw plugins inspect ai-gui --runtime` activates the plugin inside the CLI's own process to answer, and so reported `status: loaded`, `activated: true` and `hookCount: 2` the whole time. The README now points at the Gateway's own startup line instead, and a manifest test pins the flag.

  Also documented: in a failover cluster, Playwright's browser lives under the Gateway user's local `$HOME/.cache`, so every node the resource can land on needs its own `playwright install` and CJK fonts.

  Documented a second, independent blocker found the same day: the `@tencent-weixin/openclaw-weixin` channel plugin (2.4.6, on OpenClaw ≤ 2026.7.1) delivers replies through `dispatchReplyFromConfig`, a core entry point that never installs `reply_payload_sending` — so on the WeChat channel the hook cannot fire at all without a small patch to the channel plugin's `deliver` callback. The README describes the patch, the `{ payload, cancel, reason }` result envelope it must unwrap, and why `openclaw agent --deliver` can never be used to verify any of this. Verified end to end on a live gateway: a real WeChat message now arrives as summary text plus a rendered chart image.

  - @ai-gui/image@0.32.0

## 0.31.0

### Minor Changes

- ab9dfba: Render AIGUI blocks as images for channels that only carry pictures.

  `@ai-gui/image` runs the real vanilla renderer in a headless Chromium and screenshots each chart, Mermaid diagram, KaTeX formula, table, card, or dashboard. `@ai-gui/openclaw` is an OpenClaw plugin that uses it to rewrite outbound replies, so a chart reaches WeChat as a chart rather than as ECharts JSON. A block that fails to render is left as text; the answer is never lost to a failed drawing.

### Patch Changes

- Updated dependencies [ab9dfba]
  - @ai-gui/image@0.31.0
