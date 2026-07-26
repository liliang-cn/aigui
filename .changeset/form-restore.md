---
"@ai-gui/core": minor
---

`@ai-gui/plugin-form`: restore a submitted form with the answer in it.

`submitted: true` marked every form done without saying what was answered, so a reloaded
conversation showed a disabled question with nothing chosen — which claims to have been answered and
cannot say with what. Two new options fix the round trip:

- `restore(formId)` returns the `{ values, outcome? }` a form already has. The values are written
  into the controls before the form is locked, so the person sees their own answer. Without a stored
  `outcome` the fields' own `expect` is graded again, so a quiz comes back coloured without the host
  storing the marking.
- `onSubmitted(formId, submission)` hands over what to persist. The action handler already saw the
  values but not which form they came from — the id was only inside `cardType`.

A host that throws while persisting cannot break the form: the answer has already gone through.
