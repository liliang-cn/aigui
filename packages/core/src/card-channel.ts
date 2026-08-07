import { isCardPatchResult, type CardPatch, type CardPatchBatch, type CardStore } from "./card-store"

/**
 * A message a stream may send on a card channel.
 *
 * `register` first, then any number of patches against that id. Deletion is deliberately not here:
 * a card the reader is looking at, or has already acted on, should not vanish because a late frame
 * said so. A host that wants it calls `store.delete` from its own handler, where it can decide.
 */
export type CardMessage =
  | { op: "register"; id: string; type: string; data: unknown }
  | CardPatch
  | CardPatchBatch

export interface CardChannelOptions {
  /**
   * Where a message that could not be applied goes.
   *
   * This is the reason the adapter exists rather than being three lines at the call site. The
   * handler runs inside `StreamRouter.feed`, one long await over the whole response — a throw here
   * does not just drop the card, it kills the content channel with it and the answer stops
   * mid-sentence. So every failure is caught, and reported here instead.
   *
   * Left unset, failures go to `console.error`: a swallowed one looks exactly like a card that the
   * model never sent, which is the hardest version of this bug to find.
   */
  onError?: (error: unknown, message: unknown) => void
}

const OPS = "register, merge, replace, batch"

/**
 * Apply card messages arriving on a stream channel to a `CardStore`.
 *
 * ```ts
 * new StreamRouter()
 *   .channel("content", renderer)
 *   .on("cards", cardChannel(store))
 * ```
 *
 * This is the parallel half of the design. The content channel is one append-only buffer with a
 * single writer, because markdown block boundaries cannot survive two sources interleaving into
 * them. Cards are addressed by id instead, so anything on the wire — a background job, a tool that
 * finished late, a second model — can update one without touching the text, in any order, as many
 * times as it likes.
 *
 * Ordering is the store's contract, not this adapter's: a patch carrying `revision` is an
 * optimistic lock and a stale one is rejected through `onError`; a patch without one is
 * last-write-wins. Send `revision` when a late frame overwriting a newer state would be wrong.
 *
 * A card channel carries whole messages, not text deltas — one JSON object per frame.
 */
export function cardChannel(store: CardStore, options: CardChannelOptions = {}): (value: unknown) => void {
  const report = (error: unknown, message: unknown): void => {
    if (options.onError) options.onError(error, message)
    else console.error("[aigui] card channel:", error)
  }

  return (value: unknown): void => {
    let message = value
    // A router delta hands over a raw string; so does an SSE payload that did not parse as JSON.
    if (typeof message === "string") {
      try {
        message = JSON.parse(message)
      } catch {
        report(new TypeError("Card channel received text that is not a JSON message"), value)
        return
      }
    }
    if (typeof message !== "object" || message === null || Array.isArray(message)) {
      report(new TypeError("A card message must be a JSON object"), value)
      return
    }
    const op = (message as { op?: unknown }).op
    try {
      if (op === "register") {
        const { id, type, data } = message as { id: unknown; type: unknown; data: unknown }
        if (typeof id !== "string" || typeof type !== "string") {
          report(new TypeError("A register message needs a string id and type"), value)
          return
        }
        store.register({ id, type, data })
        return
      }
      // Delegated rather than re-checked: the store owns what a valid patch is, and a second
      // opinion here would drift from it.
      if (isCardPatchResult(message)) {
        if (message.op === "batch") store.applyAll(message.patches)
        else store.apply(message)
        return
      }
      // A recognised op that did not validate is a different mistake from an unknown one, and
      // "op must be one of merge, replace…" sent to someone who wrote `merge` reads as nonsense.
      if (op === "merge" || op === "replace") {
        report(new TypeError(`A ${op} message needs a string cardId and a data field`), value)
        return
      }
      if (op === "batch") {
        report(new TypeError("A batch message needs a patches array of merge or replace patches"), value)
        return
      }
      report(new TypeError(`Card message op must be one of ${OPS}, not ${JSON.stringify(op)}`), value)
    } catch (error) {
      report(error, value)
    }
  }
}
