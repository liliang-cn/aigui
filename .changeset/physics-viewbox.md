---
"@ai-gui/plugin-physics": patch
---

**The view box now holds the angle marks, the labels and the hatching.**

It was measured from bodies, surfaces and vector tips only. Everything else a mechanics diagram draws
sits outside those: the `30°` at the foot of an incline is an arc 28 from its vertex with a label 14
further out and was measured by nothing at all, so on any diagram whose incline reaches the left edge it
was simply outside the picture — the one label a 斜面 diagram cannot do without. A vector's label is
written past its arrowhead and then runs the width of its own text, so "mg cos(30°)" hung off the frame
beside an arrow pointing at nothing. Hatching hangs below its surface by its own length.

Text is estimated rather than measured — this renders to a string, with no DOM to measure in — and errs
wide: CJK at a full em, Latin at half. A box slightly too big shows white space; one slightly too small
cuts a word in half. An explicit `view` is still left exactly as given.
