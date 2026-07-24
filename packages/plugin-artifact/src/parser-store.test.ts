import { describe, expect, it, vi } from "vitest"
import {
  ArtifactConflictError,
  ArtifactLimitError,
  ArtifactOperationConflictError,
  ArtifactSnapshotError,
  ArtifactStore,
  parseArtifactCreate,
  parseArtifactUpdate,
  serializeArtifactCreate,
  serializeArtifactUpdate,
} from "./index"

const create = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  operationId: "op-create",
  artifact: {
    id: "readme",
    title: "Read me",
    filename: "README.md",
    kind: "markdown",
    content: "# Hello",
  },
  ...overrides,
})

describe("artifact command parsers", () => {
  it("strictly parses create and update commands without requiring create revision", () => {
    expect(parseArtifactCreate(JSON.stringify(create()))).toEqual({ valid: true, data: create() })
    const update = { version: 1, operationId: "op-update", id: "readme", baseRevision: 0, content: "next" }
    expect(parseArtifactUpdate(JSON.stringify(update))).toEqual({ valid: true, data: update })
    expect(parseArtifactCreate(JSON.stringify(create({ revision: 0 }))).valid).toBe(false)
    expect(parseArtifactUpdate(JSON.stringify({ ...update, kind: "code" })).valid).toBe(false)
    expect(parseArtifactUpdate(JSON.stringify({ ...update, language: "ts" })).valid).toBe(true)
  })

  it("rejects malformed JSON, unsafe identifiers, filenames, dangerous keys, and oversized fields", () => {
    expect(parseArtifactCreate("not json").valid).toBe(false)
    expect(parseArtifactCreate(JSON.stringify(create({ operationId: "../bad" }))).valid).toBe(false)
    expect(parseArtifactCreate(JSON.stringify(create({ artifact: { ...create().artifact, filename: "../x" } }))).valid).toBe(false)
    expect(parseArtifactCreate('{"version":1,"operationId":"op","artifact":{"id":"x","title":"x","filename":"x","kind":"text","content":"x","__proto__":{}}}').valid).toBe(false)
    expect(parseArtifactCreate(JSON.stringify(create({ artifact: { ...create().artifact, title: "x".repeat(257) } }))).valid).toBe(false)
    expect(parseArtifactUpdate(JSON.stringify({ version: 1, operationId: "op", id: "x", baseRevision: -1, content: "x" })).valid).toBe(false)
  })

  it("serializes canonical valid fences", () => {
    const createFence = serializeArtifactCreate(create())
    const update = { version: 1 as const, operationId: "op-update", id: "readme", baseRevision: 0, content: "next" }
    expect(createFence.startsWith("```artifact-create\n")).toBe(true)
    expect(parseArtifactCreate(createFence.split("\n").slice(1, -1).join("\n")).valid).toBe(true)
    expect(parseArtifactUpdate(serializeArtifactUpdate(update).split("\n").slice(1, -1).join("\n"))).toEqual({ valid: true, data: update })
  })
})

describe("ArtifactStore", () => {
  it("creates immutable revision zero records and updates with exact revisions", () => {
    const store = new ArtifactStore()
    const receipt = store.create(create())
    expect(receipt.record.revision).toBe(0)
    expect(Object.isFrozen(receipt.record)).toBe(true)
    expect(() => store.update({ version: 1, operationId: "u1", id: "readme", baseRevision: 1, content: "bad" })).toThrow(ArtifactConflictError)
    const updated = store.update({ version: 1, operationId: "u2", id: "readme", baseRevision: 0, content: "next", title: "Next" })
    expect(updated.record).toMatchObject({ revision: 1, content: "next", title: "Next", kind: "markdown" })
  })

  it("is idempotent by operation receipt and rejects operation reuse with another command", () => {
    const store = new ArtifactStore()
    const first = store.create(create())
    expect(store.create(JSON.parse(JSON.stringify(create())))).toBe(first)
    expect(() => store.create(create({ artifact: { ...create().artifact, content: "different" } }))).toThrow(ArtifactOperationConflictError)
  })

  it("supports scoped and global subscriptions plus local delete and clear", () => {
    const store = new ArtifactStore()
    const one = vi.fn()
    const all = vi.fn()
    const stopOne = store.subscribe("readme", one)
    const stopAll = store.subscribeAll(all)
    store.create(create())
    store.update({ version: 1, operationId: "u", id: "readme", baseRevision: 0, content: "next" })
    store.delete("readme")
    expect(one).toHaveBeenCalledTimes(3)
    expect(all).toHaveBeenCalledTimes(3)
    stopOne(); stopOne(); stopAll()
    store.create(create({ operationId: "other", artifact: { ...create().artifact, id: "other" } }))
    store.clear()
    expect(store.list()).toEqual([])
  })

  it("isolates subscriber failures from committed mutations", () => {
    const store = new ArtifactStore()
    store.subscribeAll(() => { throw new Error("observer failed") })
    store.subscribe("readme", () => { throw new Error("observer failed") })
    expect(() => store.create(create())).not.toThrow()
    expect(store.get("readme")).toMatchObject({ revision: 0 })
  })

  it("enforces per-artifact, count, and total UTF-8 limits", () => {
    const store = new ArtifactStore({ maxArtifacts: 1, maxArtifactBytes: 4, maxTotalBytes: 4 })
    expect(() => store.create(create({ artifact: { ...create().artifact, content: "12345" } }))).toThrow(ArtifactLimitError)
    store.create(create({ artifact: { ...create().artifact, content: "1234" } }))
    expect(() => store.create(create({ operationId: "two", artifact: { ...create().artifact, id: "two", content: "" } }))).toThrow(ArtifactLimitError)
  })

  it("snapshots records and receipts and restores atomically", () => {
    const store = new ArtifactStore()
    const receipt = store.create(create())
    const snapshot = store.snapshot()
    store.clear()
    store.restore(snapshot)
    expect(store.get("readme")).toEqual(receipt.record)
    expect(store.create(create()).record).toEqual(receipt.record)
    const before = store.snapshot()
    const invalid = JSON.parse(JSON.stringify(snapshot))
    invalid.records[0].filename = "../bad"
    expect(() => store.restore(invalid)).toThrow(ArtifactSnapshotError)
    expect(store.snapshot()).toEqual(before)
    const forged = JSON.parse(JSON.stringify(snapshot))
    forged.receipts[0].receipt.record.content = "forged"
    expect(() => store.restore(forged)).toThrow(ArtifactSnapshotError)
    expect(store.snapshot()).toEqual(before)
  })

  it("captures a monotonic mutation epoch", () => {
    const store = new ArtifactStore()
    const before = store.captureMutationEpoch()
    store.create(create())
    expect(store.captureMutationEpoch()).toBeGreaterThan(before)
  })
})
