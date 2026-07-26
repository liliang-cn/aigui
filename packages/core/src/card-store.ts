import { actionOutcome, type ActionOutcome } from "./action-outcome"
import type { CardRegistry } from "./card-registry"
import { DebugEmitter } from "./debug-events"
import type { DebugEventListener, DebugOptions } from "./debug-events"

export const CARD_ID_MAX_LENGTH = 256
export const CARD_JSON_MAX_DEPTH = 32
export const CARD_JSON_MAX_NODES = 10_000
export const CARD_PATCH_BATCH_MAX_SIZE = 100

export type CardAction =
  | { status: "idle" }
  | { status: "loading"; actionId: string }
  /**
   * The dispatch ran. `outcome` carries how it turned out, when the handler judged it — a student
   * answering wrong submits successfully, so the verdict cannot live in the status.
   */
  | { status: "success"; actionId: string; outcome?: ActionOutcome }
  | { status: "error"; actionId: string; error: CardActionError }

export interface CardActionError {
  name: string
  message: string
}

export interface CardRecord {
  readonly id: string
  readonly type: string
  readonly data: unknown
  readonly revision: number
  readonly action: CardAction
}

export interface CardPatch {
  op: "merge" | "replace"
  cardId: string
  data: unknown
  revision?: number
}

export interface CardPatchBatch {
  op: "batch"
  patches: CardPatch[]
}

export type CardPatchResult = CardPatch | CardPatchBatch

export interface CardSnapshot {
  version: 1
  cards: Array<Pick<CardRecord, "id" | "type" | "data" | "revision">>
}

export interface CardStoreOptions extends DebugOptions {
  registry?: CardRegistry
}

export type CardListener = (card: CardRecord | undefined) => void
export type CardStoreListener = (cards: readonly CardRecord[]) => void

export class CardStore {
  readonly debugSource = "card-store" as const
  private readonly registry?: CardRegistry
  private cards = new Map<string, CardRecord>()
  private lastMutationEpoch = new Map<string, number>()
  private mutationEpoch = 0
  private readonly listeners = new Map<string, Set<CardListener>>()
  private readonly allListeners = new Set<CardStoreListener>()
  private readonly debug: DebugEmitter

  constructor(options: CardStoreOptions = {}) {
    this.registry = options.registry
    this.debug = new DebugEmitter(this.debugSource, options)
  }

  register(input: { id: string; type: string; data: unknown }): CardRecord {
    validateCardId(input.id)
    validateCardType(input.type)
    assertRecordId(input.id, input.data)
    const existing = this.cards.get(input.id)
    if (existing) {
      if (existing.type !== input.type) throw new CardTypeConflictError(input.id, existing.type, input.type)
      return existing
    }
    const data = cloneJSON(input.data)
    this.assertValid(input.type, data)
    const record = makeRecord(input.id, input.type, data, 0, { status: "idle" })
    this.cards.set(input.id, record)
    this.lastMutationEpoch.set(input.id, this.nextMutationEpoch())
    this.notify(input.id)
    return record
  }

  get(id: string): CardRecord | undefined {
    return this.cards.get(id)
  }

  list(): CardRecord[] {
    return [...this.cards.values()]
  }

  subscribe(id: string, listener: CardListener): () => void {
    let listeners = this.listeners.get(id)
    if (!listeners) {
      listeners = new Set()
      this.listeners.set(id, listeners)
    }
    listeners.add(listener)
    return () => {
      listeners?.delete(listener)
      if (listeners?.size === 0) this.listeners.delete(id)
    }
  }

  subscribeAll(listener: CardStoreListener): () => void {
    this.allListeners.add(listener)
    return () => this.allListeners.delete(listener)
  }

  subscribeDebug(listener: DebugEventListener): () => void {
    return this.debug.subscribe(listener)
  }

  apply(patch: CardPatch): CardRecord {
    const next = this.preparePatch(this.cards, patch)
    this.cards.set(next.id, next)
    this.lastMutationEpoch.set(next.id, this.nextMutationEpoch())
    this.notify(next.id)
    if (this.debug.active) this.debug.emit("card-store-patch", { patch, cards: this.list() })
    return next
  }

  applyAll(patches: readonly CardPatch[]): CardRecord[] {
    if (patches.length > CARD_PATCH_BATCH_MAX_SIZE) {
      throw new CardLimitError(`Card patch batches cannot exceed ${CARD_PATCH_BATCH_MAX_SIZE} operations`)
    }
    const nextCards = new Map(this.cards)
    const changed = new Map<string, CardRecord>()
    for (const patch of patches) {
      const next = this.preparePatch(nextCards, patch)
      nextCards.set(next.id, next)
      changed.set(next.id, next)
    }
    this.cards = nextCards
    for (const id of changed.keys()) this.lastMutationEpoch.set(id, this.nextMutationEpoch())
    for (const id of changed.keys()) this.notifyOne(id)
    if (changed.size) this.notifyAll()
    if (changed.size && this.debug.active) {
      const cards = this.list()
      this.debug.emit("card-store-change", { cardIds: [...changed.keys()], cards })
      this.debug.emit("card-store-patch", { patch: { op: "batch", patches }, cards })
    }
    return [...changed.values()]
  }

  delete(id: string): boolean {
    if (!this.cards.delete(id)) return false
    this.lastMutationEpoch.delete(id)
    this.nextMutationEpoch()
    this.notify(id)
    return true
  }

  clear(): void {
    if (this.cards.size === 0) return
    const ids = [...this.cards.keys()]
    this.cards.clear()
    this.lastMutationEpoch.clear()
    this.nextMutationEpoch()
    for (const id of ids) this.notifyOne(id)
    this.notifyAll()
    if (this.debug.active) this.debug.emit("card-store-change", { operation: "clear", cardIds: ids, cards: [] })
  }

  snapshot(): CardSnapshot {
    return {
      version: 1,
      cards: this.list().map(({ id, type, data, revision }) => ({ id, type, data: cloneJSON(data), revision })),
    }
  }

  restore(snapshot: CardSnapshot): void {
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.cards)) {
      throw new CardSnapshotError("Unsupported card snapshot")
    }
    const restored = new Map<string, CardRecord>()
    for (const input of snapshot.cards) {
      if (!input || typeof input !== "object") throw new CardSnapshotError("Invalid card snapshot record")
      validateCardId(input.id)
      validateCardType(input.type)
      if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new CardSnapshotError(`Invalid revision for card "${input.id}"`)
      if (restored.has(input.id)) throw new CardSnapshotError(`Duplicate card id "${input.id}" in snapshot`)
      const data = cloneJSON(input.data)
      try {
        assertRecordId(input.id, data)
      } catch (cause) {
        throw new CardSnapshotError(`Card snapshot data id does not match record id "${input.id}"`, { cause })
      }
      this.assertValid(input.type, data)
      restored.set(input.id, makeRecord(input.id, input.type, data, input.revision, { status: "idle" }))
    }
    const ids = new Set([...this.cards.keys(), ...restored.keys()])
    this.cards = restored
    this.lastMutationEpoch = new Map([...restored.keys()].map((id) => [id, this.nextMutationEpoch()]))
    if (restored.size === 0 && ids.size > 0) this.nextMutationEpoch()
    for (const id of ids) this.notifyOne(id)
    if (ids.size) this.notifyAll()
    if (ids.size && this.debug.active) this.debug.emit("card-store-change", { operation: "restore", cardIds: [...ids], cards: this.list() })
  }

  beginAction(id: string, actionId: string): boolean {
    return this.setAction(id, actionId, { status: "loading", actionId }, true)
  }

  succeedAction(id: string, actionId: string, result?: unknown): boolean {
    const outcome = actionOutcome(result)
    return this.setAction(id, actionId, outcome ? { status: "success", actionId, outcome } : { status: "success", actionId })
  }

  failAction(id: string, actionId: string, error: unknown): boolean {
    return this.setAction(id, actionId, { status: "error", actionId, error: normalizeCardActionError(error) })
  }

  cancelAction(id: string, actionId: string): boolean {
    return this.setAction(id, actionId, { status: "idle" })
  }

  isActionCurrent(id: string, actionId: string): boolean {
    const action = this.cards.get(id)?.action
    return action?.status === "loading" && action.actionId === actionId
  }

  revisions(): ReadonlyMap<string, number> {
    return new Map([...this.cards].map(([id, card]) => [id, card.revision]))
  }

  captureMutationEpoch(): number {
    return this.mutationEpoch
  }

  applyActionResult(result: CardPatchResult, startedEpoch: number): CardRecord[] {
    const patches = result.op === "batch" ? result.patches : [result]
    if (patches.length > CARD_PATCH_BATCH_MAX_SIZE) {
      throw new CardLimitError(`Card patch batches cannot exceed ${CARD_PATCH_BATCH_MAX_SIZE} operations`)
    }
    for (const cardId of new Set(patches.map((patch) => patch.cardId))) {
      const current = this.cards.get(cardId)
      if (!current) throw new CardNotFoundError(cardId)
      const lastMutationEpoch = this.lastMutationEpoch.get(cardId)
      if (lastMutationEpoch === undefined || lastMutationEpoch > startedEpoch) {
        throw new CardRevisionConflictError(cardId, startedEpoch, lastMutationEpoch ?? this.mutationEpoch)
      }
    }
    return result.op === "batch" ? this.applyAll(result.patches) : [this.apply(result)]
  }

  private preparePatch(cards: Map<string, CardRecord>, patch: CardPatch): CardRecord {
    assertPatch(patch)
    const current = cards.get(patch.cardId)
    if (!current) throw new CardNotFoundError(patch.cardId)
    if (patch.revision !== undefined && patch.revision !== current.revision) {
      throw new CardRevisionConflictError(patch.cardId, patch.revision, current.revision)
    }
    const patchData = cloneJSON(patch.data)
    assertPatchId(current.id, patchData)
    const data = patch.op === "replace" ? patchData : mergeJSON(current.data, patchData)
    assertStableId(current.id, current.data, data)
    this.assertValid(current.type, data)
    return makeRecord(current.id, current.type, data, current.revision + 1, current.action)
  }

  private assertValid(type: string, data: unknown): void {
    if (this.registry && !this.registry.validate(type, data)) throw new CardValidationError(type)
  }

  private setAction(id: string, actionId: string, action: CardAction, start = false): boolean {
    const current = this.cards.get(id)
    if (!current) throw new CardNotFoundError(id)
    if (!start && (current.action.status !== "loading" || current.action.actionId !== actionId)) return false
    this.cards.set(id, makeRecord(current.id, current.type, current.data, current.revision, action))
    this.notify(id)
    return true
  }

  private nextMutationEpoch(): number {
    return ++this.mutationEpoch
  }

  private notify(id: string): void {
    this.notifyOne(id)
    this.notifyAll()
    if (this.debug.active) this.debug.emit("card-store-change", { cardId: id, cards: this.list() })
  }

  private notifyOne(id: string): void {
    const card = this.cards.get(id)
    for (const listener of this.listeners.get(id) ?? []) safeCall(listener, card)
  }

  private notifyAll(): void {
    const cards = this.list()
    for (const listener of this.allListeners) safeCall(listener, cards)
  }
}

export class CardStoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = new.target.name
  }
}

export class CardNotFoundError extends CardStoreError {
  constructor(id: string) { super(`Card "${id}" was not found`) }
}

export class CardTypeConflictError extends CardStoreError {
  constructor(id: string, currentType: string, nextType: string) {
    super(`Card "${id}" is already registered as "${currentType}", not "${nextType}"`)
  }
}

export class CardValidationError extends CardStoreError {
  constructor(type: string) { super(`Card data is invalid for type "${type}"`) }
}

export class CardRevisionConflictError extends CardStoreError {
  constructor(id: string, expected: number, actual: number) {
    super(`Card "${id}" revision conflict: expected ${expected}, actual ${actual}`)
  }
}

export class CardJSONError extends CardStoreError {}
export class CardLimitError extends CardStoreError {}
export class CardSnapshotError extends CardStoreError {}

export function isCardPatchResult(value: unknown): value is CardPatchResult {
  if (!isPlainObject(value) || typeof value.op !== "string") return false
  if (value.op === "batch") return Array.isArray(value.patches) && value.patches.every(isCardPatch)
  return isCardPatch(value)
}

function isCardPatch(value: unknown): value is CardPatch {
  return isPlainObject(value)
    && (value.op === "merge" || value.op === "replace")
    && typeof value.cardId === "string"
    && Object.hasOwn(value, "data")
    && (value.revision === undefined || Number.isSafeInteger(value.revision))
}

function assertPatch(patch: CardPatch): void {
  if (!isCardPatch(patch)) throw new CardStoreError("Invalid card patch")
  validateCardId(patch.cardId)
  if (patch.revision !== undefined && patch.revision < 0) throw new CardStoreError("Card patch revision must be non-negative")
}

function validateCardId(id: unknown): asserts id is string {
  if (typeof id !== "string" || id.trim().length === 0 || id.length > CARD_ID_MAX_LENGTH) {
    throw new CardStoreError(`Card id must be a non-empty string up to ${CARD_ID_MAX_LENGTH} characters`)
  }
}

function validateCardType(type: unknown): asserts type is string {
  if (typeof type !== "string" || type.trim().length === 0) throw new CardStoreError("Card type must be a non-empty string")
}

function cloneJSON(value: unknown): unknown {
  let nodes = 0
  const path = new WeakSet<object>()
  const clone = (input: unknown, depth: number): unknown => {
    nodes++
    if (nodes > CARD_JSON_MAX_NODES) throw new CardLimitError(`Card JSON cannot exceed ${CARD_JSON_MAX_NODES} nodes`)
    if (depth > CARD_JSON_MAX_DEPTH) throw new CardLimitError(`Card JSON cannot exceed depth ${CARD_JSON_MAX_DEPTH}`)
    if (input === null || typeof input === "string" || typeof input === "boolean") return input
    if (typeof input === "number" && Number.isFinite(input)) return input
    if (typeof input !== "object") throw new CardJSONError("Card data must contain only JSON values")
    if (path.has(input)) throw new CardJSONError("Card data cannot contain cycles")
    path.add(input)
    try {
      if (Array.isArray(input)) {
        if (Object.keys(input).length !== input.length) throw new CardJSONError("Card arrays must not be sparse")
        return Object.freeze(input.map((item) => clone(item, depth + 1)))
      }
      if (!isPlainObject(input)) throw new CardJSONError("Card objects must be plain JSON objects")
      const output: Record<string, unknown> = {}
      for (const key of Object.keys(input)) {
        if (isDangerousKey(key)) throw new CardJSONError(`Card data contains dangerous key "${key}"`)
        Object.defineProperty(output, key, { value: clone(input[key], depth + 1), enumerable: true, writable: false, configurable: false })
      }
      return Object.freeze(output)
    } finally {
      path.delete(input)
    }
  }
  return clone(value, 0)
}

function mergeJSON(current: unknown, patch: unknown): unknown {
  if (!isPlainObject(current) || !isPlainObject(patch)) return patch
  const output: Record<string, unknown> = {}
  for (const key of Object.keys(current)) output[key] = current[key]
  for (const key of Object.keys(patch)) output[key] = mergeJSON(current[key], patch[key])
  return cloneJSON(output)
}

function assertPatchId(cardId: string, data: unknown): void {
  if (isPlainObject(data) && Object.hasOwn(data, "id") && data.id !== cardId) {
    throw new CardStoreError(`Card patch cannot change id from "${cardId}"`)
  }
}

function assertRecordId(cardId: string, data: unknown): void {
  if (isPlainObject(data) && Object.hasOwn(data, "id") && data.id !== cardId) {
    throw new CardStoreError(`Card data id must match record id "${cardId}"`)
  }
}

function assertStableId(cardId: string, current: unknown, next: unknown): void {
  const currentHasId = isPlainObject(current) && Object.hasOwn(current, "id")
  const nextHasId = isPlainObject(next) && Object.hasOwn(next, "id")
  if (currentHasId !== nextHasId || (nextHasId && next.id !== cardId)) {
    throw new CardStoreError(`Card patch cannot change id from "${cardId}"`)
  }
}

function makeRecord(id: string, type: string, data: unknown, revision: number, action: CardAction): CardRecord {
  return Object.freeze({ id, type, data, revision, action: Object.freeze(action) })
}

function normalizeCardActionError(error: unknown): CardActionError {
  if (error instanceof Error) return Object.freeze({ name: error.name || "Error", message: error.message })
  return Object.freeze({ name: "Error", message: typeof error === "string" ? error : "Unknown error" })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  if (Object.getOwnPropertySymbols(value).length) return false
  return Object.values(Object.getOwnPropertyDescriptors(value)).every((descriptor) => descriptor.enumerable && "value" in descriptor)
}

function isDangerousKey(key: string): boolean {
  return key === "__proto__" || key === "prototype" || key === "constructor"
}

function safeCall<T extends unknown[]>(listener: (...args: T) => void, ...args: T): void {
  try { listener(...args) } catch { /* Observers cannot affect store semantics. */ }
}
