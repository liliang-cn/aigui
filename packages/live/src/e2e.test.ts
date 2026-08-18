import { CardStore } from "@ai-gui/core"
import { WebSocket } from "ws"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createLiveClient } from "./client"
import { createConnection, type SocketLike } from "./connection"
import { startReferenceServer, type ReferenceServer } from "./reference-server"
import type { ServerFrame } from "./types"

let server: ReferenceServer

beforeEach(async () => {
  server = await startReferenceServer()
})
afterEach(async () => {
  await server.close()
})

function connect(store: CardStore) {
  let handler: ((frame: ServerFrame) => void) | undefined
  const connection = createConnection({
    url: `ws://127.0.0.1:${server.port}`,
    socketFactory: (url) => new WebSocket(url) as unknown as SocketLike,
    onFrame: (frame) => handler?.(frame),
  })
  const client = createLiveClient({
    store,
    connection,
    bindFrames: (next) => (handler = next),
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

  /**
   * Two actions in flight at once, with the server answering out of order: the "slow" action is
   * sent first but its handler resolves after "quick"'s. A client that resolves pending promises
   * in arrival order — rather than matching `frame.id` — would hand "slow"'s caller the "quick"
   * outcome and vice versa. Every other e2e case sends one action at a time, which cannot tell
   * correct correlation apart from "resolve whatever is pending first"; a break check confirmed
   * the rest of this suite stays green with correlation removed.
   */
  it("keeps two concurrent actions apart", async () => {
    const store = new CardStore()
    const { connection, client } = connect(store)
    await until(() => server.sessions.size === 1)
    server.onAction(
      "slow",
      () => new Promise((resolve) => setTimeout(() => resolve({ tone: "warning", message: "slow" }), 50)),
    )
    server.onAction("quick", () => ({ tone: "positive", message: "quick" }))
    const [slow, quick] = await Promise.all([
      client.sendAction({ type: "slow" }),
      client.sendAction({ type: "quick" }),
    ])
    expect(slow.outcome.message).toBe("slow")
    expect(quick.outcome.message).toBe("quick")
    connection.stop()
  })
})
