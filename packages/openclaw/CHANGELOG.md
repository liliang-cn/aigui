# @ai-gui/openclaw

## 0.39.1

### Patch Changes

- 25740cc: Dependencies move to their current patch and minor releases, plus one major that
  turned out to be a types requirement wearing a major's clothes.

  `@ai-gui/core` takes dompurify 3.4.14, markdown-it 14.3.1, and
  markdown-it-cjk-friendly 3.0.0. The last of those is the only major in this
  release. Its sole stated breaking change is that it now needs
  `@types/markdown-it` at 14.2.0 or later, so its declarations line up with
  markdown-it v15; the rule it exists for — the one that keeps `**粗体**` written
  tight against a CJK character from rendering as literal asterisks — is
  unchanged, and upstream states v14 remains supported. The types peer is
  declared optional, so a consumer who never installs `@types/markdown-it` is
  asked for nothing.

  The other shipped bumps are mermaid 11.17.2 in `@ai-gui/plugin-mermaid`,
  openchemlib 9.25.0 in `@ai-gui/plugin-molecule` (whose 22 vendored conformer
  resources were regenerated against it), and playwright 1.63.0 in
  `@ai-gui/openclaw`. Everything else that moved is development-only: vue 3.5.42,
  @vue/test-utils 2.5.0, @testing-library/react 16.3.3, turbo 2.10.12, publint
  0.3.24, ws 8.21.3, and the `@types/*` packages.

  echarts-gl went 2.0.9 → 2.1.0, which widens its own echarts peer to
  `^5.1.2 || ^6.0.0`. echarts itself stays on 5. That peer was the single thing
  pinning it there, so echarts 6 is now reachable — but it repaints every chart
  this SDK draws, and it deserves a release that looks at the output rather than a
  line in a dependency refresh.

  The majors left behind, and why. Four are gated on Node: CI builds on 20 and 22,
  while vitest 5, jsdom 30 and tsdown 0.23 all require 22.11 or newer, and
  @changesets/cli 3 additionally wants pnpm ≥ 10 against the 9.12.0 this repo
  pins. markdown-it 15 pulls in linkify-it v6, which stops autolinking fuzzy links
  by default — a change to what this renderer puts on the page, not just to how it
  is built. katex 0.18 prefixes its CSS class names, which both the generated
  stylesheet in `@ai-gui/plugin-katex` and `@ai-gui/image`'s `katex-display`
  detection read by name. shiki 1 → 4 is three majors across a module the tests
  mock and the plugin wraps in a `catch` that falls back to plain `<pre>`, so
  green gates would be evidence of nothing. react stays at 18 because 18 is the
  floor `peerDependencies` declares, and the dev matrix is what checks that floor
  still holds. vite 8, typescript 7 and @types/node 26 are each worth their own
  pass.

  - @ai-gui/image@0.39.1

## 0.39.0

### Patch Changes

- @ai-gui/image@0.39.0

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
