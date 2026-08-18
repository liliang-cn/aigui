import { PROTOCOL_VERSION, type ClientFrame, type ServerFrame } from "./types"

const TONES = new Set(["positive", "warning", "negative", "neutral"])

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isId(value: unknown): boolean {
  return typeof value === "string" && value.length > 0
}

function isSnapshot(value: unknown): boolean {
  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.cards)) return false
  const ids = new Set<string>()
  for (const card of value.cards) {
    if (!isObject(card) || !isId(card.id) || !isId(card.type)) return false
    if (!Number.isSafeInteger(card.revision) || (card.revision as number) < 0) return false
    // The protocol document says a duplicate id invalidates the whole snapshot, and
    // `CardStore.restore` throws on one. Catching it here turns what would be a runtime throw
    // into a conformance failure the server implementer sees while writing the server.
    if (ids.has(card.id as string)) return false
    ids.add(card.id as string)
  }
  return true
}

function isCardMessage(value: unknown): boolean {
  if (!isObject(value)) return false
  if (value.op === "register") return isId(value.id) && isId(value.type)
  if (value.op === "merge" || value.op === "replace") return isId(value.cardId)
  if (value.op === "batch") return Array.isArray(value.patches) && value.patches.every(isCardMessage)
  return false
}

function isOutcome(value: unknown): boolean {
  return isObject(value) && typeof value.tone === "string" && TONES.has(value.tone)
}

/**
 * Whether a conformant implementation accepts this frame.
 *
 * An unrecognised `t` is valid on purpose. A version 1 peer must survive a later version adding
 * frames, so "I do not know this" and "this is malformed" have to be different answers — the
 * first is ignored, the second is a protocol violation.
 */
export function isFrameValid(value: unknown, dir: "c2s" | "s2c"): boolean {
  if (!isObject(value)) return false
  if (typeof value.v !== "number") return false
  if (typeof value.t !== "string") return false

  if (dir === "c2s") {
    switch (value.t) {
      case "hello":
        return (value.session === undefined || isId(value.session)) && (value.token === undefined || typeof value.token === "string")
      case "action":
        return isId(value.id) && isObject(value.action) && isId(value.action.type)
      case "ping":
        return true
      default:
        return true
    }
  }

  switch (value.t) {
    case "welcome":
      return isId(value.session) && typeof value.resume === "boolean"
    case "sync":
      return isSnapshot(value.snapshot)
    case "cards":
      return Array.isArray(value.messages) && value.messages.every(isCardMessage)
    case "outcome":
      return isId(value.id) && isOutcome(value.outcome)
    case "error":
      return isId(value.code) && typeof value.message === "string" && typeof value.fatal === "boolean"
    case "pong":
      return true
    default:
      return true
  }
}

/** Parse a socket payload. Returns undefined for anything a conformant peer would reject. */
export function decodeServerFrame(payload: unknown): ServerFrame | undefined {
  if (typeof payload !== "string") return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return undefined
  }
  return isFrameValid(parsed, "s2c") ? (parsed as ServerFrame) : undefined
}

/** Serialise a client frame, stamping the version so no call site has to remember it. */
export function encodeFrame(frame: Omit<ClientFrame, "v">): string {
  return JSON.stringify({ v: PROTOCOL_VERSION, ...frame })
}
