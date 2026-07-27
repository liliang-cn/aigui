---
"@ai-gui/core": minor
---

`@ai-gui/plugin-highlight`: follow the host's colour scheme instead of a theme fixed at construction.

The theme was chosen when the plugin was built and the render context ignored, so code on a dark page
came back set for a light one — correct markup, wrong ink, which is the same fault a chart has when it
picks its own palette and just as easy to miss.

`lightTheme` and `darkTheme` are both loaded up front and chosen per render from `context.theme`;
`theme` still pins one for a host that wants that. A theme that was never loaded falls back to a
loaded one rather than throwing at render time.
