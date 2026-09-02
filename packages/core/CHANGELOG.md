# @ai-gui/core

## 0.35.1

## 0.35.0

## 0.34.0

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

## 0.32.0

## 0.31.0

## 0.30.0

### Minor Changes

- BI dashboards as a first-class fence, and three fixes the first BI host hit in production use.

  - **New plugin `@ai-gui/plugin-dashboard`**: a ```dashboard fence renders a responsive grid of panels — table + live ECharts chart + provenance disclosure, or a per-panel refusal. The model decides the layout (title, panels, metric × dimension, chart type — the prompt spec says so explicitly); the host writes every row and SQL. One refused panel never blanks the rest of the board.
  - **`plugin-chart`**: `width: "container"` sizes a live chart to its mount element and follows it on resize (implies `interactive`). Hosts no longer hand-roll ResizeObservers.
  - **`plugin-resultset`**: columns may declare `{ name, align: "right" }`, so host-formatted strings ("9,308,286.52", "23.2%") still right-align; `meta: false` drops the meta line; `locale: "zh-CN"` localizes renderer-authored strings.
  - **`core`**: `baseCss` no longer forces `display:block` on tables inside `[data-aigui-resultset]` / `[data-aigui-dashboard]` — at equal specificity it silently defeated those plugins' `width:100%`, shrinking rows to a sliver inside a full-width shell.

## 0.29.2

## 0.29.1

## 0.29.0

### Minor Changes

- 893cb1e: Add `cardChannel(store, { onError? })`, a `StreamRouter` handler that applies card messages to a `CardStore`.

  The answer's text and everything arriving alongside it now have separate, documented paths. `Renderer` is a single-writer append-only buffer — markdown block boundaries cannot survive two sources interleaving into them — so progress, background jobs and late tool results ride their own channel and update a Card by id instead, in any order and as many times as they like.

  ```ts
  new StreamRouter()
    .channel("content", renderer)
    .on("cards", cardChannel(store, { onError }))
    .feed(response.body);
  ```

  Accepts `register`, `merge`, `replace` and `batch`. Not `delete`: a card the reader is looking at should not vanish because a late frame said so.

  Failures are reported through `onError` rather than thrown, because the handler runs inside one long `feed` await — a throw there would kill the content channel and truncate the answer. Unset, they go to `console.error`, since a silently dropped card is indistinguishable from one the model never sent.

## 0.28.0

## 0.27.0

## 0.26.0

## 0.25.0

## 0.24.0

## 0.23.1

### Patch Changes

- First release of `@ai-gui/plugin-resultset`: host-owned result tables. The
  application appends a ` ```resultset ` block from the rows it really returned,
  and the prompt spec tells the model not to retype figures into its prose.
  `plugin-evidence` proves which query ran; this proves the number in the sentence
  came from it.

## 0.23.0

### Minor Changes

- 5e15f72: Reject a plugin factory passed instead of a plugin, instead of silently rendering nothing.

  `plugins: [katex]` instead of `plugins: [katex()]` is the easiest mistake to make against this API
  and it used to be the quietest one. A function carries a `name` of its own — `"katex"` — so the
  renderer accepted it, found no `extendParser` and no `nodeRenderers`, and did nothing: no error, no
  warning, markdown still rendering, only the maths and the diagrams missing. A product can ship that
  way and nobody notices until someone asks why an equation is plain text.

  `Renderer`, `Renderer.setPlugins`, `collectNodeRenderers` and `createRenderer` now throw a
  `TypeError` naming the position and the fix — `plugins[0] is a factory function, not a plugin. Call
it: katex()` — and the same check rejects `null`, non-objects, and plugins with no `name`. The
  exported `assertPlugins` runs it directly.

  **This turns a silent no-op into a thrown error.** An application that has been passing factories
  has not been getting those plugins at all; it will now fail at construction instead of rendering
  without them.

  Also: `katexCss` is renamed to `katexCssImport` (the old name is kept as a deprecated alias). The
  value is an `@import` statement, not a stylesheet — the old name invited hosts to inject it into a
  `<style>`, where the browser resolves it against the page, 404s, and leaves every formula as a heap
  of overlapping spans. And every exported `*PromptSpec` function now says in its doc comment that
  `buildSystemPrompt({ registry, plugins, locale })` is the thing to call instead: assembling the
  guidance by hand loses the localized wording and silently omits any plugin added later.

## 0.22.1

### Patch Changes

- d2945bc: Parse emphasis CJK-friendly, so bold and italics close where CommonMark refuses to.

  CommonMark decides whether `**` may close from what surrounds it: preceded by punctuation, it must
  be followed by whitespace or punctuation. A CJK character is neither, so `**严格单调（单射）**的函数`
  — bold, a closing bracket, then more Chinese — left its asterisks on screen. The rule was written
  for scripts that separate words with spaces, and a model writing Chinese cannot avoid the shape.

  `markdown-it-cjk-friendly` now relaxes the flanking rules for East Asian text. ASCII parsing is
  unchanged: `a * b * c` and `snake_case_word` behave exactly as before.

## 0.22.0

### Minor Changes

- 7633f85: Deferred plugin loading, node-level clicks, and raw-HTML escaping.

  - `plugins` now takes a loader as well as an array in every adapter:
    `plugins: () => import("@ai-gui/plugin-mermaid").then((m) => [m.mermaid()])`. The answer renders
    as plain markdown until the import resolves; `Renderer.setPlugins` then swaps the grammar and
    reparses the buffered source, so the host neither holds the stream back nor replays what it
    pushed. A failed import leaves the answer as markdown and emits a `plugins-load-failed` debug
    event. Changing plugins no longer rebuilds the React/Vue session, so it no longer clears the
    answer or aborts an in-flight card action.
  - `onNodeClick(node, event)` reports which parsed block a click landed in, so a path in inline
    code or a citation can be actionable without reading the DOM the renderer rebuilds as it streams.
  - `rawHtml: false` escapes raw HTML the model wrote rather than interpreting it: a stray `<code>`
    in a sentence about code otherwise swallows the rest of the line into an element, which
    sanitizing cannot fix.
  - `plugin-katex` and `plugin-highlight` now carry a `promptSpec`, so `buildSystemPrompt({ plugins })`
    tells the model it may write TeX and must tag its code fences. `katex()` takes a `css` override,
    and the new `@ai-gui/plugin-katex/inline-css` entry supplies KaTeX's stylesheet as a string with
    a configurable `fontBase` for hosts that cannot import CSS.

## 0.21.1

## 0.21.0

### Minor Changes

- Host node renderers, automatic plugin styles, and locales

  **`nodeRenderers` on every adapter.** The renderers were collected from the plugins and never
  exposed, so a host that wanted its own code block — with its copy button — had to drop the plugin
  that claimed `code` and reimplement everything else it rendered. React, Vue and vanilla now accept
  a `nodeRenderers` map that merges over the plugin-collected one, host wins.

  **Plugin CSS is installed by the renderer.** `AIGuiPlugin.css` was declared by ten plugins and read
  by nobody, leaving every host to work out which of its plugins shipped styles and import each by
  hand. Each adapter now injects them, once per plugin name, and `collectPluginStyles` /
  `injectPluginStyles` are exported for hosts that manage their own document.

  **Blocks stay inside the viewport.** A base stylesheet ships with that injection: tables and code
  scroll within their own box, images and widgets are capped at the column width, and long URLs wrap
  — so an answer written without knowledge of the screen no longer pushes a phone page sideways.

  `@ai-gui/plugin-katex` now exposes `./style.css`, matching `@ai-gui/plugin-map`. Its `css` field is
  a bare-specifier `@import` that only a bundler can resolve, so it is skipped by the injector; import
  `@ai-gui/plugin-katex/style.css` instead.

  **Locales.** `buildSystemPrompt({ locale })` threads a BCP-47 tag through each plugin's
  `promptSpec`, and `locale` on the renderers reaches every plugin through `NodeRenderContext` — a
  product whose persona says "always answer in Chinese" no longer appends English rules to it, and the
  chrome plugins draw follows the page. `zh-CN` ships for the primitives, mermaid, chart and citation
  prompt specs and for the artifact workspace's labels; everything else falls back to English, which
  is also what an untranslated locale resolves to.

  `promptSpec` may now be `(locale?: string) => string`. Plugins that ignore the argument, and plain
  string specs, are unaffected.

  Also: `@ai-gui/plugin-evidence` joins the fixed version group it was missing from, so every public
  package shares one version again, and coverage is measured over package sources only — the
  playground's built vendor bundles were being counted, reporting 22% where the packages are at 95%.

## 0.20.2

### Patch Changes

- First release of `@ai-gui/plugin-evidence`: host-owned query provenance. The
  application appends an ` ```evidence ` fence from the statements it actually
  executed, and `evidencePromptSpec()` tells the model never to write one — a
  model that can invent a number can invent the query said to have produced it.

## 0.20.1

## 0.20.0

### Minor Changes

- b487b4d: **A diagram with labels can be exported again, and one that cannot no longer takes the others with it.**

  Mermaid lays every node label out as HTML inside a `<foreignObject>`, and a browser taints the canvas the
  moment an image containing one is drawn onto it — after which `toDataURL` throws `SecurityError`. So
  "Export PNG" on any answer containing a Mermaid diagram threw, and in a host without a boundary around
  that call it took the page down. Nothing about the diagram is unsafe; the rule is categorical.

  Each `<foreignObject>` is now replaced, in a copy, with plain SVG `<text>` at the same position carrying
  the same words. Labels come out plainer — no wrapping, no HTML styling — and the diagram exports, which
  the alternative did not offer. The drawing on the page is untouched.

  `exportRenderedImages` also changed in two ways. A drawing that still cannot be rasterised is skipped
  rather than thrown, with the new `onSkip(drawing, reason)` telling the caller which — an export that
  quietly returns three of four images has lost one without saying so. And KaTeX's own SVGs are left
  alone: it draws every radical and brace as an inline SVG, so a page with maths on it was exporting dozens
  of 20-pixel files with the actual diagram somewhere among them.

## 0.19.0

## 0.18.0

### Minor Changes

- a22ba20: **New package: `@ai-gui/plugin-flashcard` — cards to revise from.**

  The moment a vocabulary list stops being a list. A word shown beside its meaning is a word being
  _read_, and reading a word you have already read teaches nothing — what moves it into memory is being
  asked for it and finding out whether it came. So a card hides its back, and the person says how it went
  before they are told.

  ```flashcards
  {"version":1,"id":"de-week-1","gradeAction":"revise.word","cards":[{"id":"word-1","front":"der Kühlschrank","back":"冰箱","hint":"der Kühl-schrank","example":"Der Kühlschrank ist leer."}]}
  ```

  It schedules nothing: which card comes back tomorrow and which in a month is the host's, because only
  the host knows what else this person is learning and when they last saw it. What travels out is one
  grade per card — `again` / `hard` / `good` — through the same action allowlist a form's submission uses.
  Three grades because "I half knew it" is the commonest answer and a two-way split forces it into a lie
  in either direction.

  `reveal: "immediate"` shows both sides of every card and grades nothing, for the teaching moment: hiding
  the meaning of a word nobody has been told is a quiz on a lesson that has not happened.

  The answer is written into the DOM only when it is asked for, not merely hidden — `hidden` is a style,
  and an answer sitting in the card's text is one select-all away from being read first. Each card
  dispatches under its own `cardId`, so the runtime's dedupe means "this card graded twice in one breath"
  rather than dropping the second card's grade while the first is still in flight. Space or Enter reveals,
  `1` `2` `3` grade, and a number pressed before the answer is shown does nothing.

## 0.17.1

## 0.17.0

## 0.16.0

## 0.15.0

## 0.14.0

### Minor Changes

- 8539013: Add `@ai-gui/plugin-progress`: live progress steps for a long turn, several per request.

  A model that searches, reads three sources and then drafts spends a long time saying nothing, and a
  host-level "thinking…" is one line for the whole turn — it cannot say which step is running, which
  have finished, or that one failed.

  Steps are written by the model in a ```progress block and updated in place: emitting a step again with
the same `id` replaces it. That is what makes it usable rather than noisy, because a streamed answer is
  append-only, so an update _is_ a second block; without superseding, a turn reporting four steps three
  times would render twelve rows. Ownership is decided from the whole node list on commit, so it holds
  however the host re-parses the turn.

## 0.13.0

### Minor Changes

- e21640a: `@ai-gui/plugin-highlight`: follow the host's colour scheme instead of a theme fixed at construction.

  The theme was chosen when the plugin was built and the render context ignored, so code on a dark page
  came back set for a light one — correct markup, wrong ink, which is the same fault a chart has when it
  picks its own palette and just as easy to miss.

  `lightTheme` and `darkTheme` are both loaded up front and chosen per render from `context.theme`;
  `theme` still pins one for a host that wants that. A theme that was never loaded falls back to a
  loaded one rather than throwing at render time.

## 0.12.0

### Minor Changes

- 32f827c: `@ai-gui/plugin-form`: restore a submitted form with the answer in it.

  `submitted: true` marked every form done without saying what was answered, so a reloaded
  conversation showed a disabled question with nothing chosen — which claims to have been answered and
  cannot say with what. Two new options fix the round trip:

  - `restore(formId)` returns the `{ values, outcome? }` a form already has. The values are written
    into the controls before the form is locked, so the person sees their own answer. Without a stored
    `outcome` the fields' own `expect` is graded again, so a quiz comes back coloured without the host
    storing the marking.
  - `onSubmitted(formId, submission)` hands over what to persist. The action handler already saw the
    values but not which form they came from — the id was only inside `cardType`.

  A host that throws while persisting cannot break the form: the answer has already gone through.

## 0.11.1

### Patch Changes

- f84cb1d: `@ai-gui/plugin-figure`: fix two layout faults that only showed up on screen.

  Long notes were clipped against the edge of the drawing — "control center containing DNA" arrived as
  "trol center containing DNA" — because the space reserved beside the figure was a fixed allowance
  rather than the width of the text actually there. It is now estimated per side from the longest
  label and note, CJK glyphs counted wider than Latin.

  And a cell drawn as concentric membrane, cytoplasm and nucleus put every label in one gutter, since
  each part's side is taken from its position and they share a centre. A part with no side of its own
  now alternates, so both gutters are used.

## 0.11.0

### Minor Changes

- 58d1b6c: Add `@ai-gui/plugin-figure`: labelled figures, drawn from a declarative ```figure block.

  The diagram whose point is what the parts are called — a cell with its organelles named, a leaf's
  layers, apparatus with the parts a method refers to. Mermaid draws boxes joined by arrows and a
  chart draws data; neither draws a shape with a leader line pointing into it saying what it is.

  Labels are laid out by the plugin: each callout goes out to the side its part is already on and is
  stacked down that side top to bottom, so a model can name six organelles without also solving a
  layout problem whose result it cannot see. `y` increases upwards, matching `@ai-gui/plugin-physics`.

  Also: READMEs for `plugin-figure` and `plugin-physics`, each with an example a test parses, and
  `plugin-physics`'s package metadata no longer describes molecules.

## 0.10.0

## 0.9.0

## 0.8.0

## 0.7.0

### Minor Changes

- Let a handler say how a submission turned out, not just whether it ran.

  The lifecycle a card and an action report — idle, loading, success, error — answers "did the
  dispatch run". It cannot answer "was the answer right": a student who picks the wrong option
  submits perfectly well, so the action succeeded and nothing on screen said otherwise. The form
  plugin discarded the handler's result entirely, disabling itself and reading "Submitted" whether
  the answer was right or wrong.

  A handler can now return `{ tone: "warning", message, fields }` — on its own or under an `outcome`
  key beside its own data. The form marks itself `data-aigui-form-outcome`, shows the message in a
  slot of its own, and marks the field the answer came from, so a host styles a wrong answer without
  reading it as a failed request. A card carries the same verdict on its success state, where a
  custom card's render can see it.

  Adding "warning" to the lifecycle instead would have folded a wrong answer in with a failed
  request, which is the one distinction a host needs to keep.

## 0.6.2

## 0.6.1

## 0.6.0

### Minor Changes

- 57d6aef: A plugin can declare that it built its own markup, and Vue and vanilla catch up with React.

  `RenderOutput` html takes `trusted: true`. Sanitizing a diagram strips the `foreignObject` that
  holds every label in it, so hosts bypassed their sanitizer by matching the mermaid plugin's
  internal id prefix with a regular expression — which broke whenever the plugin renamed its ids and
  let any model output wearing that prefix through unsanitized. The mermaid plugin now says so
  itself, and a host that disagrees sets `sanitize: { trustPlugins: false }`. The three framework
  bindings share one `sanitizeRenderedHtml` so they cannot drift apart on what sanitizing means.

  Vue and vanilla receive the host contract 0.5.0 gave React. Both take a theme and hand it to
  plugins — 0.5.0 put the theme in the `NodeRenderer` contract but only React passed it, so a Vue or
  vanilla app with plugin-chart still drew a light plot area on a dark page. Vue takes a `text` prop
  and emits `render`; vanilla gains `setText`, `setTheme` and an `onRender` option, so neither is
  back to keeping its own record of what it already pushed.

  `exportImages` is on the React handle, the Vue expose and the vanilla renderer. The element the
  drawings live in belongs to the renderer, so finding them was the host's problem.

## 0.5.0

### Minor Changes

- 401fce1: Let the host describe what it wants rendered instead of driving the renderer by hand.

  `AIRenderer` takes a `text` prop and works out the delta itself. Streaming an answer meant every
  host kept its own record of what it had already pushed, diffed against it, noticed when the new
  text was not a continuation, and reset — and then had to undo that record when StrictMode's
  remount emptied the renderer underneath it.

  `onRender` reports the nodes on screen. Knowing whether an answer produced a chart previously
  meant watching the DOM for whatever elements a plugin happened to create.

  `theme` reaches plugins through a second argument to `NodeRenderer`, so a diagram or a chart can
  follow the page it is embedded in. Mermaid re-initialises when the theme changes rather than
  freezing on whichever diagram rendered first, and charts pass the scheme to ECharts.

  `exportSVGToImage`, `exportRenderedImages` and `downloadImage` save what a plugin drew. Every host
  was rewriting the serialize-load-canvas dance, and getting the background and the pixel ratio
  wrong in its own way.

  The renderer session is now keyed on the plugins themselves rather than the array holding them.
  `plugins={[chart, katex]}` is a new array on every render, and rebuilding the session for it threw
  away the answer mid-stream.

## 0.4.4

## 0.4.3

## 0.4.2

## 0.4.1

## 0.4.0

### Minor Changes

- Add plugin authoring helpers, secure source citation blocks, revisioned artifacts, bounded declarative AI-generated UI trees, molecular structures, and interactive maps.

## 0.3.0

### Minor Changes

- 43cb2a4: Add opt-in runtime debug events, a bounded and redacted DevTools timeline, and a deterministic stream simulator.
- c309584: Add the safe framework-neutral form plugin and ActionRuntime allowlist introspection.
- Add the v0.3 generative UI runtime with registered action execution, stateful cards, declarative forms, model stream adapters, debug instrumentation, and DevTools simulation support.
- d637f4d: Add provider-neutral model stream events, transport helpers, mock streams, and OpenAI, Anthropic, and Vercel AI adapters.

## 0.2.0

### Minor Changes

- Improve streaming correctness, cancellation, incremental parsing, adapter lifecycles, plugin loading, chart coverage, sanitization, and release validation.
