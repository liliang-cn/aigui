# @ai-gui/plugin-form

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

- 9a2a82b: **A recording from a real browser can be submitted.**

  `MediaRecorder` reports its type as `audio/webm;codecs=opus`, so a recording arrives as
  `data:audio/webm;codecs=opus;base64,…`. The validation pattern left no room for MIME parameters, so it
  rejected every recording a browser has ever produced — the learner recorded, heard it play back, pressed
  submit, and was told "Must be a recording."

  It passed its own test because that test used a hand-written `data:audio/webm;base64,…`: the shape I
  imagined rather than the shape a browser emits. The test now uses the real one, and fails against the
  old pattern.

  - @ai-gui/core@0.20.1

## 0.20.0

### Patch Changes

- Updated dependencies [b487b4d]
  - @ai-gui/core@0.20.0

## 0.19.0

### Minor Changes

- e1512f9: **`labels` — the words on the controls the plugin draws itself.**

  Everything else in a form is the model's text, so it comes out in whatever language the lesson is in. The
  recorder's own button did not: it was hardcoded English, and a Chinese lesson asked a learner to read a
  German sentence aloud under a button saying `Record`.

  ```ts
  form({
    actionRuntime,
    labels: { record: "朗读并录音", stop: (s) => `停止（${s} 秒）` },
  });
  ```

  Covers the idle button, the running one (given the seconds), the message where the browser cannot record,
  and the one where the microphone was refused. A field's own `placeholder` still wins over `labels.record`,
  because the tutor sometimes knows better what this particular recording is for — "读第二句" beats any
  generic label.

### Patch Changes

- @ai-gui/core@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [a22ba20]
  - @ai-gui/core@0.18.0

## 0.17.1

### Patch Changes

- @ai-gui/core@0.17.1

## 0.17.0

### Minor Changes

- c78851c: **`renderLabel` — let the host typeset a label.**

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

### Patch Changes

- @ai-gui/core@0.17.0

## 0.16.0

### Minor Changes

- 3ef4ee8: **`audio` field — a spoken answer, recorded in the browser.**

  For questions a written answer cannot carry. Asked to say a sentence in a language they are learning, a
  person who types it has demonstrated spelling; the recording is the only thing that holds whether the
  vowel was long, which syllable took the stress, or whether two words ran together. Transcribing in the
  browser first would defeat the point — a recogniser returns the word it thinks was meant, so a
  mispronunciation arrives as the correct word and disappears before anyone is told about it.

  ```json
  {
    "name": "reading",
    "type": "audio",
    "label": "读出这句：Ich möchte über mein Projekt sprechen",
    "required": true,
    "maxSeconds": 20
  }
  ```

  The value is a `data:audio/...;base64,...` URL, so a submission stays ordinary JSON a handler can post
  onward or store; restoring one brings its player back with it. A hidden input is the control, which is
  what makes reading, restoring and re-grading take the same path as a text box.

  `expect` is rejected on an audio field: two recordings of one sentence are never equal, so an
  expectation could only ever be wrong — and a form that graded it on a string compare would tell a
  learner their pronunciation was correct because the base64 happened to match. Judging a recording is the
  host's. Only `data:audio/*;base64` values are accepted, because a field the host forwards must not carry
  `data:text/html,<script>` to wherever the recording was going. `maxSeconds` (default 60) stops a
  recording that would otherwise run until the tab closes, and a browser without `MediaRecorder` gets a
  disabled button that says so rather than one that looks live and does nothing.

### Patch Changes

- @ai-gui/core@0.16.0

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
