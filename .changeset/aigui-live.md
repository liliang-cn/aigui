---
"@ai-gui/live": minor
---

A WebSocket client for the card layer, so a backend can drive an AIGUI interface without a frontend project.

Cards, `ui` documents and actions travel over one socket. The server holds authoritative state and resyncs in full on reconnect, which means recovery uses the same code path as a first connection rather than a separate one that only runs after a failure. Actions fail immediately while disconnected instead of queuing, so a click made against a dead socket is never replayed later. The protocol is specified in `docs/live-protocol.md` and pinned by shared fixtures that any implementation, in any language, can test against.
