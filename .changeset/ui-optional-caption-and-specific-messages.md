---
"@ai-gui/plugin-ui": patch
---

A table may go without a caption, and a rejected string says which rule it broke.

Found the same way as the last two: a real dashboard, a real user, an interface
that refused to draw. The board was a heading, a key-value block, a table of
today's meetings and a note — and the whole thing came back as

    $.root.children[4].caption must be a bounded string.

The table had headers and rows and no caption. `validateTable` called
`readString` on `value.caption` unconditionally, while every other optional
string in the same file is guarded — `submitLabel` and `pattern` both check for
undefined first. It was an omission rather than a decision, and the cost of it
was the entire document, for a decorative label.

The prompt spec listed `caption` beside `headers[]` and `rows[][]` with nothing
to say it was compulsory, so a model reading that line as "the fields a table
has" had no way to know. It is now written as optional, which is what it is.

And `readString` reported four different problems in one sentence: absent,
wrong type, empty, and over the limit all read "must be a bounded string". A
model rewriting its own document learns nothing from that. Each now says what
happened — `is required and must be a string`, `must be a string, not number`,
`must not be empty`, `must be at most 4096 characters (got 5001)`.
