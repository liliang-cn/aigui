---
"@ai-gui/core": minor
"@ai-gui/react": minor
"@ai-gui/plugin-mermaid": minor
"@ai-gui/plugin-chart": minor
---

Let the host describe what it wants rendered instead of driving the renderer by hand.

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
