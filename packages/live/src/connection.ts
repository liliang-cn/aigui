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

/**
 * `Omit`, applied to each member of a union rather than to the union as a whole.
 *
 * A conditional type only distributes over a *naked type parameter*, which is why this needs the
 * generic indirection: writing `ClientFrame extends unknown ? … : never` directly would not
 * distribute, because `ClientFrame` there is a concrete alias rather than a parameter.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/**
 * A client frame with the version stripped, one union member at a time.
 *
 * Plain `Omit<ClientFrame, "v">` collapses the union to the keys every member shares, so `id` and
 * `action` vanish and passing a real action frame is a type error. That is the difference between
 * a signature describing the protocol and one describing only the parts every frame happens to
 * have in common.
 */
export type UnversionedClientFrame = DistributiveOmit<ClientFrame, "v">

export interface Connection {
  start(): void
  stop(): void
  send(frame: UnversionedClientFrame): boolean
  readonly state: ConnectionState
  /** Notified on every state transition. Returns an unsubscribe function. */
  subscribeState(listener: (state: ConnectionState) => void): () => void
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
  const stateListeners = new Set<(state: ConnectionState) => void>()

  function setState(next: ConnectionState): void {
    if (state === next) return
    state = next
    options.onState?.(next)
    // A listener throwing is its bug, not a reason to skip the others or corrupt the transition —
    // the same reasoning as ActionRuntime's `notify` (packages/core/src/actions.ts).
    for (const listener of stateListeners) {
      try {
        listener(next)
      } catch {
        // Subscribers are observers and cannot change connection semantics.
      }
    }
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

    // A real WebSocket closes asynchronously: `close()` returns before `onclose` fires, so a
    // message already queued for delivery can still dispatch in between. Every handler below
    // checks that `current` is still the live socket before touching any shared state, so a frame
    // (or open/close event) from a socket `stop()` already tore down cannot mutate `session`,
    // flip `fatal`, or reach the host.
    current.onopen = () => {
      if (current !== socket) return
      attempt = 0
      setState("open")
      current.send(encodeFrame({ t: "hello", ...(session ? { session } : {}), ...(options.token ? { token: options.token } : {}) }))
      heartbeatTimer = setInterval(beat, heartbeatMs)
    }

    current.onmessage = (event) => {
      if (current !== socket) return
      const frame = decodeServerFrame(event.data)
      if (!frame) return
      if (frame.t === "pong") {
        if (pongTimer !== undefined) clearTimeout(pongTimer)
        pongTimer = undefined
      }
      if (frame.t === "welcome") session = frame.session
      if (frame.t === "error" && frame.fatal) fatal = true
      options.onFrame?.(frame)
    }

    current.onclose = () => {
      if (current !== socket) return
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
      // A connection attempt is already in progress (or open) — a second call, e.g. from a React
      // effect double-invoke or a retry button, must not spin up a second socket and orphan the
      // first one's heartbeat interval.
      if (state === "connecting" || state === "open") return
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
    subscribeState(listener) {
      stateListeners.add(listener)
      return () => stateListeners.delete(listener)
    },
  }
}
