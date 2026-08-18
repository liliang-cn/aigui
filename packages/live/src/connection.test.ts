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

  /**
   * `docs/live-protocol.md`: "a client may name any session, including one it was never given" —
   * how a dashboard both ends already agree on is addressed on a *first* connection, not just a
   * reconnect. Before `options.session` existed, nothing in this package's public surface could
   * express that; a caller could only ever get the session the server happened to assign.
   */
  it("names the session it was given on the very first hello", () => {
    const conn = createConnection({ url: "ws://x", socketFactory: factory, session: "dash-1" })
    conn.start()
    sockets[0].fire("open")
    expect(JSON.parse(sockets[0].sent[0])).toEqual({ v: 1, t: "hello", session: "dash-1" })
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

  /**
   * A second `start()` while a connection attempt is already under way — a React effect
   * double-invoke, or a retry button clicked twice — must not spin up a second socket. Two
   * sockets means `stop()` only closes the second one, and if both reach `onopen`, both install a
   * `setInterval` and the earlier one becomes uncancellable.
   */
  it("start() twice creates only one socket", () => {
    const conn = createConnection({ url: "ws://x", socketFactory: factory })
    conn.start()
    conn.start()
    expect(sockets).toHaveLength(1)
    conn.stop()
  })

  it("start() twice, then stop(), leaves nothing running", () => {
    const conn = createConnection({ url: "ws://x", socketFactory: factory })
    conn.start()
    conn.start()
    sockets[0].fire("open")
    conn.stop()
    // If the second start() had created a second socket, stop() would only have closed that one
    // and left the first socket's heartbeat interval running forever.
    vi.advanceTimersByTime(120_000)
    expect(sockets).toHaveLength(1)
    expect(sockets[0].sent.filter((frame) => JSON.parse(frame).t === "ping")).toHaveLength(0)
  })

  it("start() after a genuine stop() is not treated as a duplicate", () => {
    const conn = createConnection({ url: "ws://x", socketFactory: factory })
    conn.start()
    sockets[0].fire("open")
    conn.stop()
    conn.start()
    expect(sockets).toHaveLength(2)
    conn.stop()
  })

  /**
   * A real WebSocket closes asynchronously — `close()` returns before `onclose` fires — so a
   * message already queued for delivery can dispatch in between. `stop()` must guard against that,
   * or a stray frame from a socket the host believes is gone still reaches `onFrame`.
   */
  it("ignores a message that arrives after stop()", () => {
    const onFrame = vi.fn()
    const conn = createConnection({ url: "ws://x", socketFactory: factory, onFrame })
    conn.start()
    sockets[0].fire("open")
    conn.stop()
    // Simulates the queued-message race: the underlying socket delivers a message even though
    // `close()` has already been called and the connection considers itself stopped.
    sockets[0].fire("message", JSON.stringify({ v: 1, t: "pong" }))
    expect(onFrame).not.toHaveBeenCalled()
  })

  it("does not go fatal from a message that arrives after stop()", () => {
    const conn = createConnection({ url: "ws://x", socketFactory: factory })
    conn.start()
    sockets[0].fire("open")
    conn.stop()
    // A `fatal` error frame the host tore the connection down itself should not be able to poison
    // it — a real socket delivering this after `close()` but before `onclose` is exactly the race
    // `stop()` has to guard against.
    sockets[0].fire("message", JSON.stringify({ v: 1, t: "error", code: "boom", message: "no", fatal: true }))
    conn.start()
    // If the stray frame had set the internal `fatal` flag, this start() would be a no-op and no
    // second socket would appear.
    expect(sockets).toHaveLength(2)
    conn.stop()
  })

  /**
   * The package's headline guarantee — "actions fail immediately while disconnected instead of
   * queuing" — is implemented entirely by this guard. Before this test, `send()` was never called
   * anywhere in this file, so removing `state !== "open"` from it left all 68 tests green.
   */
  it("send() refuses to write to a socket that is not yet open", () => {
    const conn = createConnection({ url: "ws://x", socketFactory: factory })
    conn.start()
    // A socket exists (assigned in `open()`) but `onopen` has not fired, so state is "connecting".
    expect(sockets).toHaveLength(1)
    expect(conn.state).toBe("connecting")
    const result = conn.send({ t: "ping" })
    expect(result).toBe(false)
    expect(sockets[0].sent).toHaveLength(0)
    conn.stop()
  })
})
