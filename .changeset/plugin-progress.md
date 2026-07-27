---
"@ai-gui/core": minor
---

Add `@ai-gui/plugin-progress`: live progress steps for a long turn, several per request.

A model that searches, reads three sources and then drafts spends a long time saying nothing, and a
host-level "thinking…" is one line for the whole turn — it cannot say which step is running, which
have finished, or that one failed.

Steps are written by the model in a ```progress block and updated in place: emitting a step again with
the same `id` replaces it. That is what makes it usable rather than noisy, because a streamed answer is
append-only, so an update *is* a second block; without superseding, a turn reporting four steps three
times would render twelve rows. Ownership is decided from the whole node list on commit, so it holds
however the host re-parses the turn.
