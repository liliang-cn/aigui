---
"@ai-gui/plugin-form": minor
---

**`labels` — the words on the controls the plugin draws itself.**

Everything else in a form is the model's text, so it comes out in whatever language the lesson is in. The
recorder's own button did not: it was hardcoded English, and a Chinese lesson asked a learner to read a
German sentence aloud under a button saying `Record`.

```ts
form({ actionRuntime, labels: { record: "朗读并录音", stop: (s) => `停止（${s} 秒）` } })
```

Covers the idle button, the running one (given the seconds), the message where the browser cannot record,
and the one where the microphone was refused. A field's own `placeholder` still wins over `labels.record`,
because the tutor sometimes knows better what this particular recording is for — "读第二句" beats any
generic label.
