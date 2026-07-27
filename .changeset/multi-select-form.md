---
"@ai-gui/plugin-form": minor
---

Ask a question with more than one right answer.

`checkboxes` is a new field type: several answers to one question, which neither
`radio` (the options exclude each other) nor a text box (the person has to guess
whether to write "A、C" or "AC" or "a,c") could ask. Its value is the chosen
option values, always in the order the options were declared, so the same answer
compares equal to itself however it was clicked, and `expect` takes the set of
every correct option — compared as a set, because a model writes them in whatever
order it thought of them.

The verdict stays a verdict: `positive` only when the set matches exactly. How
much a partly-right answer is worth is a marking scheme, and that belongs to the
host, not to the form.

`FormValue` is now exported and includes `string[]`, so a host that switches on a
submitted value should handle the array case; nothing else changes, and an array
only ever appears where a form declared a `checkboxes` field.
