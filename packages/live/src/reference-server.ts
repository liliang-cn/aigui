import { randomUUID } from "node:crypto"
import { WebSocketServer, type WebSocket } from "ws"
import type { CardMessage, CardSnapshot } from "@ai-gui/core"
import { isFrameValid } from "./frames"

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

type ActionOutcome = { tone: string; message?: string }

export interface ReferenceServer {
  port: number
  /** Push messages to every connection watching a session. */
  push(sessionId: string, messages: CardMessage[]): void
  /**
   * Answer the next action of this type with this outcome.
   *
   * The handler may return a promise. A real server does asynchronous work — a database read, a
   * call to another service — and can finish that work in a different order than the requests
   * arrived in. A handler that can only answer synchronously can never produce that reordering,
   * which means a client that mis-correlates outcomes (resolving whatever is pending first,
   * rather than matching on `frame.id`) would pass every test run against it.
   */
  onAction(type: string, handler: (params: unknown) => ActionOutcome | Promise<ActionOutcome>): void
  sessions: Map<string, ReferenceSession>
  close(): Promise<void>
}

export async function startReferenceServer(): Promise<ReferenceServer> {
  const wss = new WebSocketServer({ port: 0 })
  const sessions = new Map<string, ReferenceSession>()
  const handlers = new Map<string, (params: unknown) => ActionOutcome | Promise<ActionOutcome>>()

  function snapshotOf(session: ReferenceSession): CardSnapshot {
    return { version: 1, cards: [...session.cards.values()] }
  }

  wss.on("connection", (socket) => {
    let sessionId: string | undefined

    socket.on("message", async (raw) => {
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

      // A field check hand-rolled here can drift from what `frames.ts` defines as valid — which is
      // exactly how `{"v":1,"t":"action","id":"c1"}` with no `action` field used to reach
      // `frame.action.type` and throw. Consulting the same validator the client uses means the two
      // can no longer silently disagree, and a malformed frame is ignored rather than crashing the
      // handler.
      if (!isFrameValid(frame, "c2s")) return

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
          ? await handler(action.params)
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
