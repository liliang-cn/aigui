---
"@ai-gui/plugin-form": minor
---

**`renderLabel` — let the host typeset a label.**

Every label in a form is model output, so all of them go into the DOM through `textContent`: a question
that arrives with markup in it must not become markup. That default is also why a maths question renders
in front of the learner as source — `$G_\parallel$ 的值是多少？`, with options reading `34.6 N
(20\sqrt{3} N)` — because the host's typesetter never sees a label, since a label never becomes anything
but text.

`renderLabel(text) => Node | undefined` opts one label out of that default and hands the escaping to the
host, which is the only side that knows what it is willing to render. Applied to field labels, group
legends and option labels; not to a `<select>`'s options, where a browser renders text and drops
anything else. Returning `undefined`, or throwing, falls back to text — a typesetter that cannot parse
one formula must cost that formula's appearance, not the question it is part of.
