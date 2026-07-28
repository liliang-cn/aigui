# @ai-gui/plugin-flashcard

Cards to revise from: one at a time, answer hidden, self-graded.

The moment a vocabulary list stops being a list. A word shown beside its meaning is a word being
*read*, and reading a word you have already read teaches nothing — what moves it into memory is being
asked for it and finding out whether it came. So a card hides its back, and the person says how it went
before they are told.

```md
```flashcards
{"version":1,"id":"de-week-1","title":"本周德语词","gradeAction":"revise.word","cards":[
  {"id":"word-1","front":"der Kühlschrank","back":"冰箱","hint":"der Kühl-schrank","example":"Der Kühlschrank ist leer."},
  {"id":"word-2","front":"möchten","back":"想要"}
]}
```
```

```ts
import { flashcards } from "@ai-gui/plugin-flashcard"

const plugin = flashcards({ actionRuntime })
```

## What it does not do

**Scheduling.** Which card comes back tomorrow and which in a month is the host's: only the host knows
what else this person is learning and when they last saw it. What travels out is one grade per card —
`again` / `hard` / `good` — dispatched through the same action allowlist a form's submission uses:

```ts
registry.register({
  type: "revise.word",
  run: ({ cardId, grade }) => scheduleNextAppearance(cardId, grade),
})
```

Three grades, not two: "I half knew it" is the commonest answer, and a two-way split forces it into a
lie in either direction.

## Two modes

`reveal: "hidden"` (the default) is revision — one card, answer hidden, graded.

`reveal: "immediate"` shows both sides of every card at once and grades nothing. That is the teaching
moment: the person is meeting these for the first time, and hiding the meaning of a word nobody has
been told is a quiz on a lesson that has not happened.

## Keyboard

Space or Enter reveals; `1` `2` `3` grade. A number pressed before the answer is shown does nothing —
otherwise a stray keypress grades a card the person never saw, and the schedule believes it.
