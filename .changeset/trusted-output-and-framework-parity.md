---
"@ai-gui/core": minor
"@ai-gui/react": minor
"@ai-gui/vue": minor
"@ai-gui/vanilla": minor
"@ai-gui/plugin-mermaid": minor
---

A plugin can declare that it built its own markup, and Vue and vanilla catch up with React.

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
