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
