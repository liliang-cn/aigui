---
"@ai-gui/core": minor
---

Add `cardChannel(store, { onError? })`, a `StreamRouter` handler that applies card messages to a `CardStore`.

The answer's text and everything arriving alongside it now have separate, documented paths. `Renderer` is a single-writer append-only buffer — markdown block boundaries cannot survive two sources interleaving into them — so progress, background jobs and late tool results ride their own channel and update a Card by id instead, in any order and as many times as they like.

```ts
new StreamRouter()
  .channel("content", renderer)
  .on("cards", cardChannel(store, { onError }))
  .feed(response.body)
```

Accepts `register`, `merge`, `replace` and `batch`. Not `delete`: a card the reader is looking at should not vanish because a late frame said so.

Failures are reported through `onError` rather than thrown, because the handler runs inside one long `feed` await — a throw there would kill the content channel and truncate the answer. Unset, they go to `console.error`, since a silently dropped card is indistinguishable from one the model never sent.
