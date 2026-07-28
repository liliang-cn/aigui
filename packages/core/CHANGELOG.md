# @ai-gui/core

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
