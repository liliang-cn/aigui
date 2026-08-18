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
