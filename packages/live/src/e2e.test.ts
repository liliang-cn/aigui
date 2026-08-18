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

  /**
   * Fix 1: a disconnect that arrives while an action is in flight must settle that action's
   * promise, not leave it hanging forever. A real timeout on the test itself is the point — if the
   * client ever regresses to needing a host to call handleDisconnect, this test hangs instead of
   * failing cleanly, and the timeout is what turns that into a red test.
   */
  it("fails an in-flight action when the server goes away, instead of hanging", async () => {
    const store = new CardStore()
    const { connection, client } = connect(store)
    await until(() => server.sessions.size === 1)
    // A handler that never resolves: the only way this action's promise ever settles is via the
    // disconnect path, not via an outcome frame.
    server.onAction("never-answered", () => new Promise<never>(() => {}))
    const pending = client.sendAction({ type: "never-answered" })
    await server.close()
    const result = await pending
    expect(result.outcome.tone).toBe("negative")
    connection.stop()
  }, 10_000)

  it("fails an in-flight action when the connection is stopped locally, instead of hanging", async () => {
    const store = new CardStore()
    const { connection, client } = connect(store)
    await until(() => server.sessions.size === 1)
    server.onAction("never-answered", () => new Promise<never>(() => {}))
    const pending = client.sendAction({ type: "never-answered" })
    connection.stop()
    const result = await pending
    expect(result.outcome.tone).toBe("negative")
  }, 10_000)

  /**
   * Fix 5: `{"v":1,"t":"action","id":"c1"}` with no `action` field used to reach
   * `frame.action.type` inside an async `message` handler and throw, producing an unhandled
   * rejection. The reference server must ignore a frame `isFrameValid` rejects rather than acting
   * on it — and, more importantly, must not go down: another connection sending a real action
   * afterwards still has to get an outcome.
   */
  it("ignores a malformed action frame and keeps serving other connections", async () => {
    const raw = new WebSocket(`ws://127.0.0.1:${server.port}`)
    await new Promise<void>((resolve, reject) => {
      raw.once("open", () => resolve())
      raw.once("error", reject)
    })
    raw.send(JSON.stringify({ v: 1, t: "action", id: "c1" })) // no `action` field
    // Give the server's message handler a turn to (not) throw before moving on.
    await new Promise((resolve) => setTimeout(resolve, 50))

    const store = new CardStore()
    const { connection, client } = connect(store)
    await until(() => server.sessions.size >= 1)
    server.onAction("still-alive", () => ({ tone: "positive", message: "ok" }))
    const result = await client.sendAction({ type: "still-alive" })
    expect(result.outcome).toEqual({ tone: "positive", message: "ok" })

    connection.stop()
    raw.close()
  })
})
