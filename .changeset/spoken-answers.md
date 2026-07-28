---
"@ai-gui/plugin-form": minor
---

**`audio` field — a spoken answer, recorded in the browser.**

For questions a written answer cannot carry. Asked to say a sentence in a language they are learning, a
person who types it has demonstrated spelling; the recording is the only thing that holds whether the
vowel was long, which syllable took the stress, or whether two words ran together. Transcribing in the
browser first would defeat the point — a recogniser returns the word it thinks was meant, so a
mispronunciation arrives as the correct word and disappears before anyone is told about it.

```json
{"name":"reading","type":"audio","label":"读出这句：Ich möchte über mein Projekt sprechen","required":true,"maxSeconds":20}
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
