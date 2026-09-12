---
"@ai-gui/plugin-bigscreen": minor
---

`fit` — size a screen to the element it was mounted in.

A screen has always sized itself for a wall: a panel body takes the pixel height the fence names,
or its kind's default, and the screen ends up as tall as the sum of them. That is right for the
surface it was built for, a display with nothing else on it, and wrong for the one it grew into —
a panel embedded in a page, inside a card a few hundred pixels tall. There the panel drew at full
size and covered whatever was beneath it, because nothing in the screen ever consulted the box it
was put in. A host could not fix it from outside either: the height is set inline, and an inline
height beats any stylesheet the host can write.

With `fit: true` the host's element is the authority. The screen becomes a column that fills it,
the grid takes what the heading leaves, and a panel body flexes into its row instead of taking a
fixed height — the fence's own `height` is ignored, because a number in the document cannot know
the box. Default false, so every existing wall is unchanged.

Meant for a host that gives the screen a bounded box, and usually for one panel: a wall of twelve
squeezed into a card gives each of them a twelfth of a card.
