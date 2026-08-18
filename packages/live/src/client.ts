import { cardChannel, type ActionOutcome, type CardStore } from "@ai-gui/core"
import type { Connection } from "./connection"
import type { ServerFrame } from "./types"

export interface LiveActionResult {
  outcome: ActionOutcome
}

export interface LiveClientOptions {
  store: CardStore
  connection: Connection
  /** How the client subscribes to frames. Injected so a fake connection can drive it in tests. */
  bindFrames: (handler: (frame: ServerFrame) => void) => void
  onError?: (error: unknown, detail: unknown) => void
}

export interface LiveClient {
  sendAction(action: { type: string; params?: unknown }): Promise<LiveActionResult>
  /** Called by the host when the socket drops, so in-flight actions stop hanging. */
  handleDisconnect(): void
}

const DISCONNECTED: LiveActionResult = {
  outcome: { tone: "negative", message: "Not connected" },
}

export function createLiveClient(options: LiveClientOptions): LiveClient {
  const applyCardMessage = cardChannel(options.store, {
    onError: (error, message) => options.onError?.(error, message),
  })
  const pending = new Map<string, (result: LiveActionResult) => void>()
  let counter = 0

  options.bindFrames((frame) => {
    switch (frame.t) {
      case "sync":
        // `restore` replaces rather than merges, so a card the server dropped while this client
        // was away actually disappears. That is the reason sync carries a whole snapshot.
        try {
          options.store.restore(frame.snapshot)
        } catch (error) {
          options.onError?.(error, frame)
        }
        return
      case "cards":
        for (const message of frame.messages) applyCardMessage(message)
        return
      case "outcome": {
        const resolve = pending.get(frame.id)
        if (!resolve) return
        pending.delete(frame.id)
        resolve({ outcome: frame.outcome })
        return
      }
      default:
        // welcome, error, pong and anything a later version adds are the connection's business.
        return
    }
  })

  return {
    sendAction(action) {
      const id = `c${++counter}`
      return new Promise<LiveActionResult>((resolve) => {
        // `send` reports whether the frame reached the socket, and refuses to touch a closed one.
        // Trusting that contract keeps the check in one place; repeating it here would mean every
        // future caller had to remember to as well.
        if (!options.connection.send({ t: "action", id, action })) {
          resolve(DISCONNECTED)
          return
        }
        pending.set(id, resolve)
      })
    },
    handleDisconnect() {
      for (const [, resolve] of pending) resolve(DISCONNECTED)
      pending.clear()
    },
  }
}
