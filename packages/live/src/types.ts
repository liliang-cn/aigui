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
