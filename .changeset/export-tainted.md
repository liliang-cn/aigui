---
"@ai-gui/core": minor
---

**A diagram with labels can be exported again, and one that cannot no longer takes the others with it.**

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
