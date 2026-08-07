import { describe, expect, it, vi } from "vitest"
import { cardChannel } from "./card-channel"
import { CardStore } from "./card-store"
import { CardRegistry } from "./card-registry"
import { StreamRouter } from "./stream-router"
import { Renderer } from "./renderer"
import type { ASTNode } from "./types"

async function* gen(...chunks: string[]) { for (const c of chunks) yield c }

/** A renderer plus the latest AST it produced, which is the only way to read one. */
function watched(): { renderer: Renderer; ast: () => ASTNode[] } {
  let latest: ASTNode[] = []
  const renderer = new Renderer({ onPatch: (_patches, nodes) => { latest = nodes } })
  return { renderer, ast: () => latest }
}

const errors = () => {
  const seen: unknown[] = []
  return { onError: (error: unknown) => seen.push(error), seen }
}

describe("cardChannel", () => {
  it("registers a card the stream announces", () => {
    const store = new CardStore()
    const { onError, seen } = errors()
    cardChannel(store, { onError })({ op: "register", id: "job-7", type: "task", data: { pct: 0 } })
    expect(store.get("job-7")?.data).toEqual({ pct: 0 })
    expect(seen).toEqual([])
  })

  it("merges and replaces an existing card", () => {
    const store = new CardStore()
    const sink = cardChannel(store)
    sink({ op: "register", id: "c", type: "task", data: { pct: 0, label: "search" } })
    sink({ op: "merge", cardId: "c", data: { pct: 40 } })
    expect(store.get("c")?.data).toEqual({ pct: 40, label: "search" })
    expect(store.get("c")?.revision).toBe(1)
    sink({ op: "replace", cardId: "c", data: { pct: 100 } })
    expect(store.get("c")?.data).toEqual({ pct: 100 })
  })

  it("applies a batch atomically", () => {
    const store = new CardStore()
    const sink = cardChannel(store)
    sink({ op: "register", id: "a", type: "t", data: { n: 0 } })
    sink({ op: "register", id: "b", type: "t", data: { n: 0 } })
    sink({ op: "batch", patches: [{ op: "merge", cardId: "a", data: { n: 1 } }, { op: "merge", cardId: "b", data: { n: 2 } }] })
    expect([store.get("a")?.data, store.get("b")?.data]).toEqual([{ n: 1 }, { n: 2 }])
  })

  it("leaves the store untouched when one patch in a batch is bad", () => {
    const store = new CardStore()
    const { onError, seen } = errors()
    const sink = cardChannel(store, { onError })
    sink({ op: "register", id: "a", type: "t", data: { n: 0 } })
    sink({ op: "batch", patches: [{ op: "merge", cardId: "a", data: { n: 1 } }, { op: "merge", cardId: "missing", data: {} }] })
    expect(store.get("a")?.data).toEqual({ n: 0 })
    expect(seen).toHaveLength(1)
  })

  it("parses a message that arrives as a JSON string", () => {
    const store = new CardStore()
    const sink = cardChannel(store)
    sink(JSON.stringify({ op: "register", id: "c", type: "t", data: { n: 1 } }))
    expect(store.get("c")?.data).toEqual({ n: 1 })
  })

  it("registering the same id twice keeps the card, so a resumed stream is idempotent", () => {
    const store = new CardStore()
    const { onError, seen } = errors()
    const sink = cardChannel(store, { onError })
    sink({ op: "register", id: "c", type: "t", data: { n: 1 } })
    sink({ op: "merge", cardId: "c", data: { n: 9 } })
    sink({ op: "register", id: "c", type: "t", data: { n: 1 } })
    expect(store.get("c")?.data).toEqual({ n: 9 })
    expect(seen).toEqual([])
  })

  describe("reports rather than throws", () => {
    const cases: Array<[string, unknown, RegExp]> = [
      ["a non-object", 42, /must be a JSON object/],
      ["an array", [{ op: "merge", cardId: "c", data: {} }], /must be a JSON object/],
      ["text that is not JSON", "not json", /not a JSON message/],
      ["an unknown op", { op: "delete", cardId: "c" }, /must be one of register, merge, replace, batch/],
      ["a merge with no cardId", { op: "merge", data: {} }, /needs a string cardId/],
      ["a batch with no patches", { op: "batch" }, /needs a patches array/],
      ["a register with no type", { op: "register", id: "c", data: {} }, /string id and type/],
      ["a patch for an unknown card", { op: "merge", cardId: "ghost", data: {} }, /was not found/],
    ]
    for (const [name, message, expected] of cases) {
      it(name, () => {
        const { onError, seen } = errors()
        expect(() => cardChannel(new CardStore(), { onError })(message)).not.toThrow()
        expect(seen).toHaveLength(1)
        expect((seen[0] as Error).message).toMatch(expected)
      })
    }
  })

  it("rejects a stale patch when the message carries a revision", () => {
    const store = new CardStore()
    const { onError, seen } = errors()
    const sink = cardChannel(store, { onError })
    sink({ op: "register", id: "c", type: "t", data: { n: 0 } })
    sink({ op: "merge", cardId: "c", data: { n: 1 } })
    // A frame written against revision 0 arriving after revision 1 landed.
    sink({ op: "merge", cardId: "c", data: { n: 2 }, revision: 0 })
    expect(store.get("c")?.data).toEqual({ n: 1 })
    expect((seen[0] as Error).name).toBe("CardRevisionConflictError")
  })

  it("refuses a card the registry does not validate", () => {
    const registry = new CardRegistry()
    registry.register({
      type: "task",
      description: "A unit of work",
      schema: { type: "object", properties: { pct: { type: "number" } }, required: ["pct"] },
    })
    const store = new CardStore({ registry })
    const { onError, seen } = errors()
    cardChannel(store, { onError })({ op: "register", id: "c", type: "task", data: { pct: "lots" } })
    expect(store.get("c")).toBeUndefined()
    expect((seen[0] as Error).name).toBe("CardValidationError")
  })

  it("falls back to console.error so a dropped card is never silent", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      cardChannel(new CardStore())({ op: "merge", cardId: "ghost", data: {} })
      expect(spy).toHaveBeenCalledOnce()
    } finally {
      spy.mockRestore()
    }
  })

  it("routes cards and content off one stream without either disturbing the other", async () => {
    const store = new CardStore()
    const { renderer, ast } = watched()
    const { onError, seen } = errors()
    await new StreamRouter()
      .channel("content", renderer)
      .on("cards", cardChannel(store, { onError }))
      .feed(gen(
        '{"ch":"content","delta":"# Report\\n"}\n',
        '{"ch":"cards","data":{"op":"register","id":"j","type":"task","data":{"pct":0}}}\n',
        '{"ch":"content","delta":"Working"}\n',
        '{"ch":"cards","data":{"op":"merge","cardId":"j","data":{"pct":60}}}\n',
      ))
    expect(store.get("j")?.data).toEqual({ pct: 60 })
    expect(ast()[0]).toMatchObject({ type: "heading" })
    expect(ast().at(-1)?.content).toContain("Working")
    expect(seen).toEqual([])
  })

  it("keeps the content channel alive when a card message fails", async () => {
    const store = new CardStore()
    const { renderer, ast } = watched()
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      await new StreamRouter()
        .channel("content", renderer)
        .on("cards", cardChannel(store))
        .feed(gen(
          '{"ch":"cards","data":{"op":"merge","cardId":"ghost","data":{}}}\n',
          '{"ch":"content","delta":"the answer continues"}\n',
        ))
      // The whole point: a bad frame on one channel must not truncate the answer on another.
      expect(ast().at(-1)?.content).toContain("the answer continues")
      expect(spy).toHaveBeenCalledOnce()
    } finally {
      spy.mockRestore()
    }
  })

  it("carries SSE named events as well as envelopes", async () => {
    const store = new CardStore()
    const { onError, seen } = errors()
    await new StreamRouter()
      .on("cards", cardChannel(store, { onError }))
      .feed(gen('event: cards\ndata: {"op":"register","id":"c","type":"t","data":{"n":1}}\n\n'))
    expect(store.get("c")?.data).toEqual({ n: 1 })
    expect(seen).toEqual([])
  })
})
