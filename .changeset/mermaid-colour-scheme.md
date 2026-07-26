---
"@ai-gui/plugin-mermaid": patch
---

Stop handing Mermaid a colour scheme it has no theme for.

A host reports its appearance through the render context, and "light" is what most of them call
their default one — Mermaid has no such theme, so since the theme started reaching plugins every
diagram on a light page failed to render. Only a name Mermaid knows is used as given; any other
scheme falls back to the theme the plugin was configured with.
