---
"@ai-gui/plugin-form": patch
---

**A recording from a real browser can be submitted.**

`MediaRecorder` reports its type as `audio/webm;codecs=opus`, so a recording arrives as
`data:audio/webm;codecs=opus;base64,…`. The validation pattern left no room for MIME parameters, so it
rejected every recording a browser has ever produced — the learner recorded, heard it play back, pressed
submit, and was told "Must be a recording."

It passed its own test because that test used a hand-written `data:audio/webm;base64,…`: the shape I
imagined rather than the shape a browser emits. The test now uses the real one, and fails against the
old pattern.
