# @ai-gui/plugin-flashcard

## 0.35.1

### Patch Changes

- @ai-gui/core@0.35.1

## 0.35.0

### Patch Changes

- @ai-gui/core@0.35.0

## 0.34.0

### Patch Changes

- @ai-gui/core@0.34.0

## 0.33.0

### Minor Changes

- Prompt specs teach the block shape that actually parses.

  Eleven specs demonstrated their block on a single line — ` ```list {"items":[…]}``` `
  — and a model that copies that exactly produces no block at all. A fence's
  info string may not contain backticks, so CommonMark reads the line as an
  inline code span: the reader gets raw JSON running through the middle of a
  sentence, and an empty code block where the list should have been. The
  mistake is invisible from the model's side, which emitted precisely what it
  was shown.

  Every spec now shows the multi-line form, `buildSystemPrompt` states the rule
  once before the specs it governs (new export: `fencingRule`), and a test lints
  every package's model-facing text so the shape cannot come back.

  Hosts that assemble guidance themselves rather than calling `buildSystemPrompt`
  should prepend `fencingRule(locale)`.

### Patch Changes

- Updated dependencies
  - @ai-gui/core@0.33.0

## 0.32.0

### Patch Changes

- @ai-gui/core@0.32.0

## 0.31.0

### Patch Changes

- @ai-gui/core@0.31.0

## 0.30.0

### Patch Changes

- Updated dependencies
  - @ai-gui/core@0.30.0

## 0.29.2

### Patch Changes

- @ai-gui/core@0.29.2

## 0.29.1

### Patch Changes

- @ai-gui/core@0.29.1

## 0.29.0

### Patch Changes

- Updated dependencies [893cb1e]
  - @ai-gui/core@0.29.0

## 0.28.0

### Patch Changes

- @ai-gui/core@0.28.0

## 0.27.0

### Patch Changes

- @ai-gui/core@0.27.0

## 0.26.0

### Patch Changes

- @ai-gui/core@0.26.0

## 0.25.0

### Patch Changes

- @ai-gui/core@0.25.0

## 0.24.0

### Patch Changes

- @ai-gui/core@0.24.0

## 0.23.1

### Patch Changes

- First release of `@ai-gui/plugin-resultset`: host-owned result tables. The
  application appends a ` ```resultset ` block from the rows it really returned,
  and the prompt spec tells the model not to retype figures into its prose.
  `plugin-evidence` proves which query ran; this proves the number in the sentence
  came from it.
- Updated dependencies
  - @ai-gui/core@0.23.1

## 0.23.0

### Patch Changes

- Updated dependencies [5e15f72]
  - @ai-gui/core@0.23.0

## 0.22.1

### Patch Changes

- Updated dependencies [d2945bc]
  - @ai-gui/core@0.22.1

## 0.22.0

### Patch Changes

- Updated dependencies [7633f85]
  - @ai-gui/core@0.22.0

## 0.21.1

### Patch Changes

- @ai-gui/core@0.21.1

## 0.21.0

### Patch Changes

- Updated dependencies
  - @ai-gui/core@0.21.0

## 0.20.2

### Patch Changes

- First release of `@ai-gui/plugin-evidence`: host-owned query provenance. The
  application appends an ` ```evidence ` fence from the statements it actually
  executed, and `evidencePromptSpec()` tells the model never to write one — a
  model that can invent a number can invent the query said to have produced it.
- Updated dependencies
  - @ai-gui/core@0.20.2

## 0.20.1

### Patch Changes

- @ai-gui/core@0.20.1

## 0.20.0

### Patch Changes

- Updated dependencies [b487b4d]
  - @ai-gui/core@0.20.0

## 0.19.0

### Patch Changes

- @ai-gui/core@0.19.0

## 0.18.0

### Minor Changes

- a22ba20: **New package: `@ai-gui/plugin-flashcard` — cards to revise from.**

  The moment a vocabulary list stops being a list. A word shown beside its meaning is a word being
  _read_, and reading a word you have already read teaches nothing — what moves it into memory is being
  asked for it and finding out whether it came. So a card hides its back, and the person says how it went
  before they are told.

  ```flashcards
  {"version":1,"id":"de-week-1","gradeAction":"revise.word","cards":[{"id":"word-1","front":"der Kühlschrank","back":"冰箱","hint":"der Kühl-schrank","example":"Der Kühlschrank ist leer."}]}
  ```

  It schedules nothing: which card comes back tomorrow and which in a month is the host's, because only
  the host knows what else this person is learning and when they last saw it. What travels out is one
  grade per card — `again` / `hard` / `good` — through the same action allowlist a form's submission uses.
  Three grades because "I half knew it" is the commonest answer and a two-way split forces it into a lie
  in either direction.

  `reveal: "immediate"` shows both sides of every card and grades nothing, for the teaching moment: hiding
  the meaning of a word nobody has been told is a quiz on a lesson that has not happened.

  The answer is written into the DOM only when it is asked for, not merely hidden — `hidden` is a style,
  and an answer sitting in the card's text is one select-all away from being read first. Each card
  dispatches under its own `cardId`, so the runtime's dedupe means "this card graded twice in one breath"
  rather than dropping the second card's grade while the first is still in flight. Space or Enter reveals,
  `1` `2` `3` grade, and a number pressed before the answer is shown does nothing.

### Patch Changes

- Updated dependencies [a22ba20]
  - @ai-gui/core@0.18.0

## 0.18.0

### Minor Changes

- a22ba20: **New package: cards to revise from.**

  The moment a vocabulary list stops being a list. A word shown beside its meaning is a word being
  _read_, and reading a word you have already read teaches nothing — what moves it into memory is being
  asked for it and finding out whether it came. So a card hides its back, and the person says how it went
  before they are told.

  ```flashcards
  {"version":1,"id":"de-week-1","gradeAction":"revise.word","cards":[{"id":"word-1","front":"der Kühlschrank","back":"冰箱","hint":"der Kühl-schrank","example":"Der Kühlschrank ist leer."}]}
  ```

  It schedules nothing: which card comes back tomorrow and which in a month is the host's, because only
  the host knows what else this person is learning and when they last saw it. What travels out is one
  grade per card — `again` / `hard` / `good` — through the same action allowlist a form's submission uses.
  Three grades because "I half knew it" is the commonest answer and a two-way split forces it into a lie
  in either direction.

  `reveal: "immediate"` shows both sides of every card and grades nothing, for the teaching moment: hiding
  the meaning of a word nobody has been told is a quiz on a lesson that has not happened.

  The answer is written into the DOM only when it is asked for, not merely hidden — `hidden` is a style,
  and an answer sitting in the card's text is one select-all away from being read first. Each card
  dispatches under its own `cardId`, so the runtime's dedupe means "this card graded twice in one breath"
  rather than dropping the second card's grade while the first is still in flight. Space or Enter reveals,
  `1` `2` `3` grade, and a number pressed before the answer is shown does nothing.
