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
    // Mirrors the real `send` (connection.ts): a closed socket is never handed a frame, and the
    // caller is told so. A fake that recorded the attempt anyway would model something the real
    // connection does not do, and every test built on it would be pinning fiction.
    send: (frame) => {
      if (!connection.open) return false
      sent.push(frame)
      return true
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
