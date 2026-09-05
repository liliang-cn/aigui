---
"@ai-gui/core": patch
"@ai-gui/plugin-mermaid": patch
"@ai-gui/plugin-molecule": patch
"@ai-gui/openclaw": patch
---

Dependencies move to their current patch and minor releases, plus one major that
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
