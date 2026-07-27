# @ai-gui/plugin-form

## 0.15.0

### Minor Changes

- 9583a39: Ask a question with more than one right answer.

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

### Patch Changes

- @ai-gui/core@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [8539013]
  - @ai-gui/core@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [e21640a]
  - @ai-gui/core@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [32f827c]
  - @ai-gui/core@0.12.0

## 0.11.1

### Patch Changes

- Updated dependencies [f84cb1d]
  - @ai-gui/core@0.11.1

## 0.11.0

### Patch Changes

- Updated dependencies [58d1b6c]
  - @ai-gui/core@0.11.0

## 0.10.0

### Patch Changes

- @ai-gui/core@0.10.0

## 0.9.0

### Patch Changes

- @ai-gui/core@0.9.0

## 0.8.0

### Minor Changes

- A field can declare the answer it expects, and the form marks the submission against it.

  `expect` on a field makes a quiz colour itself the moment it is answered, instead of waiting for a
  round trip to say what the person already needs to know. Only fields that declare it take part, the
  tone is the worst of them, and the handler's own verdict still wins when it returns one — it knows
  about partial credit and mark schemes that a value comparison does not.

  Unlike the constraints beside it, `expect` never blocks a submission. A wrong answer is an answer:
  the person is told, not stopped, and the handler still receives it.

### Patch Changes

- @ai-gui/core@0.8.0

## 0.7.0

### Minor Changes

- Let a handler say how a submission turned out, not just whether it ran.

  The lifecycle a card and an action report — idle, loading, success, error — answers "did the
  dispatch run". It cannot answer "was the answer right": a student who picks the wrong option
  submits perfectly well, so the action succeeded and nothing on screen said otherwise. The form
  plugin discarded the handler's result entirely, disabling itself and reading "Submitted" whether
  the answer was right or wrong.

  A handler can now return `{ tone: "warning", message, fields }` — on its own or under an `outcome`
  key beside its own data. The form marks itself `data-aigui-form-outcome`, shows the message in a
  slot of its own, and marks the field the answer came from, so a host styles a wrong answer without
  reading it as a failed request. A card carries the same verdict on its success state, where a
  custom card's render can see it.

  Adding "warning" to the lifecycle instead would have folded a wrong answer in with a failed
  request, which is the one distinction a host needs to keep.

### Patch Changes

- Updated dependencies
  - @ai-gui/core@0.7.0

## 0.6.2

### Patch Changes

- @ai-gui/core@0.6.2

## 0.6.1

### Patch Changes

- @ai-gui/core@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [57d6aef]
  - @ai-gui/core@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [401fce1]
  - @ai-gui/core@0.5.0

## 0.4.4

### Patch Changes

- @ai-gui/core@0.4.4

## 0.4.3

### Patch Changes

- Lock form controls after a successful action, expose a submitted state marker, and support restoring forms as already submitted.
  - @ai-gui/core@0.4.3

## 0.4.2

### Patch Changes

- Require an explicit submit-button click before dispatching form actions, preventing radio selection and implicit form submission from triggering actions.
  - @ai-gui/core@0.4.2

## 0.4.1

### Patch Changes

- @ai-gui/core@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies
  - @ai-gui/core@0.4.0

## 0.3.0

### Minor Changes

- c309584: Add the safe framework-neutral form plugin and ActionRuntime allowlist introspection.
- Add the v0.3 generative UI runtime with registered action execution, stateful cards, declarative forms, model stream adapters, debug instrumentation, and DevTools simulation support.

### Patch Changes

- Updated dependencies [43cb2a4]
- Updated dependencies [c309584]
- Updated dependencies
- Updated dependencies [d637f4d]
  - @ai-gui/core@0.3.0
