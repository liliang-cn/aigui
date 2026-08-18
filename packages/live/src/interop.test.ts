import { CardStore } from "@ai-gui/core"
import { WebSocket } from "ws"
import { describe, expect, it } from "vitest"
import { createLiveClient } from "./client"
import { createConnection, type SocketLike } from "./connection"
import type { ServerFrame } from "./types"

/**
 * The client against a server that is not its own reference implementation.
 *
 * Skipped unless AIGUI_LIVE_INTEROP_URL is set, because it needs that server running. The Rust
 * repository's `scripts/interop.sh` starts one and sets the variable.
 */
const url = process.env.AIGUI_LIVE_INTEROP_URL

function connect(store: CardStore) {
  let handler: ((frame: ServerFrame) => void) | undefined
  const connection = createConnection({
    url: url!,
    // Agreed out of band with `examples/interop-server.rs`, which pushes its timer-driven card
    // into this exact session name. `docs/live-protocol.md`'s "a client may name any session"
    // note is what makes this legal on a first connection, not just a reconnect.
    session: "interop",
    socketFactory: (target) => new WebSocket(target) as unknown as SocketLike,
    onFrame: (frame) => handler?.(frame),
  })
  const client = createLiveClient({ store, connection, bindFrames: (next) => (handler = next) })
  connection.start()
  return { connection, client }
}

async function until(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("timed out")
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

describe.skipIf(!url)("against the Rust server", () => {
  it("completes the handshake and receives a snapshot", async () => {
    const store = new CardStore()
    const { connection } = connect(store)
    await until(() => connection.state === "open")
    connection.stop()
  }, 20_000)

  it("renders a card the Rust server pushes on its own", async () => {
    const store = new CardStore()
    const { connection } = connect(store)
    await until(() => store.get("cpu") !== undefined)
    expect(store.get("cpu")?.type).toBe("metric")
    connection.stop()
  }, 20_000)

  it("carries an action to Rust and the outcome back", async () => {
    const store = new CardStore()
    const { connection, client } = connect(store)
    await until(() => connection.state === "open")
    const result = await client.sendAction({ type: "metric.drill", params: { id: "cpu" } })
    expect(result.outcome.message).toBe("drilled")
    connection.stop()
  }, 20_000)

  it("keeps two concurrent actions apart across implementations", async () => {
    const store = new CardStore()
    const { connection, client } = connect(store)
    await until(() => connection.state === "open")
    const [slow, quick] = await Promise.all([
      client.sendAction({ type: "slow" }),
      client.sendAction({ type: "quick" }),
    ])
    expect(slow.outcome.message).toBe("slow")
    expect(quick.outcome.message).toBe("quick")
    connection.stop()
  }, 20_000)

  it("gets a failure, not a dropped socket, for an action Rust does not know", async () => {
    const store = new CardStore()
    const { connection, client } = connect(store)
    await until(() => connection.state === "open")
    const result = await client.sendAction({ type: "nope" })
    expect(result.outcome.tone).toBe("negative")
    expect(connection.state).toBe("open")
    connection.stop()
  }, 20_000)
})
