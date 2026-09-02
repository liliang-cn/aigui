---
"@ai-gui/plugin-ui": patch
---

`@ai-gui/plugin-ui`'s prompt spec now shows the shape instead of listing the node names.

It named the twelve node kinds and stopped. Asked in a real product for a to-do list with a form, a model wrote `{"type":"stack"}` with no ids, `"action":"save"` as a string on the form, and `"name"` on the fields — every one a reasonable guess from the names alone, and every one refused. Because the block is all-or-nothing, the reader got the refusal line instead of an interface. The sibling blocks models get right on the first try all carry a worked example.

So this one does too: `kind` is named as the discriminator (`type` is the natural wrong guess), every kind's required keys are spelled out, and the example exercises the two shapes that were guessed wrong — a form's `submit` object and a button's `action` object — with a registered action substituted in. A test parses the example straight out of the spec through the plugin's own validator, so the rules cannot drift into teaching a document that will not render.
