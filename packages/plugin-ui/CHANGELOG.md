# @ai-gui/plugin-ui

## 0.36.2

### Patch Changes

- @ai-gui/core@0.36.2

## 0.36.1

### Patch Changes

- @ai-gui/core@0.36.1

## 0.36.0

### Patch Changes

- 312391d: A `ui` block's rules now say what each action _wants_, not just its name.

  The spec listed registered actions as bare names while listing every card with its fields. Asked in a real product to draw a form that adds a schedule, a model bound the start time to `when` against an action that required `start_at` — a perfectly reasonable name it had no way to check — and the dispatch was rejected before it reached the host, with the form looking correct on screen.

  `ActionRuntime.describeAction(type)` in `@ai-gui/core` returns one action's parameter schema and nothing else. It is deliberately narrower than `registry.get`: a schema is a description, while an `ActionDefinition` carries `run`, and handing that out is handing out the side effect. `@ai-gui/plugin-ui` reads it to print each action as `name: param*(type), …`, the same shape it already used for cards, with `*` marking required — for cards too, since a model that cannot tell required from optional fills in neither or both. The method is optional on the plugin's `UIActionRuntime` interface, so a host passing its own runtime object keeps working.

- Updated dependencies [312391d]
  - @ai-gui/core@0.36.0

## 0.35.2

### Patch Changes

- 3163870: `@ai-gui/plugin-ui`'s prompt spec now shows the shape instead of listing the node names.

  It named the twelve node kinds and stopped. Asked in a real product for a to-do list with a form, a model wrote `{"type":"stack"}` with no ids, `"action":"save"` as a string on the form, and `"name"` on the fields — every one a reasonable guess from the names alone, and every one refused. Because the block is all-or-nothing, the reader got the refusal line instead of an interface. The sibling blocks models get right on the first try all carry a worked example.

  So this one does too: `kind` is named as the discriminator (`type` is the natural wrong guess), every kind's required keys are spelled out, and the example exercises the two shapes that were guessed wrong — a form's `submit` object and a button's `action` object — with a registered action substituted in. A test parses the example straight out of the spec through the plugin's own validator, so the rules cannot drift into teaching a document that will not render.

  - @ai-gui/core@0.35.2

## 0.35.1

### Patch Changes

- 25e8e18: `@ai-gui/plugin-ui`'s tone colours are actually overridable now.

  0.35.0 introduced `--aigui-ui-positive` / `--aigui-ui-warning` / `--aigui-ui-critical` and documented them as a host seam, but shipped their defaults on plain attribute selectors. The plugin's stylesheet is injected when the plugin loads, after the host's own has been parsed, so an override written at the same specificity lost on order alone — and the dark default, `[data-aigui-ui][data-aigui-ui-theme="dark"]`, matched exactly the doubled selector a host reaches for when it notices the first attempt did nothing. A host that reported a theme could not change these colours at all.

  Every default is now declared inside `:where()`, which contributes no specificity, so writing the property anywhere wins.

  - @ai-gui/core@0.35.1

## 0.35.0

### Minor Changes

- d8ca2eb: `@ai-gui/plugin-ui` now speaks the host's language and says what went wrong.

  The strings the plugin draws itself — a field's "required" line, an action's failure line, the line shown in place of a block that will not render — were English regardless of the host, and the model-facing rules ignored the locale the renderer passes every other plugin, so a Chinese product got one English paragraph in the middle of its prompt and English chrome around Chinese content. English and `zh-CN` now ship for both, following the renderer's locale or an explicit `ui({ locale })`.

  A failed action used to say "Action failed." whatever happened, from a `safeActionError` whose two branches were the same sentence. It now tells the runtime failures apart, because the reader's next move differs: invalid input to fix, a timeout to retry, a cancelled or unavailable action to stop at. Only the error's class is ever read — a message thrown by the host's own action code is still never shown, on a surface whose shape the model chose.

  A refused block names the rule that refused it, rather than reading "Invalid UI." A `UIDocumentError`'s issue is this plugin's own sentence about the document's shape, naming a JSON path and a rule, so it is safe to show and is the only way to tell a typo from a limit. Anything thrown from elsewhere stays unlabelled. The prompt spec also states plainly that one unregistered action name discards the whole block, and tells a model with no actions registered to emit no button and no form.

  Colours follow the page: table borders and the refusal line are mixed from the inherited text colour instead of full-strength `currentColor`, and the three tone colours resolve as a host-set `--aigui-ui-positive` / `--aigui-ui-warning` / `--aigui-ui-critical`, then the renderer's `theme`, then the OS preference. The error red was a hardcoded `#b42318`, which is a light-theme red sitting on a dark transcript.

### Patch Changes

- @ai-gui/core@0.35.0

## 0.34.0

### Patch Changes

- @ai-gui/core@0.34.0

## 0.33.0

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
