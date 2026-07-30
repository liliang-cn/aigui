---
"@ai-gui/core": patch
---

Parse emphasis CJK-friendly, so bold and italics close where CommonMark refuses to.

CommonMark decides whether `**` may close from what surrounds it: preceded by punctuation, it must
be followed by whitespace or punctuation. A CJK character is neither, so `**严格单调（单射）**的函数`
— bold, a closing bracket, then more Chinese — left its asterisks on screen. The rule was written
for scripts that separate words with spaces, and a model writing Chinese cannot avoid the shape.

`markdown-it-cjk-friendly` now relaxes the flanking rules for East Asian text. ASCII parsing is
unchanged: `a * b * c` and `snake_case_word` behave exactly as before.
