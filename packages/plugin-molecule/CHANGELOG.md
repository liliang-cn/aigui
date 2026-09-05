# @ai-gui/plugin-molecule

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

- Updated dependencies [25740cc]
  - @ai-gui/core@0.39.1

## 0.39.0

### Patch Changes

- @ai-gui/core@0.39.0

## 0.38.0

### Patch Changes

- @ai-gui/core@0.38.0

## 0.37.1

### Patch Changes

- @ai-gui/core@0.37.1

## 0.37.0

### Patch Changes

- @ai-gui/core@0.37.0

## 0.36.3

### Patch Changes

- @ai-gui/core@0.36.3

## 0.36.2

### Patch Changes

- @ai-gui/core@0.36.2

## 0.36.1

### Patch Changes

- @ai-gui/core@0.36.1

## 0.36.0

### Patch Changes

- Updated dependencies [312391d]
  - @ai-gui/core@0.36.0

## 0.35.2

### Patch Changes

- @ai-gui/core@0.35.2

## 0.35.1

### Patch Changes

- @ai-gui/core@0.35.1

## 0.35.0

### Patch Changes

- @ai-gui/core@0.35.0

## 0.34.0

### Minor Changes

- 63c320f: `view: "3d"` now works from SMILES. The 3D coordinates are generated with OpenChemLib's conformer generator and relaxed with an MMFF94s minimisation (hydrogens added, fixed seed, so the same SMILES always draws the same structure), which is what makes 3D reachable for a model at all — it writes SMILES fluently and a Molfile with real z coordinates almost never. A Molfile in 3D still needs genuine spatial coordinates. New option `maxConformerAtoms` (default 64 heavy atoms) bounds the search, which runs on the main thread. The tables both steps read are vendored at build time and loaded lazily; nothing is fetched at runtime.

  Highlights in the space-filling style now show: the marked atoms are recoloured, where before a smaller amber sphere was drawn inside the atom's own and never seen.

### Patch Changes

- @ai-gui/core@0.34.0

## 0.33.0

### Minor Changes

- Prompt specs teach the block shape that actually parses.

  Eleven specs demonstrated their block on a single line — ` ```list {"items":[…]}``` `
  — and a model that copies that exactly produces no block at all. A fence's
  info string may not contain backticks, so CommonMark reads the line as an
  inline code span: the reader gets raw JSON running through the middle of a
  sentence, and an empty code block where the list should have been. The
  mistake is invisible from the model's side, which emitted precisely what it
  was shown.

  Every spec now shows the multi-line form, `buildSystemPrompt` states the rule
  once before the specs it governs (new export: `fencingRule`), and a test lints
  every package's model-facing text so the shape cannot come back.

  Hosts that assemble guidance themselves rather than calling `buildSystemPrompt`
  should prepend `fencingRule(locale)`.

### Patch Changes

- Updated dependencies
  - @ai-gui/core@0.33.0

## 0.32.0

### Patch Changes

- @ai-gui/core@0.32.0

## 0.31.0

### Patch Changes

- @ai-gui/core@0.31.0

## 0.30.0

### Patch Changes

- Updated dependencies
  - @ai-gui/core@0.30.0

## 0.29.2

### Patch Changes

- @ai-gui/core@0.29.2

## 0.29.1

### Patch Changes

- @ai-gui/core@0.29.1

## 0.29.0

### Patch Changes

- Updated dependencies [893cb1e]
  - @ai-gui/core@0.29.0

## 0.28.0

### Patch Changes

- @ai-gui/core@0.28.0

## 0.27.0

### Patch Changes

- @ai-gui/core@0.27.0

## 0.26.0

### Patch Changes

- @ai-gui/core@0.26.0

## 0.25.0

### Patch Changes

- @ai-gui/core@0.25.0

## 0.24.0

### Patch Changes

- @ai-gui/core@0.24.0

## 0.23.1

### Patch Changes

- First release of `@ai-gui/plugin-resultset`: host-owned result tables. The
  application appends a ` ```resultset ` block from the rows it really returned,
  and the prompt spec tells the model not to retype figures into its prose.
  `plugin-evidence` proves which query ran; this proves the number in the sentence
  came from it.
- Updated dependencies
  - @ai-gui/core@0.23.1

## 0.23.0

### Patch Changes

- Updated dependencies [5e15f72]
  - @ai-gui/core@0.23.0

## 0.22.1

### Patch Changes

- Updated dependencies [d2945bc]
  - @ai-gui/core@0.22.1

## 0.22.0

### Patch Changes

- Updated dependencies [7633f85]
  - @ai-gui/core@0.22.0

## 0.21.1

### Patch Changes

- @ai-gui/core@0.21.1

## 0.21.0

### Patch Changes

- Updated dependencies
  - @ai-gui/core@0.21.0

## 0.20.2

### Patch Changes

- First release of `@ai-gui/plugin-evidence`: host-owned query provenance. The
  application appends an ` ```evidence ` fence from the statements it actually
  executed, and `evidencePromptSpec()` tells the model never to write one — a
  model that can invent a number can invent the query said to have produced it.
- Updated dependencies
  - @ai-gui/core@0.20.2

## 0.20.1

### Patch Changes

- @ai-gui/core@0.20.1

## 0.20.0

### Patch Changes

- Updated dependencies [b487b4d]
  - @ai-gui/core@0.20.0

## 0.19.0

### Patch Changes

- @ai-gui/core@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [a22ba20]
  - @ai-gui/core@0.18.0

## 0.17.1

### Patch Changes

- @ai-gui/core@0.17.1

## 0.17.0

### Patch Changes

- @ai-gui/core@0.17.0

## 0.16.0

### Patch Changes

- @ai-gui/core@0.16.0

## 0.15.0

### Patch Changes

- @ai-gui/core@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [8539013]
  - @ai-gui/core@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [e21640a]
  - @ai-gui/core@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [32f827c]
  - @ai-gui/core@0.12.0

## 0.11.1

### Patch Changes

- Updated dependencies [f84cb1d]
  - @ai-gui/core@0.11.1

## 0.11.0

### Patch Changes

- Updated dependencies [58d1b6c]
  - @ai-gui/core@0.11.0

## 0.10.0

### Patch Changes

- @ai-gui/core@0.10.0

## 0.9.0

### Patch Changes

- @ai-gui/core@0.9.0

## 0.8.0

### Patch Changes

- @ai-gui/core@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies
  - @ai-gui/core@0.7.0

## 0.6.2

### Patch Changes

- @ai-gui/core@0.6.2

## 0.6.1

### Patch Changes

- @ai-gui/core@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [57d6aef]
  - @ai-gui/core@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [401fce1]
  - @ai-gui/core@0.5.0

## 0.4.4

### Patch Changes

- @ai-gui/core@0.4.4

## 0.4.3

### Patch Changes

- @ai-gui/core@0.4.3

## 0.4.2

### Patch Changes

- @ai-gui/core@0.4.2

## 0.4.1

### Patch Changes

- @ai-gui/core@0.4.1

## 0.4.0

### Minor Changes

- Add plugin authoring helpers, secure source citation blocks, revisioned artifacts, bounded declarative AI-generated UI trees, molecular structures, and interactive maps.

### Patch Changes

- Updated dependencies
  - @ai-gui/core@0.4.0

## 0.3.0

### Minor Changes

- Add strict, complete-gated molecular structure rendering for SMILES and Molfile definitions.
- Add sanitized responsive OpenChemLib 2D SVG output and lazily loaded interactive 3Dmol rendering with deterministic styles and lifecycle cleanup.
- Add public parsing, validation, prompt, option, result, error, definition, and CSS APIs.
