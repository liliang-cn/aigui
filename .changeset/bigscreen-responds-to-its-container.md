---
"@ai-gui/plugin-bigscreen": patch
---

A data wall now folds on its own width, not the window's.

The wall laid out twelve columns and fell back to one at `@media
(max-width: 640px)` — a query about the *viewport*. Put the same wall in a
330px side panel of a 1900px window and the query never fires: four KPI cards
share three hundred pixels and the numbers wrap one character per line.

The wall is now a container (`container-type: inline-size`) and the fallbacks
are `@container` queries, so what decides the layout is the only thing that was
ever relevant — how wide the wall is. That also covers the case the old query
was written for, since a full-width wall in a small window has a small
container.

Two steps rather than one. At 900px it folds to two columns; at 520px to one.
And a panel the model gave more than half the grid to keeps both columns in the
two-column state — a chart is wide because it needs to be, and collapsing it to
the width of a KPI card is how a readable chart becomes a smear.
