---
"@ai-gui/core": minor
---

Add `@ai-gui/plugin-figure`: labelled figures, drawn from a declarative ```figure block.

The diagram whose point is what the parts are called — a cell with its organelles named, a leaf's
layers, apparatus with the parts a method refers to. Mermaid draws boxes joined by arrows and a
chart draws data; neither draws a shape with a leader line pointing into it saying what it is.

Labels are laid out by the plugin: each callout goes out to the side its part is already on and is
stacked down that side top to bottom, so a model can name six organelles without also solving a
layout problem whose result it cannot see. `y` increases upwards, matching `@ai-gui/plugin-physics`.

Also: READMEs for `plugin-figure` and `plugin-physics`, each with an example a test parses, and
`plugin-physics`'s package metadata no longer describes molecules.
