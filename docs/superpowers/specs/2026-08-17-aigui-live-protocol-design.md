# A duplex socket for AIGUI's card layer

Date: 2026-08-17

## Problem

AIGUI is two things sharing a package. One is a streaming markdown renderer: bytes arrive from a model, half-typed syntax is repaired in flight, blocks render when complete. The other is a card / UI / action layer: the host registers component types, something fills them with data, the reader clicks, and the host handles it.

The second half is already shaped like Phoenix LiveView. It has a keyed diff (`Patch`: insert / update / move / remove), both sides of applying it (`diffAst`, `applyPatches`), targeted updates by component id (`CardMessage`: register / merge / replace / batch), multiplexed channels (`StreamRouter`, `cardChannel`), typed results for user intent (`ActionRegistry`, `actionOutcome`), and a server-renderable UI description that mounts without executing generated code (`plugin-ui`).

What it does not have is a server. `cardChannel` only lives inside one model response: a card can be updated while the answer streams, and not after. A backend that wants to drive a rich interface — with no model in the loop at all — has no way in.

## Goal

A backend starts a WebSocket endpoint and a browser renders its cards, applies its updates, and sends back user actions. No JavaScript build on the backend's side, no model required.

The first consumer is the DataIntelligence dashboard, in Rust, with no LLM anywhere in the loop. That choice is deliberate: it tests the actual claim — *a backend can drive a rich interface without a frontend project* — without the streaming-markdown question confusing the result.

## Non-goals

**The markdown path stays where it is.** Parsing on the server would cost a round trip per token and throw away the in-flight repair that is the renderer's whole differentiator. Pushing tokens over a socket is not better than pushing them over SSE; duplex buys nothing on that half. v1 carries cards, UI documents and actions, and nothing else.

**This is not a general application UI framework.** Forms, navigation and CRUD are Phoenix LiveView's home ground. AIGUI's block model would be a constraint there rather than a help.

**No compile-time diff.** LiveView's small payloads come from splitting a template into a static plan and dynamic slots at compile time. AIGUI's "template" is model output or runtime JSON; there is no compile step to split. Diffs are per card and per field, which is coarser and adequate for a dashboard, and would not be adequate for a high-frequency list.

## Architecture

Three pieces, each understandable alone.

```
@ai-gui/live            npm, client. Opens the socket, applies frames to an existing
                        CardStore, sends actions from an existing ActionRuntime.
                        Depends on @ai-gui/core only. Does not touch the renderer.

aigui-live              Rust crate, server SDK. Holds session state, exposes
                        push / patch / on_action, owns serialization. Transport
                        agnostic — it is handed a sink, so axum or actix both work.

docs/live-protocol.md   The protocol itself, specified independently of both,
                        because there will eventually be a third implementation.
```

**AIGUI's own packages are not modified.** `@ai-gui/live` is purely additive. If this experiment fails, deleting one package removes it.

## Wire protocol

The load-bearing decision: **the server-to-client card frame reuses `CardMessage` verbatim**, inventing no new field.

```ts
// Already in @ai-gui/core, already tested, already applied by cardChannel
type CardMessage =
  | { op: "register"; id: string; type: string; data: unknown }
  | CardPatch      // { op: "merge" | "replace", … }
  | CardPatchBatch // { op: "batch", patches: [...] }
```

The socket is therefore not a new protocol but a second transport for a message type that exists. What that saves is not design effort; it is the risk of two definitions of the same thing drifting apart.

A `plugin-ui` document travels the same way: it is a card whose `type` is the UI plugin's, carrying the `ui` JSON as its `data`. It gets no frame of its own. The alternative — a parallel `ui` frame beside `cards` — would mean two delivery paths, two sync shapes and two places to get eviction wrong, in exchange for nothing.

Every frame carries `v` (protocol version) and `t` (type).

```jsonc
// client → server
{ "v":1, "t":"hello",  "session":"abc", "token":"…" }   // session optional; server assigns
{ "v":1, "t":"action", "id":"c7", "action":{ "type":"metric.drill", "params":{} } }
{ "v":1, "t":"ping" }

// server → client
{ "v":1, "t":"welcome", "session":"abc", "resume":true }
{ "v":1, "t":"sync",    "cards":[ { "id":"…", "type":"…", "data":{} } ] }
{ "v":1, "t":"cards",   "messages":[ /* CardMessage[] */ ] }
{ "v":1, "t":"outcome", "id":"c7", "outcome":{ /* ActionOutcome */ } }
{ "v":1, "t":"error",   "code":"version", "message":"…", "fatal":true }
{ "v":1, "t":"pong" }
```

`ping` and `pong` are application frames rather than WebSocket control frames because browser JavaScript cannot send a WebSocket ping. A client that wants to notice a dead connection has no other option.

There is no sequence number and no cursor. Reconnection always resyncs in full, so a missed frame is not a concept the protocol needs to express.

## Lifecycle

```
connect    hello{session?}  →  welcome{resume}  →  sync{full state}
steady     cards{…} pushed down;  action{id} up  →  outcome{id} back
heartbeat  ping / pong; a missed pong means the connection is dead
drop       in-flight actions resolve as failures; new actions fail immediately
reconnect  backoff with jitter (1s → 30s cap), then hello → welcome → sync
```

Three properties worth stating explicitly.

**`sync` replaces, it does not merge.** A card the server deleted while the client was away must disappear, and a merge would leave it on screen forever.

**Reconnection and first connection are the same path.** This is the real return on holding full state server-side. It is not that cursor bookkeeping was avoided; it is that *there is no recovery-specific code left to rot*. Recovery bugs live in branches only a disconnect can reach — here there is no such branch, because the recovery path is the one that runs on every page load.

**An evicted session is not an error.** The server drops a session after it has had no connections for an idle period — 30 minutes by default, configurable. A client that reconnects to an evicted session receives `welcome{resume:false}` and a fresh sync, and carries on.

## Actions

Actions are request/response, correlated by a client-generated `id`, answered with the existing `ActionOutcome`.

**While disconnected, an action fails immediately and is never queued.** Queuing reads as the friendlier choice and is not: a reader who clicks *delete* three times against a dead socket would have all three replayed on reconnect. Retrying is a decision the person should make with the failure in front of them. Queuing could be added later, but only together with idempotency keys and server-side deduplication — which is why it is not in v1.

## Errors and degradation

The governing rule mirrors the one the renderer already follows: **a socket problem must never blank the page.**

| Situation | Behaviour |
| --- | --- |
| Unknown frame type | Ignore and log. A v1 client must survive a v2 server adding frames |
| `v` mismatch | Server sends `error{fatal:true}` and closes; the client **stops retrying** and surfaces it rather than hammering the server |
| Malformed `CardMessage` | Apply what parses; route the rest to `cardChannel`'s existing `onError`, whose comment already explains why a swallowed failure is the worst version of this bug |
| Unknown action type | A failed `outcome`, not a socket error. One mistyped button must not drop the connection |
| Connection lost | Last known state **stays rendered**; only the connection indicator changes |

A dashboard showing stale numbers behind a "disconnected" marker is far better than one that goes blank.

## Testing

**A shared frame fixture is the most important test in the design.** One JSON file of frames in the repo, read by both the Rust and the TypeScript suites. Two independent implementations of one protocol drift; nothing else catches it.

- Client: a fake WebSocket driving every lifecycle path — connect, sync, patch, action, disconnect mid-action, reconnect, version mismatch, evicted session.
- Server: an in-memory sink, asserting frame sequences.
- One real end-to-end: DataIntelligence pushes a genuine metric card, the browser renders it, a click arrives back in Rust.

## What would make this a mistake

Scope. A duplex protocol brings reconnection, backpressure, authentication, protocol versioning and one SDK per language. The qi-web experience puts a LiveView-shaped feature set at roughly ten capabilities before it feels complete. If `@ai-gui/live` grows toward that, it stops being an addition to a rendering SDK and becomes a UI framework with a different maintenance burden and a different audience.

The guard is the separate package and the single first consumer. If driving the DataIntelligence dashboard this way is not plainly nicer than what it does today, that is the answer, and the package should be deleted rather than extended.

## Deferred

- Authentication beyond an opaque `token` in `hello`, which the server validates however it already validates anything else.
- Backpressure. A dashboard cannot outrun a browser; a high-frequency feed could, and would need it.
- Queued actions with idempotency keys.
- A Go SDK, once the Rust one has proven the protocol.
- Carrying the markdown stream on the same socket, which is only worth revisiting if a consumer appears that genuinely needs one connection for both.
