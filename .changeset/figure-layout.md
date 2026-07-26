---
"@ai-gui/core": patch
---

`@ai-gui/plugin-figure`: fix two layout faults that only showed up on screen.

Long notes were clipped against the edge of the drawing — "control center containing DNA" arrived as
"trol center containing DNA" — because the space reserved beside the figure was a fixed allowance
rather than the width of the text actually there. It is now estimated per side from the longest
label and note, CJK glyphs counted wider than Latin.

And a cell drawn as concentric membrane, cytoplasm and nucleus put every label in one gutter, since
each part's side is taken from its position and they share a centre. A part with no side of its own
now alternates, so both gutters are used.
