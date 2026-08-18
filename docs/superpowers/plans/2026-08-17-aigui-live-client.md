# `@ai-gui/live` client and protocol — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser can hold a WebSocket to any backend that speaks the AIGUI live protocol, render the cards it pushes, and send user actions back.

**Architecture:** A new package `packages/live/` with three layers that can each be understood alone — frame codec, connection state machine, and the wiring that joins a connection to an existing `CardStore` and `ActionRuntime`. The protocol is specified in a normative document plus a JSON fixture file that every implementation, in any language, tests against. A test-only Node reference server makes the protocol executable rather than merely written down.

**Tech Stack:** TypeScript, tsdown, vitest, `ws` (dev-only, for the reference server). No runtime dependency beyond `@ai-gui/core`.

**Spec:** `docs/superpowers/specs/2026-08-17-aigui-live-protocol-design.md`

---

## Scope: this is sub-project one of three

The spec spans three repositories. This plan covers only the first, which is the one that defines the contract the other two implement:

1. **This plan** — the protocol document, the shared fixtures, the TypeScript client, and a reference server. Lives in `aigui`.
2. A Rust server SDK in its own repository, tested against the same fixtures.
3. Wiring the DataIntelligence dashboard to it.

Sub-project one is testable and complete on its own: the reference server proves the fixtures are implementable, and the client is proven against it over a real socket.

---

## What already exists, and why this package is mostly wiring

Read these before starting. The design leans on them heavily, and re-implementing any of them would be a mistake.

| Need | What `@ai-gui/core` already provides |
| --- | --- |
| Apply a card message | `cardChannel(store, { onError })` returns `(value: unknown) => void`. It parses strings, validates shape, applies `register`/`merge`/`replace`/`batch`, and routes every failure to `onError` **without throwing** (`packages/core/src/card-channel.ts:53`) |
| Full-state replace | `CardStore.restore(snapshot)` builds a fresh map, validates every id/type/revision and rejects duplicates (`packages/core/src/card-store.ts:181`). It cannot merge, which is exactly the required semantic |
| Full-state capture | `CardStore.snapshot(): CardSnapshot` (`card-store.ts:174`) |
| User intent with a typed result | `ActionDefinition.run(params, ctx)` may return anything; `actionOutcome(result)` finds an `ActionOutcome` in it, either bare or under an `outcome` key (`packages/core/src/action-outcome.ts:16`) |

The `sync` frame therefore carries a `CardSnapshot` verbatim, and the `cards` frame carries `CardMessage[]` verbatim. **No new representation of a card is introduced anywhere in this package.**

---

## File structure

```
docs/live-protocol.md                  Normative protocol reference. Written for someone
                                       implementing a server in a language that is not
                                       TypeScript, so it defines frames without TS types.

fixtures/live-protocol/frames.json     Shared conformance fixtures. Read by this package's
                                       tests and, later, by the Rust crate's. The only
                                       thing that keeps two implementations honest.

packages/live/
  package.json
  tsconfig.json
  tsdown.config.ts
  README.md
  src/
    types.ts          Frame types and protocol constants. No logic.
    frames.ts         encodeFrame / decodeFrame. Validation lives here and nowhere else.
    frames.test.ts    Driven by the shared fixtures.
    backoff.ts        A pure reconnect-delay function, so it can be tested without timers.
    backoff.test.ts
    connection.ts     The lifecycle state machine: connect, heartbeat, close, reconnect.
                      Transport injected, so tests need no real socket.
    connection.test.ts
    client.ts         Joins a connection to a CardStore and an ActionRuntime.
    client.test.ts
    index.ts          Barrel.
    reference-server.ts   Test-only. A Node WebSocket server implementing the protocol.
                          Not exported from the package; imported by the e2e test and
                          runnable as a script for the Rust implementer.
    e2e.test.ts       Client against reference server over a real loopback socket.
```

Each file has one job. `frames.ts` is the only place that decides whether a frame is valid; `connection.ts` knows nothing about cards; `client.ts` knows nothing about sockets beyond the connection interface it is handed.

---

## Task 1: Scaffold `@ai-gui/live`

**Files:**
- Create: `packages/live/package.json`
- Create: `packages/live/tsconfig.json`
- Create: `packages/live/tsdown.config.ts`
- Create: `packages/live/src/types.ts`
- Create: `packages/live/src/index.ts`
- Create: `packages/live/src/smoke.test.ts`
- Copy: `packages/live/LICENSE`
- Modify: `vitest.workspace.ts`
- Modify: `.changeset/config.json`

- [ ] **Step 1: Create the package manifest**

`packages/live/package.json`. The `exports` shape is mandatory — `scripts/validate-packages.mjs:29-33` reads `exports["."].import.default` and `exports["."].require.default` and fails the release if either is missing from the tarball.

```json
{
  "name": "@ai-gui/live",
  "version": "0.31.0",
  "description": "WebSocket client for AIGUI's card layer — a backend drives cards and receives actions, with no frontend project.",
  "keywords": ["websocket", "liveview", "server-driven-ui", "cards", "aigui"],
  "license": "MIT",
  "author": "Liang Li <ll_faw@hotmail.com>",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/liliang-cn/aigui.git",
    "directory": "packages/live"
  },
  "homepage": "https://github.com/liliang-cn/aigui#readme",
  "bugs": "https://github.com/liliang-cn/aigui/issues",
  "type": "module",
  "sideEffects": false,
  "engines": { "node": ">=18" },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    }
  },
  "files": ["dist", "README.md", "LICENSE"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "tsdown",
    "test": "pnpm --dir ../.. exec vitest run --project live",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@ai-gui/core": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/ws": "^8.5.0",
    "ws": "^8.18.0"
  }
}
```

- [ ] **Step 2: Create tsconfig and build config**

`packages/live/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "lib": ["ES2022", "DOM", "DOM.Iterable"] },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts", "src/**/*.spec.ts", "src/reference-server.ts"]
}
```

`reference-server.ts` is excluded from the build because it imports `ws`, a dev-only dependency that must not appear in the published package.

`packages/live/tsdown.config.ts`:

```ts
import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
})
```

- [ ] **Step 3: Create the protocol types**

`packages/live/src/types.ts`. These are the protocol in TypeScript form; `docs/live-protocol.md` is the same thing for implementers in other languages.

```ts
import type { CardMessage, CardSnapshot } from "@ai-gui/core"
import type { ActionOutcome } from "@ai-gui/core"

/** The protocol version this package speaks. A server answering with anything else is fatal. */
export const PROTOCOL_VERSION = 1

export interface HelloFrame {
  v: number
  t: "hello"
  /** Omitted on a first connection; the server then assigns one. */
  session?: string
  /** Opaque to the protocol. The server validates it however it validates anything else. */
  token?: string
}

export interface ActionFrame {
  v: number
  t: "action"
  /** Client-generated correlation id, echoed back on the outcome. */
  id: string
  action: { type: string; params?: unknown }
}

export interface PingFrame {
  v: number
  t: "ping"
}

export type ClientFrame = HelloFrame | ActionFrame | PingFrame

export interface WelcomeFrame {
  v: number
  t: "welcome"
  session: string
  /** False when the server had no such session and started a new one. Not an error. */
  resume: boolean
}

export interface SyncFrame {
  v: number
  t: "sync"
  snapshot: CardSnapshot
}

export interface CardsFrame {
  v: number
  t: "cards"
  messages: CardMessage[]
}

export interface OutcomeFrame {
  v: number
  t: "outcome"
  id: string
  outcome: ActionOutcome
}

export interface ErrorFrame {
  v: number
  t: "error"
  code: string
  message: string
  /** When true the client must stop reconnecting; retrying cannot fix it. */
  fatal: boolean
}

export interface PongFrame {
  v: number
  t: "pong"
}

export type ServerFrame = WelcomeFrame | SyncFrame | CardsFrame | OutcomeFrame | ErrorFrame | PongFrame

/** What the host is told about the socket, so it can show an indicator. */
export type ConnectionState = "connecting" | "open" | "closed" | "fatal"
```

- [ ] **Step 4: Create the barrel and a smoke test**

`packages/live/src/index.ts`:

```ts
export { PROTOCOL_VERSION } from "./types"
export type {
  ActionFrame,
  CardsFrame,
  ClientFrame,
  ConnectionState,
  ErrorFrame,
  HelloFrame,
  OutcomeFrame,
  PingFrame,
  PongFrame,
  ServerFrame,
  SyncFrame,
  WelcomeFrame,
} from "./types"
```

`packages/live/src/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { PROTOCOL_VERSION } from "./index"

describe("@ai-gui/live", () => {
  it("speaks protocol version 1", () => {
    expect(PROTOCOL_VERSION).toBe(1)
  })
})
```

- [ ] **Step 5: Register with the test workspace**

Add to the `alias` object in `vitest.workspace.ts`, beside the other entries:

```ts
  "@ai-gui/live": fileURLToPath(new URL("./packages/live/src/index.ts", import.meta.url)),
```

Add to the projects array:

```ts
  {
    resolve: { alias },
    test: { name: "live", root: "packages/live", coverage },
  },
```

- [ ] **Step 6: Keep the package on the workspace's synced version**

Add `"@ai-gui/live"` to the single `fixed` group array in `.changeset/config.json`, after `"@ai-gui/openclaw"`. Every public package in this repo shares one version, and `scripts/release-tag.mjs` fails the release if they diverge.

- [ ] **Step 7: Licence, install, verify**

```bash
cp packages/plugin-chart/LICENSE packages/live/LICENSE
pnpm install
pnpm exec vitest run --project live
pnpm build
```

Expected: 1 test passing; the workspace build succeeds. The build matters because `turbo.json`'s `build` task is unscoped and CI runs a bare `pnpm build`.

- [ ] **Step 8: Commit**

```bash
git add packages/live vitest.workspace.ts .changeset/config.json pnpm-lock.yaml
git commit -m "feat(live): scaffold @ai-gui/live package"
```

---

## Task 2: The protocol document and shared fixtures

This is the artifact the Rust implementation will be written against. It has to stand alone, without reference to TypeScript.

**Files:**
- Create: `docs/live-protocol.md`
- Create: `fixtures/live-protocol/frames.json`

- [ ] **Step 1: Write the normative protocol document**

`docs/live-protocol.md`:

````markdown
# AIGUI live protocol, version 1

A backend pushes cards to a browser over a WebSocket and receives user actions back. This document is normative; `packages/live` is one implementation of it.

## Framing

One JSON object per WebSocket text message. Every frame carries `v` (integer protocol version) and `t` (frame type). A frame with an unrecognised `t` MUST be ignored rather than rejected, so that a version 1 peer survives a later version adding frames.

## Client to server

| `t` | Fields | Meaning |
| --- | --- | --- |
| `hello` | `session?` string, `token?` string | First frame on every connection. `session` is omitted on a first connection and echoed from a previous `welcome` afterwards. |
| `action` | `id` string, `action` `{ type, params? }` | A user acted. `id` is generated by the client and echoed on the matching `outcome`. |
| `ping` | — | Heartbeat. Sent by the client because browser JavaScript cannot send WebSocket control frames. |

## Server to client

| `t` | Fields | Meaning |
| --- | --- | --- |
| `welcome` | `session` string, `resume` boolean | Answer to `hello`. `resume: false` means the server had no such session and started a new one — this is normal, not an error. |
| `sync` | `snapshot` CardSnapshot | The complete card state. **Replaces** the client's state; it does not merge. Sent immediately after every `welcome`. |
| `cards` | `messages` array of CardMessage | Incremental changes. |
| `outcome` | `id` string, `outcome` ActionOutcome | The result of the action with that `id`. |
| `error` | `code` string, `message` string, `fatal` boolean | When `fatal`, the client stops reconnecting. |
| `pong` | — | Answer to `ping`. |

## CardSnapshot

```json
{ "version": 1, "cards": [ { "id": "…", "type": "…", "data": {}, "revision": 0 } ] }
```

`id` and `type` are non-empty strings. `revision` is a non-negative integer. Ids are unique within a snapshot; a duplicate makes the whole snapshot invalid.

## CardMessage

```json
{ "op": "register", "id": "…", "type": "…", "data": {} }
{ "op": "merge",    "cardId": "…", "data": {}, "revision": 0 }
{ "op": "replace",  "cardId": "…", "data": {}, "revision": 0 }
{ "op": "batch",    "patches": [ /* merge or replace */ ] }
```

`revision` is optional. Deletion is deliberately absent: a card the reader is looking at, or has already acted on, must not vanish because a late frame said so. A server that wants a card gone sends a `sync`.

## ActionOutcome

```json
{ "tone": "positive" | "warning" | "negative" | "neutral",
  "message": "…",
  "fields": { "fieldName": "negative" } }
```

All fields optional except `tone`.

## Lifecycle

1. The client opens the socket and sends `hello`.
2. The server answers `welcome`, then immediately `sync`.
3. The server sends `cards` as state changes. The client sends `action`; the server answers `outcome` with the same `id`.
4. The client sends `ping` periodically and expects `pong`.

On disconnect the client fails every in-flight action and every new action immediately, without queuing. It reconnects with exponential backoff and full jitter, and repeats step 1. **Reconnection has no separate path**: it is the same exchange as a first connection, which is why there is no sequence number and no cursor.

A server MAY evict a session that has had no connections for an idle period. A client reconnecting to an evicted session receives `welcome` with `resume: false` followed by a fresh `sync`.

A session MAY have several concurrent connections. Changes are broadcast to all of them.

## Conformance

`fixtures/live-protocol/frames.json` lists frames with an expected accept/reject verdict. An implementation is conformant when it agrees with every verdict. Both this repository's TypeScript tests and the Rust server SDK read that file.
````

- [ ] **Step 2: Write the shared fixtures**

`fixtures/live-protocol/frames.json`. Each case names a direction and whether a conformant implementation accepts it.

```json
{
  "version": 1,
  "cases": [
    { "name": "hello without session", "dir": "c2s", "valid": true, "frame": { "v": 1, "t": "hello" } },
    { "name": "hello with session and token", "dir": "c2s", "valid": true, "frame": { "v": 1, "t": "hello", "session": "s1", "token": "tok" } },
    { "name": "action", "dir": "c2s", "valid": true, "frame": { "v": 1, "t": "action", "id": "c1", "action": { "type": "metric.drill", "params": { "id": "x" } } } },
    { "name": "action without params", "dir": "c2s", "valid": true, "frame": { "v": 1, "t": "action", "id": "c1", "action": { "type": "refresh" } } },
    { "name": "ping", "dir": "c2s", "valid": true, "frame": { "v": 1, "t": "ping" } },
    { "name": "action missing id", "dir": "c2s", "valid": false, "frame": { "v": 1, "t": "action", "action": { "type": "x" } } },
    { "name": "action with empty type", "dir": "c2s", "valid": false, "frame": { "v": 1, "t": "action", "id": "c1", "action": { "type": "" } } },
    { "name": "frame missing version", "dir": "c2s", "valid": false, "frame": { "t": "ping" } },

    { "name": "welcome resuming", "dir": "s2c", "valid": true, "frame": { "v": 1, "t": "welcome", "session": "s1", "resume": true } },
    { "name": "welcome fresh", "dir": "s2c", "valid": true, "frame": { "v": 1, "t": "welcome", "session": "s1", "resume": false } },
    { "name": "sync empty", "dir": "s2c", "valid": true, "frame": { "v": 1, "t": "sync", "snapshot": { "version": 1, "cards": [] } } },
    { "name": "sync with a card", "dir": "s2c", "valid": true, "frame": { "v": 1, "t": "sync", "snapshot": { "version": 1, "cards": [ { "id": "a", "type": "metric", "data": { "value": 1 }, "revision": 0 } ] } } },
    { "name": "cards register", "dir": "s2c", "valid": true, "frame": { "v": 1, "t": "cards", "messages": [ { "op": "register", "id": "a", "type": "metric", "data": {} } ] } },
    { "name": "cards merge", "dir": "s2c", "valid": true, "frame": { "v": 1, "t": "cards", "messages": [ { "op": "merge", "cardId": "a", "data": { "value": 2 } } ] } },
    { "name": "cards replace", "dir": "s2c", "valid": true, "frame": { "v": 1, "t": "cards", "messages": [ { "op": "replace", "cardId": "a", "data": { "value": 3 }, "revision": 2 } ] } },
    { "name": "cards batch", "dir": "s2c", "valid": true, "frame": { "v": 1, "t": "cards", "messages": [ { "op": "batch", "patches": [ { "op": "merge", "cardId": "a", "data": {} } ] } ] } },
    { "name": "outcome", "dir": "s2c", "valid": true, "frame": { "v": 1, "t": "outcome", "id": "c1", "outcome": { "tone": "positive", "message": "Saved" } } },
    { "name": "error fatal", "dir": "s2c", "valid": true, "frame": { "v": 1, "t": "error", "code": "version", "message": "unsupported", "fatal": true } },
    { "name": "pong", "dir": "s2c", "valid": true, "frame": { "v": 1, "t": "pong" } },
    { "name": "sync with wrong snapshot version", "dir": "s2c", "valid": false, "frame": { "v": 1, "t": "sync", "snapshot": { "version": 2, "cards": [] } } },
    { "name": "sync missing snapshot", "dir": "s2c", "valid": false, "frame": { "v": 1, "t": "sync" } },
    { "name": "outcome missing id", "dir": "s2c", "valid": false, "frame": { "v": 1, "t": "outcome", "outcome": { "tone": "positive" } } },
    { "name": "outcome with unknown tone", "dir": "s2c", "valid": false, "frame": { "v": 1, "t": "outcome", "id": "c1", "outcome": { "tone": "chartreuse" } } },
    { "name": "error missing fatal", "dir": "s2c", "valid": false, "frame": { "v": 1, "t": "error", "code": "x", "message": "y" } },
    { "name": "cards with messages that is not an array", "dir": "s2c", "valid": false, "frame": { "v": 1, "t": "cards", "messages": { "op": "merge", "cardId": "a", "data": {} } } },
    { "name": "cards merge without a cardId", "dir": "s2c", "valid": false, "frame": { "v": 1, "t": "cards", "messages": [ { "op": "merge", "data": {} } ] } },
    { "name": "cards with an unknown op", "dir": "s2c", "valid": false, "frame": { "v": 1, "t": "cards", "messages": [ { "op": "delete", "cardId": "a" } ] } },
    { "name": "cards batch containing an invalid patch", "dir": "s2c", "valid": false, "frame": { "v": 1, "t": "cards", "messages": [ { "op": "batch", "patches": [ { "op": "merge" } ] } ] } },
    { "name": "sync with duplicate card ids", "dir": "s2c", "valid": false, "frame": { "v": 1, "t": "sync", "snapshot": { "version": 1, "cards": [ { "id": "a", "type": "metric", "data": {}, "revision": 0 }, { "id": "a", "type": "metric", "data": {}, "revision": 1 } ] } } },
    { "name": "unknown frame type is ignored, not rejected", "dir": "s2c", "valid": true, "frame": { "v": 1, "t": "future-frame", "anything": true } }
  ]
}
```

The last case encodes the forward-compatibility rule as a testable fact rather than a sentence in prose.

Two groups of these earn their place by covering a rule that would otherwise exist only in prose. `cards replace` exists because the document lists four card ops and an implementer with no fixture for one of them has no way to know they got it wrong. The `cards`-frame negative cases exist because without them nothing tests `CardMessage` validation at all. And `sync with duplicate card ids` pins a rule the document states and `CardStore.restore` enforces — catching it in the codec turns a runtime throw into a conformance failure a server author sees while writing the server.

- [ ] **Step 3: Commit**

```bash
git add docs/live-protocol.md fixtures/live-protocol/frames.json
git commit -m "docs(live): normative protocol reference and shared conformance fixtures"
```

---

## Task 3: Frame codec

**Files:**
- Create: `packages/live/src/frames.ts`
- Create: `packages/live/src/frames.test.ts`
- Modify: `packages/live/src/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/live/src/frames.test.ts`. It is driven by the shared fixtures, so the fixtures cannot drift from the implementation without a red test.

```ts
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { decodeServerFrame, encodeFrame, isFrameValid } from "./frames"

const fixtures = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../fixtures/live-protocol/frames.json", import.meta.url)), "utf8"),
) as { version: number; cases: Array<{ name: string; dir: "c2s" | "s2c"; valid: boolean; frame: unknown }> }

describe("conformance fixtures", () => {
  it("are the version this package speaks", () => {
    expect(fixtures.version).toBe(1)
  })

  it.each(fixtures.cases.map((c) => [c.name, c] as const))("%s", (_name, testCase) => {
    expect(isFrameValid(testCase.frame, testCase.dir)).toBe(testCase.valid)
  })
})

describe("decodeServerFrame", () => {
  it("parses a JSON string into a typed frame", () => {
    const frame = decodeServerFrame('{"v":1,"t":"pong"}')
    expect(frame).toEqual({ v: 1, t: "pong" })
  })

  it("returns undefined for text that is not JSON", () => {
    expect(decodeServerFrame("not json")).toBeUndefined()
  })

  it("returns undefined for a frame that fails validation", () => {
    expect(decodeServerFrame('{"v":1,"t":"outcome"}')).toBeUndefined()
  })

  it("keeps an unknown frame type so the caller can ignore it deliberately", () => {
    expect(decodeServerFrame('{"v":1,"t":"future"}')).toEqual({ v: 1, t: "future" })
  })
})

describe("encodeFrame", () => {
  it("stamps the protocol version so no caller has to remember to", () => {
    expect(JSON.parse(encodeFrame({ t: "ping" }))).toEqual({ v: 1, t: "ping" })
  })

  it("encodes an action with its correlation id", () => {
    const encoded = JSON.parse(encodeFrame({ t: "action", id: "c1", action: { type: "x", params: { a: 1 } } }))
    expect(encoded).toEqual({ v: 1, t: "action", id: "c1", action: { type: "x", params: { a: 1 } } })
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm exec vitest run --project live frames`
Expected: FAIL — `Failed to resolve import "./frames"`.

- [ ] **Step 3: Write the implementation**

`packages/live/src/frames.ts`:

```ts
import { PROTOCOL_VERSION, type ClientFrame, type ServerFrame } from "./types"

const TONES = new Set(["positive", "warning", "negative", "neutral"])

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isId(value: unknown): boolean {
  return typeof value === "string" && value.length > 0
}

function isSnapshot(value: unknown): boolean {
  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.cards)) return false
  const ids = new Set<string>()
  for (const card of value.cards) {
    if (!isObject(card) || !isId(card.id) || !isId(card.type)) return false
    if (!Number.isSafeInteger(card.revision) || (card.revision as number) < 0) return false
    // The protocol document says a duplicate id invalidates the whole snapshot, and
    // `CardStore.restore` throws on one. Catching it here turns what would be a runtime throw
    // into a conformance failure the server implementer sees while writing the server.
    if (ids.has(card.id as string)) return false
    ids.add(card.id as string)
  }
  return true
}

function isCardMessage(value: unknown): boolean {
  if (!isObject(value)) return false
  if (value.op === "register") return isId(value.id) && isId(value.type)
  if (value.op === "merge" || value.op === "replace") return isId(value.cardId)
  if (value.op === "batch") return Array.isArray(value.patches) && value.patches.every(isCardMessage)
  return false
}

function isOutcome(value: unknown): boolean {
  return isObject(value) && typeof value.tone === "string" && TONES.has(value.tone)
}

/**
 * Whether a conformant implementation accepts this frame.
 *
 * An unrecognised `t` is valid on purpose. A version 1 peer must survive a later version adding
 * frames, so "I do not know this" and "this is malformed" have to be different answers — the
 * first is ignored, the second is a protocol violation.
 */
export function isFrameValid(value: unknown, dir: "c2s" | "s2c"): boolean {
  if (!isObject(value)) return false
  if (typeof value.v !== "number") return false
  if (typeof value.t !== "string") return false

  if (dir === "c2s") {
    switch (value.t) {
      case "hello":
        return (value.session === undefined || isId(value.session)) && (value.token === undefined || typeof value.token === "string")
      case "action":
        return isId(value.id) && isObject(value.action) && isId(value.action.type)
      case "ping":
        return true
      default:
        return true
    }
  }

  switch (value.t) {
    case "welcome":
      return isId(value.session) && typeof value.resume === "boolean"
    case "sync":
      return isSnapshot(value.snapshot)
    case "cards":
      return Array.isArray(value.messages) && value.messages.every(isCardMessage)
    case "outcome":
      return isId(value.id) && isOutcome(value.outcome)
    case "error":
      return isId(value.code) && typeof value.message === "string" && typeof value.fatal === "boolean"
    case "pong":
      return true
    default:
      return true
  }
}

/** Parse a socket payload. Returns undefined for anything a conformant peer would reject. */
export function decodeServerFrame(payload: unknown): ServerFrame | undefined {
  if (typeof payload !== "string") return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return undefined
  }
  return isFrameValid(parsed, "s2c") ? (parsed as ServerFrame) : undefined
}

/** Serialise a client frame, stamping the version so no call site has to remember it. */
export function encodeFrame(frame: Omit<ClientFrame, "v">): string {
  return JSON.stringify({ v: PROTOCOL_VERSION, ...frame })
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --project live frames`
Expected: PASS, 37 tests — one asserting the fixture version, 30 fixture cases, and 6 codec tests.

- [ ] **Step 5: Export**

Add to `packages/live/src/index.ts`:

```ts
export { decodeServerFrame, encodeFrame, isFrameValid } from "./frames"
```

- [ ] **Step 6: Commit**

```bash
git add packages/live/src
git commit -m "feat(live): frame codec driven by the shared conformance fixtures"
```

---

## Task 4: Reconnect backoff

A pure function, so the policy can be tested without timers or flakiness.

**Files:**
- Create: `packages/live/src/backoff.ts`
- Create: `packages/live/src/backoff.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/live/src/backoff.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { backoffMs } from "./backoff"

describe("backoffMs", () => {
  it("waits about a second after the first failure", () => {
    expect(backoffMs(0, () => 1)).toBe(1000)
  })

  it("doubles each attempt", () => {
    expect(backoffMs(1, () => 1)).toBe(2000)
    expect(backoffMs(2, () => 1)).toBe(4000)
    expect(backoffMs(3, () => 1)).toBe(8000)
  })

  it("caps so a long outage does not become a half-hour wait", () => {
    expect(backoffMs(20, () => 1)).toBe(30_000)
  })

  /**
   * Full jitter, not a fixed delay. Without it every client that dropped when the server
   * restarted comes back at the same instant and knocks it over again.
   */
  it("spreads clients across the window", () => {
    expect(backoffMs(3, () => 0)).toBe(0)
    expect(backoffMs(3, () => 0.5)).toBe(4000)
  })

  it("never returns a negative delay", () => {
    expect(backoffMs(0, () => 0)).toBeGreaterThanOrEqual(0)
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm exec vitest run --project live backoff`
Expected: FAIL — `Failed to resolve import "./backoff"`.

- [ ] **Step 3: Write the implementation**

`packages/live/src/backoff.ts`:

```ts
const BASE_MS = 1000
const CAP_MS = 30_000

/**
 * How long to wait before reconnect attempt `attempt` (zero-based).
 *
 * Full jitter rather than a fixed delay: when a server restarts, every client it dropped is
 * waiting on the same schedule, and a fixed backoff brings them all back at the same instant.
 * `random` is injected so the policy is testable without flakiness.
 */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(CAP_MS, BASE_MS * 2 ** Math.max(0, attempt))
  return Math.round(ceiling * random())
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --project live backoff`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/live/src
git commit -m "feat(live): reconnect backoff with full jitter"
```

---

## Task 5: Connection state machine

Owns the socket and nothing else. It does not know what a card is.

**Files:**
- Create: `packages/live/src/connection.ts`
- Create: `packages/live/src/connection.test.ts`
- Modify: `packages/live/src/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/live/src/connection.test.ts`. The transport is injected, so no real socket is involved.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createConnection, type SocketLike } from "./connection"

function fakeSocket() {
  const sent: string[] = []
  const socket: SocketLike & { sent: string[]; fire: (event: string, arg?: unknown) => void } = {
    sent,
    send: (data: string) => sent.push(data),
    close: () => socket.fire("close"),
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    fire(event, arg) {
      if (event === "open") socket.onopen?.()
      if (event === "message") socket.onmessage?.({ data: arg })
      if (event === "close") socket.onclose?.()
      if (event === "error") socket.onerror?.(arg)
    },
  }
  return socket
}

let sockets: ReturnType<typeof fakeSocket>[]
const factory = () => {
  const socket = fakeSocket()
  sockets.push(socket)
  return socket
}

beforeEach(() => {
  sockets = []
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe("createConnection", () => {
  it("sends hello as the first frame", () => {
    const conn = createConnection({ url: "ws://x", socketFactory: factory })
    conn.start()
    sockets[0].fire("open")
    expect(JSON.parse(sockets[0].sent[0])).toEqual({ v: 1, t: "hello" })
    conn.stop()
  })

  it("echoes the session it was given on the next hello", () => {
    const conn = createConnection({ url: "ws://x", socketFactory: factory })
    conn.start()
    sockets[0].fire("open")
    sockets[0].fire("message", JSON.stringify({ v: 1, t: "welcome", session: "s9", resume: false }))
    sockets[0].fire("close")
    vi.advanceTimersByTime(60_000)
    sockets[1].fire("open")
    expect(JSON.parse(sockets[1].sent[0])).toEqual({ v: 1, t: "hello", session: "s9" })
    conn.stop()
  })

  it("hands decoded frames to the host", () => {
    const onFrame = vi.fn()
    const conn = createConnection({ url: "ws://x", socketFactory: factory, onFrame })
    conn.start()
    sockets[0].fire("open")
    sockets[0].fire("message", JSON.stringify({ v: 1, t: "pong" }))
    expect(onFrame).toHaveBeenCalledWith({ v: 1, t: "pong" })
    conn.stop()
  })

  it("drops a malformed frame instead of surfacing it", () => {
    const onFrame = vi.fn()
    const conn = createConnection({ url: "ws://x", socketFactory: factory, onFrame })
    conn.start()
    sockets[0].fire("open")
    sockets[0].fire("message", "{not json")
    expect(onFrame).not.toHaveBeenCalled()
    conn.stop()
  })

  it("reports state so a host can show an indicator", () => {
    const onState = vi.fn()
    const conn = createConnection({ url: "ws://x", socketFactory: factory, onState })
    conn.start()
    expect(onState).toHaveBeenCalledWith("connecting")
    sockets[0].fire("open")
    expect(onState).toHaveBeenCalledWith("open")
    sockets[0].fire("close")
    expect(onState).toHaveBeenCalledWith("closed")
    conn.stop()
  })

  it("reconnects after a drop", () => {
    const conn = createConnection({ url: "ws://x", socketFactory: factory })
    conn.start()
    sockets[0].fire("open")
    sockets[0].fire("close")
    vi.advanceTimersByTime(60_000)
    expect(sockets).toHaveLength(2)
    conn.stop()
  })

  /**
   * A fatal error means retrying cannot help. Reconnecting anyway turns one misconfigured client
   * into a load generator against a server that already said no.
   */
  it("stops retrying after a fatal error", () => {
    const conn = createConnection({ url: "ws://x", socketFactory: factory })
    conn.start()
    sockets[0].fire("open")
    sockets[0].fire("message", JSON.stringify({ v: 1, t: "error", code: "version", message: "no", fatal: true }))
    sockets[0].fire("close")
    vi.advanceTimersByTime(120_000)
    expect(sockets).toHaveLength(1)
    conn.stop()
  })

  it("keeps retrying after a non-fatal error", () => {
    const conn = createConnection({ url: "ws://x", socketFactory: factory })
    conn.start()
    sockets[0].fire("open")
    sockets[0].fire("message", JSON.stringify({ v: 1, t: "error", code: "busy", message: "later", fatal: false }))
    sockets[0].fire("close")
    vi.advanceTimersByTime(60_000)
    expect(sockets).toHaveLength(2)
    conn.stop()
  })

  it("sends a heartbeat and survives the answer", () => {
    const conn = createConnection({ url: "ws://x", socketFactory: factory, heartbeatMs: 1000, heartbeatTimeoutMs: 500 })
    conn.start()
    sockets[0].fire("open")
    vi.advanceTimersByTime(1000)
    expect(JSON.parse(sockets[0].sent.at(-1)!)).toEqual({ v: 1, t: "ping" })
    sockets[0].fire("message", JSON.stringify({ v: 1, t: "pong" }))
    vi.advanceTimersByTime(400)
    expect(sockets).toHaveLength(1)
    conn.stop()
  })

  /**
   * A socket that stops answering without closing is the failure this exists for: the browser
   * reports it open, and every action silently hangs until the user reloads.
   */
  it("reconnects when the heartbeat goes unanswered", () => {
    const conn = createConnection({ url: "ws://x", socketFactory: factory, heartbeatMs: 1000, heartbeatTimeoutMs: 500 })
    conn.start()
    sockets[0].fire("open")
    vi.advanceTimersByTime(1500)
    vi.advanceTimersByTime(60_000)
    expect(sockets.length).toBeGreaterThan(1)
    conn.stop()
  })

  it("stops cleanly and does not reconnect afterwards", () => {
    const conn = createConnection({ url: "ws://x", socketFactory: factory })
    conn.start()
    sockets[0].fire("open")
    conn.stop()
    vi.advanceTimersByTime(120_000)
    expect(sockets).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm exec vitest run --project live connection`
Expected: FAIL — `Failed to resolve import "./connection"`.

- [ ] **Step 3: Write the implementation**

`packages/live/src/connection.ts`:

```ts
import { backoffMs } from "./backoff"
import { decodeServerFrame, encodeFrame } from "./frames"
import type { ClientFrame, ConnectionState, ServerFrame } from "./types"

/** The slice of WebSocket this package uses, so tests can supply a stand-in. */
export interface SocketLike {
  send(data: string): void
  close(): void
  onopen: (() => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: (() => void) | null
  onerror: ((error: unknown) => void) | null
}

export type SocketFactory = (url: string) => SocketLike

export interface ConnectionOptions {
  url: string
  token?: string
  socketFactory?: SocketFactory
  onFrame?: (frame: ServerFrame) => void
  onState?: (state: ConnectionState) => void
  /** How often to ping. Default 15s. */
  heartbeatMs?: number
  /** How long to wait for a pong before treating the socket as dead. Default 10s. */
  heartbeatTimeoutMs?: number
  random?: () => number
}

export interface Connection {
  start(): void
  stop(): void
  send(frame: Omit<ClientFrame, "v">): boolean
  readonly state: ConnectionState
}

const defaultFactory: SocketFactory = (url) => new WebSocket(url) as unknown as SocketLike

export function createConnection(options: ConnectionOptions): Connection {
  const factory = options.socketFactory ?? defaultFactory
  const heartbeatMs = options.heartbeatMs ?? 15_000
  const heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 10_000

  let socket: SocketLike | undefined
  let state: ConnectionState = "closed"
  let session: string | undefined
  let attempt = 0
  let stopped = false
  let fatal = false
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let pongTimer: ReturnType<typeof setTimeout> | undefined

  function setState(next: ConnectionState): void {
    if (state === next) return
    state = next
    options.onState?.(next)
  }

  function clearTimers(): void {
    if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer)
    if (pongTimer !== undefined) clearTimeout(pongTimer)
    heartbeatTimer = undefined
    pongTimer = undefined
  }

  function beat(): void {
    if (!socket) return
    socket.send(encodeFrame({ t: "ping" }))
    if (pongTimer !== undefined) clearTimeout(pongTimer)
    // A socket that stops answering without closing is why this exists: the browser still
    // reports it open, so nothing else would ever notice.
    pongTimer = setTimeout(() => socket?.close(), heartbeatTimeoutMs)
  }

  function scheduleReconnect(): void {
    if (stopped || fatal) return
    const delay = backoffMs(attempt++, options.random)
    reconnectTimer = setTimeout(open, delay)
  }

  function open(): void {
    if (stopped || fatal) return
    setState("connecting")
    const current = factory(options.url)
    socket = current

    current.onopen = () => {
      attempt = 0
      setState("open")
      current.send(encodeFrame({ t: "hello", ...(session ? { session } : {}), ...(options.token ? { token: options.token } : {}) }))
      heartbeatTimer = setInterval(beat, heartbeatMs)
    }

    current.onmessage = (event) => {
      const frame = decodeServerFrame(event.data)
      if (!frame) return
      if (frame.t === "pong") {
        if (pongTimer !== undefined) clearTimeout(pongTimer)
        pongTimer = undefined
      }
      if (frame.t === "welcome") session = frame.session
      if (frame.t === "error" && frame.fatal) fatal = true
      // Every valid frame reaches the host, `pong` included. Swallowing it here would make this
      // component "you get everything except the one you have to know about", and it would put
      // round-trip latency or a last-heard-from timestamp out of the host's reach for no gain —
      // the client's frame switch ignores what it does not handle anyway.
      options.onFrame?.(frame)
    }

    current.onclose = () => {
      clearTimers()
      socket = undefined
      setState(fatal ? "fatal" : "closed")
      scheduleReconnect()
    }

    current.onerror = () => {
      // A socket that errors also closes; the close handler owns reconnection so it happens once.
    }
  }

  return {
    start() {
      stopped = false
      open()
    },
    stop() {
      stopped = true
      clearTimers()
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer)
      reconnectTimer = undefined
      const current = socket
      socket = undefined
      current?.close()
      setState("closed")
    },
    send(frame) {
      if (!socket || state !== "open") return false
      socket.send(encodeFrame(frame))
      return true
    },
    get state() {
      return state
    },
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --project live connection`
Expected: PASS, 11 tests.

- [ ] **Step 5: Export**

Add to `packages/live/src/index.ts`:

```ts
export { createConnection } from "./connection"
export type { Connection, ConnectionOptions, SocketFactory, SocketLike } from "./connection"
```

- [ ] **Step 6: Commit**

```bash
git add packages/live/src
git commit -m "feat(live): connection lifecycle with heartbeat and jittered reconnect"
```

---

## Task 6: The client

Joins a connection to a `CardStore` and an `ActionRuntime`. This is the package's public surface.

**Files:**
- Create: `packages/live/src/client.ts`
- Create: `packages/live/src/client.test.ts`
- Modify: `packages/live/src/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/live/src/client.test.ts`:

```ts
import { CardStore } from "@ai-gui/core"
import { describe, expect, it, vi } from "vitest"
import { createLiveClient } from "./client"
import type { Connection } from "./connection"
import type { ServerFrame } from "./types"

function fakeConnection() {
  const sent: unknown[] = []
  let onFrame: ((frame: ServerFrame) => void) | undefined
  const connection: Connection & { sent: unknown[]; deliver: (frame: ServerFrame) => void; open: boolean } = {
    sent,
    open: true,
    start: vi.fn(),
    stop: vi.fn(),
    send: (frame) => {
      sent.push(frame)
      return connection.open
    },
    get state() {
      return connection.open ? ("open" as const) : ("closed" as const)
    },
    deliver: (frame) => onFrame?.(frame),
  }
  return { connection, bind: (handler: (frame: ServerFrame) => void) => (onFrame = handler) }
}

function setup() {
  const store = new CardStore()
  const { connection, bind } = fakeConnection()
  const client = createLiveClient({ store, connection, bindFrames: bind })
  return { store, connection, client }
}

describe("createLiveClient", () => {
  it("replaces the whole store on sync, so a deleted card disappears", () => {
    const { store, connection } = setup()
    store.register({ id: "stale", type: "metric", data: {} })
    connection.deliver({
      v: 1,
      t: "sync",
      snapshot: { version: 1, cards: [{ id: "fresh", type: "metric", data: {}, revision: 0 }] },
    })
    expect(store.list().map((c) => c.id)).toEqual(["fresh"])
  })

  it("applies card messages", () => {
    const { store, connection } = setup()
    connection.deliver({ v: 1, t: "cards", messages: [{ op: "register", id: "a", type: "metric", data: { value: 1 } }] })
    expect(store.get("a")?.data).toEqual({ value: 1 })
  })

  it("does not throw on a card message the store rejects", () => {
    const onError = vi.fn()
    const store = new CardStore()
    const { connection, bind } = fakeConnection()
    createLiveClient({ store, connection, bindFrames: bind, onError })
    expect(() =>
      connection.deliver({ v: 1, t: "cards", messages: [{ op: "merge", cardId: "missing", data: {} }] }),
    ).not.toThrow()
    expect(onError).toHaveBeenCalled()
  })

  it("sends an action and resolves when the outcome arrives", async () => {
    const { connection, client } = setup()
    const pending = client.sendAction({ type: "metric.drill", params: { id: "x" } })
    expect(connection.sent[0]).toMatchObject({ t: "action", action: { type: "metric.drill" } })
    const id = (connection.sent[0] as { id: string }).id
    connection.deliver({ v: 1, t: "outcome", id, outcome: { tone: "positive", message: "ok" } })
    await expect(pending).resolves.toEqual({ outcome: { tone: "positive", message: "ok" } })
  })

  it("correlates outcomes to the right action", async () => {
    const { connection, client } = setup()
    const first = client.sendAction({ type: "a" })
    const second = client.sendAction({ type: "b" })
    const secondId = (connection.sent[1] as { id: string }).id
    connection.deliver({ v: 1, t: "outcome", id: secondId, outcome: { tone: "warning" } })
    await expect(second).resolves.toEqual({ outcome: { tone: "warning" } })
    const firstId = (connection.sent[0] as { id: string }).id
    connection.deliver({ v: 1, t: "outcome", id: firstId, outcome: { tone: "positive" } })
    await expect(first).resolves.toEqual({ outcome: { tone: "positive" } })
  })

  /**
   * Queuing would replay a click the reader made against a dead socket — three taps on delete
   * become three deletes on reconnect. Failing now puts the decision back where it belongs.
   */
  it("fails an action immediately while disconnected instead of queuing it", async () => {
    const { connection, client } = setup()
    connection.open = false
    const result = await client.sendAction({ type: "x" })
    expect(result.outcome.tone).toBe("negative")
    expect(connection.sent).toHaveLength(0)
  })

  it("fails actions that were in flight when the socket dropped", async () => {
    const { connection, client } = setup()
    const pending = client.sendAction({ type: "x" })
    connection.open = false
    client.handleDisconnect()
    const result = await pending
    expect(result.outcome.tone).toBe("negative")
  })

  it("reports an unknown frame type without throwing", () => {
    const { connection } = setup()
    expect(() => connection.deliver({ v: 1, t: "future" } as unknown as ServerFrame)).not.toThrow()
  })

  /**
   * The stated guarantee is that a dropped socket never blanks the page. It holds because nothing
   * on the disconnect path touches the store — which is exactly the kind of property that is true
   * by accident until someone "tidies up" by clearing state on disconnect.
   */
  it("leaves the rendered cards alone when the socket drops", () => {
    const { store, connection, client } = setup()
    connection.deliver({ v: 1, t: "cards", messages: [{ op: "register", id: "a", type: "metric", data: { value: 7 } }] })
    connection.open = false
    client.handleDisconnect()
    expect(store.get("a")?.data).toEqual({ value: 7 })
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm exec vitest run --project live client`
Expected: FAIL — `Failed to resolve import "./client"`.

- [ ] **Step 3: Write the implementation**

`packages/live/src/client.ts`:

```ts
import { cardChannel, type ActionOutcome, type CardStore } from "@ai-gui/core"
import type { Connection } from "./connection"
import type { ServerFrame } from "./types"

export interface LiveActionResult {
  outcome: ActionOutcome
}

export interface LiveClientOptions {
  store: CardStore
  connection: Connection
  /** How the client subscribes to frames. Injected so a fake connection can drive it in tests. */
  bindFrames: (handler: (frame: ServerFrame) => void) => void
  onError?: (error: unknown, detail: unknown) => void
}

export interface LiveClient {
  sendAction(action: { type: string; params?: unknown }): Promise<LiveActionResult>
  /** Called by the host when the socket drops, so in-flight actions stop hanging. */
  handleDisconnect(): void
}

const DISCONNECTED: LiveActionResult = {
  outcome: { tone: "negative", message: "Not connected" },
}

export function createLiveClient(options: LiveClientOptions): LiveClient {
  const applyCardMessage = cardChannel(options.store, {
    onError: (error, message) => options.onError?.(error, message),
  })
  const pending = new Map<string, (result: LiveActionResult) => void>()
  let counter = 0

  options.bindFrames((frame) => {
    switch (frame.t) {
      case "sync":
        // `restore` replaces rather than merges, so a card the server dropped while this client
        // was away actually disappears. That is the reason sync carries a whole snapshot.
        try {
          options.store.restore(frame.snapshot)
        } catch (error) {
          options.onError?.(error, frame)
        }
        return
      case "cards":
        for (const message of frame.messages) applyCardMessage(message)
        return
      case "outcome": {
        const resolve = pending.get(frame.id)
        if (!resolve) return
        pending.delete(frame.id)
        resolve({ outcome: frame.outcome })
        return
      }
      default:
        // welcome, error, pong and anything a later version adds are the connection's business.
        return
    }
  })

  return {
    sendAction(action) {
      const id = `c${++counter}`
      return new Promise<LiveActionResult>((resolve) => {
        const sent = options.connection.send({ t: "action", id, action })
        if (!sent) {
          resolve(DISCONNECTED)
          return
        }
        pending.set(id, resolve)
      })
    },
    handleDisconnect() {
      for (const [, resolve] of pending) resolve(DISCONNECTED)
      pending.clear()
    },
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run --project live client`
Expected: PASS, 9 tests.

- [ ] **Step 5: Export**

Add to `packages/live/src/index.ts`:

```ts
export { createLiveClient } from "./client"
export type { LiveActionResult, LiveClient, LiveClientOptions } from "./client"
```

- [ ] **Step 6: Commit**

```bash
git add packages/live/src
git commit -m "feat(live): client joining a connection to a CardStore and actions"
```

---

## Task 7: Reference server and end-to-end test

The reference server is the protocol made executable. Without it the fixtures are a claim; with it they are demonstrated, and the Rust implementer has something to run against.

**Files:**
- Create: `packages/live/src/reference-server.ts`
- Create: `packages/live/src/e2e.test.ts`

- [ ] **Step 1: Write the reference server**

`packages/live/src/reference-server.ts`. Test-only: excluded from the build in `tsconfig.json`, and `ws` is a devDependency.

```ts
import { randomUUID } from "node:crypto"
import { WebSocketServer, type WebSocket } from "ws"
import type { CardMessage, CardSnapshot } from "@ai-gui/core"

/**
 * A minimal server implementing the live protocol.
 *
 * It exists to make the protocol executable — for this package's end-to-end test, and for anyone
 * implementing a server in another language who wants something to compare against. It is not a
 * product: sessions live in memory and nothing is authenticated.
 */
export interface ReferenceSession {
  cards: Map<string, { id: string; type: string; data: unknown; revision: number }>
  sockets: Set<WebSocket>
}

export interface ReferenceServer {
  port: number
  /** Push messages to every connection watching a session. */
  push(sessionId: string, messages: CardMessage[]): void
  /** Answer the next action of this type with this outcome. */
  onAction(type: string, handler: (params: unknown) => { tone: string; message?: string }): void
  sessions: Map<string, ReferenceSession>
  close(): Promise<void>
}

export async function startReferenceServer(): Promise<ReferenceServer> {
  const wss = new WebSocketServer({ port: 0 })
  const sessions = new Map<string, ReferenceSession>()
  const handlers = new Map<string, (params: unknown) => { tone: string; message?: string }>()

  function snapshotOf(session: ReferenceSession): CardSnapshot {
    return { version: 1, cards: [...session.cards.values()] }
  }

  wss.on("connection", (socket) => {
    let sessionId: string | undefined

    socket.on("message", (raw) => {
      let frame: Record<string, unknown>
      try {
        frame = JSON.parse(String(raw)) as Record<string, unknown>
      } catch {
        return
      }
      if (frame.v !== 1) {
        socket.send(JSON.stringify({ v: 1, t: "error", code: "version", message: "unsupported", fatal: true }))
        socket.close()
        return
      }

      if (frame.t === "hello") {
        const asked = typeof frame.session === "string" ? frame.session : undefined
        const resume = Boolean(asked && sessions.has(asked))
        sessionId = resume ? (asked as string) : randomUUID()
        const session = sessions.get(sessionId) ?? { cards: new Map(), sockets: new Set() }
        session.sockets.add(socket)
        sessions.set(sessionId, session)
        socket.send(JSON.stringify({ v: 1, t: "welcome", session: sessionId, resume }))
        socket.send(JSON.stringify({ v: 1, t: "sync", snapshot: snapshotOf(session) }))
        return
      }

      if (frame.t === "ping") {
        socket.send(JSON.stringify({ v: 1, t: "pong" }))
        return
      }

      if (frame.t === "action") {
        const action = frame.action as { type: string; params?: unknown }
        const handler = handlers.get(action.type)
        const outcome = handler
          ? handler(action.params)
          : { tone: "negative", message: `Unknown action "${action.type}"` }
        socket.send(JSON.stringify({ v: 1, t: "outcome", id: frame.id, outcome }))
      }
    })

    socket.on("close", () => {
      if (sessionId) sessions.get(sessionId)?.sockets.delete(socket)
    })
  })

  await new Promise<void>((resolve) => wss.once("listening", () => resolve()))
  const address = wss.address()
  const port = typeof address === "object" && address ? address.port : 0

  return {
    port,
    sessions,
    push(sessionId, messages) {
      const session = sessions.get(sessionId)
      if (!session) return
      for (const message of messages) {
        if (message.op === "register") {
          session.cards.set(message.id, { id: message.id, type: message.type, data: message.data, revision: 0 })
        }
      }
      const payload = JSON.stringify({ v: 1, t: "cards", messages })
      for (const socket of session.sockets) socket.send(payload)
    },
    onAction(type, handler) {
      handlers.set(type, handler)
    },
    async close() {
      for (const session of sessions.values()) for (const socket of session.sockets) socket.close()
      await new Promise<void>((resolve) => wss.close(() => resolve()))
    },
  }
}
```

- [ ] **Step 2: Write the end-to-end test**

`packages/live/src/e2e.test.ts`. A real socket, a real server, no fakes.

```ts
import { CardStore } from "@ai-gui/core"
import { WebSocket } from "ws"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createLiveClient } from "./client"
import { createConnection, type SocketLike } from "./connection"
import { startReferenceServer, type ReferenceServer } from "./reference-server"

let server: ReferenceServer

beforeEach(async () => {
  server = await startReferenceServer()
})
afterEach(async () => {
  await server.close()
})

function connect(store: CardStore) {
  let handler: ((frame: never) => void) | undefined
  const connection = createConnection({
    url: `ws://127.0.0.1:${server.port}`,
    socketFactory: (url) => new WebSocket(url) as unknown as SocketLike,
    onFrame: (frame) => handler?.(frame as never),
  })
  const client = createLiveClient({
    store,
    connection,
    bindFrames: (next) => (handler = next as (frame: never) => void),
  })
  connection.start()
  return { connection, client }
}

async function until(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("timed out waiting for condition")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe("client against the reference server", () => {
  it("receives a session and an initial sync", async () => {
    const store = new CardStore()
    const { connection } = connect(store)
    await until(() => server.sessions.size === 1)
    expect(store.list()).toEqual([])
    connection.stop()
  })

  it("renders a card the server pushes", async () => {
    const store = new CardStore()
    const { connection } = connect(store)
    await until(() => server.sessions.size === 1)
    const sessionId = [...server.sessions.keys()][0]
    server.push(sessionId, [{ op: "register", id: "a", type: "metric", data: { value: 42 } }])
    await until(() => store.get("a") !== undefined)
    expect(store.get("a")?.data).toEqual({ value: 42 })
    connection.stop()
  })

  it("carries an action to the server and the outcome back", async () => {
    const store = new CardStore()
    const { connection, client } = connect(store)
    await until(() => server.sessions.size === 1)
    server.onAction("metric.drill", () => ({ tone: "positive", message: "drilled" }))
    const result = await client.sendAction({ type: "metric.drill", params: { id: "a" } })
    expect(result.outcome).toEqual({ tone: "positive", message: "drilled" })
    connection.stop()
  })

  it("answers an unknown action with a failure rather than dropping the socket", async () => {
    const store = new CardStore()
    const { connection, client } = connect(store)
    await until(() => server.sessions.size === 1)
    const result = await client.sendAction({ type: "nope" })
    expect(result.outcome.tone).toBe("negative")
    expect(connection.state).toBe("open")
    connection.stop()
  })
})
```

- [ ] **Step 3: Run the end-to-end test**

Run: `pnpm exec vitest run --project live e2e`
Expected: PASS, 4 tests.

If the client hangs waiting for a session, log what the server received — the most likely cause is a frame the codec rejected, which is invisible by design because `decodeServerFrame` returns undefined rather than throwing.

- [ ] **Step 4: Run everything**

```bash
pnpm exec vitest run --project live
pnpm test:unit
pnpm build
pnpm typecheck
pnpm validate:packages
```

All must pass. `validate:packages` packs the tarball; confirm `reference-server` and `ws` do **not** appear in the published output, since the server is test-only.

- [ ] **Step 5: Commit**

```bash
git add packages/live/src
git commit -m "test(live): reference server and end-to-end coverage over a real socket"
```

---

## Task 8: README and changeset

**Files:**
- Create: `packages/live/README.md`
- Modify: `README.md`
- Create: `.changeset/aigui-live.md`

- [ ] **Step 1: Write the package README**

`packages/live/README.md`:

````markdown
# @ai-gui/live

A WebSocket client for [AIGUI](../../README.md)'s card layer. A backend pushes cards, the browser renders them, the reader acts, and the backend hears about it — with no frontend project on the backend's side.

This is not a replacement for the streaming markdown path. That half parses in the browser on purpose, repairing half-typed syntax as bytes arrive, and moving it to a server would cost a round trip per token. `@ai-gui/live` carries cards, `ui` documents and actions.

## Install

```sh
pnpm add @ai-gui/live @ai-gui/core
```

## Usage

```ts
import { CardStore } from "@ai-gui/core"
import { createConnection, createLiveClient } from "@ai-gui/live"

const store = new CardStore({ registry })

let onFrame
const connection = createConnection({
  url: "wss://example.com/live",
  onFrame: (frame) => onFrame?.(frame),
  onState: (state) => setIndicator(state),
})
const client = createLiveClient({
  store,
  connection,
  bindFrames: (handler) => (onFrame = handler),
})
connection.start()

// A control calls this; the promise resolves when the server answers.
const { outcome } = await client.sendAction({ type: "metric.drill", params: { id: "a" } })
```

Render `store` with whichever adapter you already use. `@ai-gui/live` never touches the DOM.

## What it guarantees

- **A dropped socket never blanks the page.** The last state stays rendered; only the connection state changes.
- **Reconnection is the same code path as the first connection** — `hello`, `welcome`, full `sync`. There is no recovery-only branch to rot, and no cursor to get wrong.
- **Actions fail immediately while disconnected.** They are never queued, because replaying a click the reader made against a dead socket is worse than telling them it failed.
- **An unknown frame is ignored, not an error**, so a v1 client survives a later server.

## Protocol

`docs/live-protocol.md` is normative, and `fixtures/live-protocol/frames.json` is the conformance suite every implementation tests against. A server in any language is conformant when it agrees with every verdict in that file.

`src/reference-server.ts` is a minimal Node implementation used by this package's tests. It is not published, and it is a useful thing to run against while writing a server in another language.
````

- [ ] **Step 2: Add one line to the root README**

In `README.md`, add to the optional-install list in the Install section:

```sh
# server-driven cards over a socket (optional)
pnpm add @ai-gui/live
```

- [ ] **Step 3: Write the changeset**

`.changeset/aigui-live.md`:

```md
---
"@ai-gui/live": minor
---

A WebSocket client for the card layer, so a backend can drive an AIGUI interface without a frontend project.

Cards, `ui` documents and actions travel over one socket. The server holds authoritative state and resyncs in full on reconnect, which means recovery uses the same code path as a first connection rather than a separate one that only runs after a failure. Actions fail immediately while disconnected instead of queuing, so a click made against a dead socket is never replayed later. The protocol is specified in `docs/live-protocol.md` and pinned by shared fixtures that any implementation, in any language, can test against.
```

- [ ] **Step 4: Verify and commit**

```bash
pnpm test:unit
pnpm build
pnpm validate:packages
git add packages/live/README.md README.md .changeset/aigui-live.md
git commit -m "docs(live): README and changeset"
```

---

## Deliberately not in this plan

- **Authentication beyond the opaque `token` in `hello`.** The server validates it however it validates anything else; the protocol has no opinion.
- **Backpressure.** A dashboard cannot outrun a browser. A high-frequency feed could, and would need it.
- **Queued actions.** They require idempotency keys and server-side deduplication, and the spec argues the failure is the better default.
- **A React or Vue binding.** `store` is already reactive through `subscribe`/`subscribeAll`, and the existing adapters render it.
- **The Rust SDK and the DataIntelligence wiring.** Sub-projects two and three, each with its own plan.
