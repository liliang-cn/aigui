---
"@ai-gui/plugin-mermaid": patch
---

Clean up the container Mermaid renders into.

Mermaid appends a host element to the document and removes it itself only when rendering succeeds.
A parse error aborts before that, leaving its own "Syntax error in text" graphic in the page —
outside the renderer, where nothing owning the answer can reach it. One malformed diagram stained
every page of an app until reload.
