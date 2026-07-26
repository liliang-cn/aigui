import { describe, expect, it, vi } from "vitest"
import { CardRegistry } from "./card-registry"
import {
  CardNotFoundError,
  CardRevisionConflictError,
  CardSnapshotError,
  CardStore,
  CardStoreError,
  CardTypeConflictError,
  CardValidationError,
  isCardPatchResult,
} from "./card-store"

function registry(): CardRegistry {
  const registry = new CardRegistry()
  registry.register({
    type: "counter",
    description: "counter",
    schema: {
      type: "object",
      required: ["count", "nested", "items"],
      properties: {
        count: { type: "integer", minimum: 0 },
        nested: { type: "object" },
        items: { type: "array" },
      },
    },
  })
  registry.register({ type: "other", description: "other", schema: { type: "object" } })
  return registry
}

const initial = { count: 1, nested: { left: true, deep: { a: 1 } }, items: [1, 2] }

describe("CardStore", () => {
  it("registers once, preserves same-type data, and rejects a type conflict", () => {
    const store = new CardStore({ registry: registry() })
    expect(store.register({ id: "one", type: "counter", data: initial })).toMatchObject({ revision: 0, data: initial })
    expect(store.register({ id: "one", type: "counter", data: { ...initial, count: 99 } })).toMatchObject({ data: initial })
    expect(() => store.register({ id: "one", type: "other", data: {} })).toThrow(CardTypeConflictError)
  })

  it("rejects register and restore records whose data id conflicts with the record id", () => {
    const store = new CardStore({ registry: registry() })

    expect(() => store.register({ id: "one", type: "counter", data: { ...initial, id: "two" } }))
      .toThrow(CardStoreError)
    expect(store.get("one")).toBeUndefined()

    store.register({ id: "one", type: "counter", data: initial })
    expect(() => store.restore({ version: 1, cards: [
      { id: "one", type: "counter", data: { ...initial, id: "two" }, revision: 3 },
    ] })).toThrow(CardSnapshotError)
    expect(store.get("one")).toMatchObject({ revision: 0, data: initial })
  })

  it("applies recursive object merge, replaces arrays and null, and supports replace", () => {
    const store = new CardStore({ registry: registry() })
    store.register({ id: "one", type: "counter", data: initial })

    const merged = store.apply({
      op: "merge",
      cardId: "one",
      data: { nested: { deep: { b: 2 }, left: null }, items: [3] },
    })
    expect(merged).toMatchObject({
      revision: 1,
      data: { count: 1, nested: { left: null, deep: { a: 1, b: 2 } }, items: [3] },
    })
    const replaced = store.apply({ op: "replace", cardId: "one", revision: 1, data: { count: 4, nested: {}, items: [] } })
    expect(replaced).toMatchObject({ revision: 2, data: { count: 4, nested: {}, items: [] } })
  })

  it("rejects missing cards, revision conflicts, schema failures, id changes, and dangerous keys", () => {
    const store = new CardStore({ registry: registry() })
    store.register({ id: "one", type: "counter", data: initial })
    expect(() => store.apply({ op: "merge", cardId: "missing", data: {} })).toThrow(CardNotFoundError)
    expect(() => store.apply({ op: "merge", cardId: "one", revision: 9, data: {} })).toThrow(CardRevisionConflictError)
    expect(() => store.apply({ op: "merge", cardId: "one", data: { count: -1 } })).toThrow(CardValidationError)
    expect(() => store.apply({ op: "merge", cardId: "one", data: { id: "two" } })).toThrow(/id/i)
    expect(() => store.apply({ op: "merge", cardId: "one", data: JSON.parse('{"__proto__":{"polluted":true}}') })).toThrow(/dangerous/i)
    expect(store.get("one")).toMatchObject({ revision: 0, data: initial })
  })

  it("applies batches atomically and enforces batch limits", () => {
    const store = new CardStore({ registry: registry() })
    store.register({ id: "one", type: "counter", data: initial })
    store.register({ id: "two", type: "counter", data: initial })

    expect(() => store.applyAll([
      { op: "merge", cardId: "one", data: { count: 2 } },
      { op: "merge", cardId: "two", data: { count: -1 } },
    ])).toThrow(CardValidationError)
    expect(store.get("one")?.revision).toBe(0)
    expect(store.get("two")?.revision).toBe(0)

    store.applyAll([
      { op: "merge", cardId: "one", data: { count: 2 } },
      { op: "merge", cardId: "two", data: { count: 3 } },
    ])
    expect(store.get("one")).toMatchObject({ revision: 1, data: expect.objectContaining({ count: 2 }) })
    expect(store.get("two")).toMatchObject({ revision: 1, data: expect.objectContaining({ count: 3 }) })
    expect(() => store.applyAll(Array.from({ length: 101 }, () => ({ op: "merge" as const, cardId: "one", data: {} })))).toThrow(/100/)
  })

  it("tracks data mutations with a strictly increasing store epoch", () => {
    const store = new CardStore({ registry: registry() })
    const initialEpoch = store.captureMutationEpoch()

    store.register({ id: "one", type: "counter", data: initial })
    const registeredEpoch = store.captureMutationEpoch()
    expect(registeredEpoch).toBeGreaterThan(initialEpoch)

    store.beginAction("one", "action:1")
    store.succeedAction("one", "action:1")
    expect(store.captureMutationEpoch()).toBe(registeredEpoch)

    store.apply({ op: "merge", cardId: "one", data: { count: 2 } })
    expect(store.captureMutationEpoch()).toBeGreaterThan(registeredEpoch)
  })

  it("rejects an action result after its target is deleted and re-registered at the same revision", () => {
    const store = new CardStore({ registry: registry() })
    store.register({ id: "one", type: "counter", data: initial })
    const startedEpoch = store.captureMutationEpoch()

    store.delete("one")
    store.register({ id: "one", type: "counter", data: initial })

    expect(() => store.applyActionResult(
      { op: "merge", cardId: "one", data: { count: 2 } },
      startedEpoch,
    )).toThrow(CardRevisionConflictError)
    expect(store.get("one")).toMatchObject({ revision: 0, data: initial })
  })

  it("rejects action results after restore even when revisions are unchanged or rolled back", () => {
    const store = new CardStore({ registry: registry() })
    store.register({ id: "one", type: "counter", data: initial })
    store.apply({ op: "merge", cardId: "one", data: { count: 2 } })

    const sameRevisionEpoch = store.captureMutationEpoch()
    store.restore({ version: 1, cards: [{ id: "one", type: "counter", data: initial, revision: 1 }] })
    expect(() => store.applyActionResult(
      { op: "merge", cardId: "one", data: { count: 3 } },
      sameRevisionEpoch,
    )).toThrow(CardRevisionConflictError)

    const rolledBackEpoch = store.captureMutationEpoch()
    store.restore({ version: 1, cards: [{ id: "one", type: "counter", data: initial, revision: 0 }] })
    expect(() => store.applyActionResult(
      { op: "merge", cardId: "one", data: { count: 4 } },
      rolledBackEpoch,
    )).toThrow(CardRevisionConflictError)
    expect(store.get("one")).toMatchObject({ revision: 0, data: initial })
  })

  it("snapshots through JSON and restores atomically with idle actions and update/delete notifications", () => {
    const store = new CardStore({ registry: registry() })
    store.register({ id: "one", type: "counter", data: initial })
    store.register({ id: "gone", type: "other", data: {} })
    store.apply({ op: "merge", cardId: "one", data: { count: 2 } })
    store.beginAction("one", "action:1")
    const snapshot = JSON.parse(JSON.stringify(store.snapshot()))
    expect(snapshot).toEqual({ version: 1, cards: [
      { id: "one", type: "counter", data: { ...initial, count: 2 }, revision: 1 },
      { id: "gone", type: "other", data: {}, revision: 0 },
    ] })

    const one = vi.fn()
    const gone = vi.fn()
    store.subscribe("one", one)
    store.subscribe("gone", gone)
    store.restore({ version: 1, cards: [{ id: "one", type: "counter", data: initial, revision: 7 }] })
    expect(store.get("one")).toMatchObject({ revision: 7, action: { status: "idle" } })
    expect(store.get("gone")).toBeUndefined()
    expect(one).toHaveBeenCalledWith(expect.objectContaining({ id: "one", revision: 7 }))
    expect(gone).toHaveBeenCalledWith(undefined)

    expect(() => store.restore({ version: 1, cards: [
      { id: "one", type: "counter", data: initial, revision: 0 },
      { id: "one", type: "counter", data: initial, revision: 0 },
    ] })).toThrow(/duplicate/i)
    expect(store.get("one")?.revision).toBe(7)
  })

  it("isolates subscribers and supports delete and clear", () => {
    const store = new CardStore({ registry: registry() })
    store.register({ id: "one", type: "counter", data: initial })
    store.register({ id: "two", type: "counter", data: initial })
    const all = vi.fn()
    store.subscribe("one", () => { throw new Error("observer") })
    store.subscribeAll(all)
    expect(() => store.delete("one")).not.toThrow()
    expect(store.list().map((card) => card.id)).toEqual(["two"])
    store.clear()
    expect(store.list()).toEqual([])
    expect(all).toHaveBeenCalled()
  })

  it("recognizes only explicit patch and batch results", () => {
    expect(isCardPatchResult({ op: "merge", cardId: "one", data: {} })).toBe(true)
    expect(isCardPatchResult({ op: "replace", cardId: "one", data: {} })).toBe(true)
    expect(isCardPatchResult({ op: "batch", patches: [] })).toBe(true)
    expect(isCardPatchResult({ cardId: "one", data: {} })).toBe(false)
    expect(isCardPatchResult({ op: "merge", data: {} })).toBe(false)
  })

  it("cancels only the current card action back to idle", () => {
    const store = new CardStore({ registry: registry() })
    store.register({ id: "one", type: "counter", data: initial })
    store.beginAction("one", "action:1")

    expect(store.cancelAction("one", "stale")).toBe(false)
    expect(store.get("one")?.action).toEqual({ status: "loading", actionId: "action:1" })
    expect(store.cancelAction("one", "action:1")).toBe(true)
    expect(store.get("one")?.action).toEqual({ status: "idle" })
  })
})

describe("CardStore outcomes", () => {
  it("carries the verdict a handler reported onto the card it acted on", () => {
    const registry = new CardRegistry()
    registry.register({ type: "quiz", description: "q", render: () => null })
    const store = new CardStore({ registry })
    store.register({ id: "q1", type: "quiz", data: { id: "q1" } })
    store.beginAction("q1", "a1")

    store.succeedAction("q1", "a1", { submitted: true, outcome: { tone: "warning", message: "再看极限的定义" } })

    // Submitting a wrong answer succeeds, so the status stays success and the verdict rides beside
    // it — folding it into "error" would read as a failed request.
    expect(store.get("q1")?.action).toEqual({
      status: "success",
      actionId: "a1",
      outcome: { tone: "warning", message: "再看极限的定义" },
    })
  })

  it("leaves the state untouched when the handler had no verdict to give", () => {
    const registry = new CardRegistry()
    registry.register({ type: "quiz", description: "q", render: () => null })
    const store = new CardStore({ registry })
    store.register({ id: "q1", type: "quiz", data: { id: "q1" } })
    store.beginAction("q1", "a1")

    store.succeedAction("q1", "a1", "ok")

    expect(store.get("q1")?.action).toEqual({ status: "success", actionId: "a1" })
  })
})
