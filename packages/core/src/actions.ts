import { validateJSONSchema } from "./json-schema"
import { isCardPatchResult } from "./card-store"
import type { CardStore } from "./card-store"
import type { JSONSchema } from "./types"
import { DebugEmitter } from "./debug-events"
import type { DebugEventListener, DebugOptions } from "./debug-events"

let nextRuntimeId = 0

export interface ActionContext {
  signal: AbortSignal
  actionId: string
  cardType?: string
  cardId?: string
}

export interface ActionDefinition<TParams = unknown, TResult = unknown> {
  type: string
  schema?: JSONSchema
  run: (params: TParams, context: ActionContext) => TResult | Promise<TResult>
}

export interface ActionRegisterOptions {
  override?: boolean
}

export class ActionRegistry {
  private actions = new Map<string, ActionDefinition<any, unknown>>()

  register<TParams, TResult>(definition: ActionDefinition<TParams, TResult>, options: ActionRegisterOptions = {}): void {
    if (typeof definition?.type !== "string" || definition.type.trim() === "") {
      throw new TypeError("Action type must be a non-empty string")
    }
    if (typeof definition.run !== "function") throw new TypeError(`Action "${definition.type}" run must be a function`)
    if (this.actions.has(definition.type) && !options.override) {
      throw new ActionAlreadyRegisteredError(definition.type)
    }
    this.actions.set(definition.type, definition as ActionDefinition<any, unknown>)
  }

  has(type: string): boolean {
    return this.actions.has(type)
  }

  get(type: string): ActionDefinition<any, unknown> | undefined {
    return this.actions.get(type)
  }

  list(): ActionDefinition<any, unknown>[] {
    return [...this.actions.values()]
  }
}

export interface ActionRequest<TParams = unknown> {
  type: string
  params: TParams
  cardType?: string
  cardId?: string
}

export interface ActionDispatchOptions {
  signal?: AbortSignal
  timeoutMs?: number
  owner?: object
}

export type ActionStatus = "idle" | "pending" | "success" | "error" | "cancelled"

interface ActionStateBase {
  key: string
  type: string
  cardType?: string
  cardId?: string
  actionId?: string
}

export type ActionState =
  | (ActionStateBase & { status: "idle" })
  | (ActionStateBase & { status: "pending"; actionId: string })
  | (ActionStateBase & { status: "success"; actionId: string; result: unknown })
  | (ActionStateBase & { status: "error"; actionId: string; error: ActionRuntimeError })
  | (ActionStateBase & { status: "cancelled"; actionId: string; error: ActionAbortedError })

export interface ActionEventBase {
  key: string
  type: string
  params: unknown
  actionId: string
  cardType?: string
  cardId?: string
}

export type ActionStartEvent = ActionEventBase
export type ActionSuccessEvent = ActionEventBase & { result: unknown }
export type ActionErrorEvent = ActionEventBase & { error: ActionRuntimeError }

export interface ActionRuntimeOptions extends DebugOptions {
  registry: ActionRegistry
  cardStore?: CardStore
  timeoutMs?: number
  onActionStart?: (event: ActionStartEvent) => void
  onActionSuccess?: (event: ActionSuccessEvent) => void
  onActionError?: (event: ActionErrorEvent) => void
}

export type ActionStateListener = (state: ActionState) => void

interface PendingAction {
  controller: AbortController
  promise: Promise<unknown>
}

export class ActionRuntime {
  readonly debugSource = "action-runtime" as const
  private readonly registry: ActionRegistry
  private readonly cardStore?: CardStore
  private readonly defaultTimeoutMs?: number
  private readonly onActionStart?: ActionRuntimeOptions["onActionStart"]
  private readonly onActionSuccess?: ActionRuntimeOptions["onActionSuccess"]
  private readonly onActionError?: ActionRuntimeOptions["onActionError"]
  private readonly states = new Map<string, ActionState>()
  private readonly pending = new Map<string, Map<object, PendingAction>>()
  private readonly listeners = new Set<ActionStateListener>()
  private readonly defaultOwner = {}
  private readonly runtimeId = ++nextRuntimeId
  private generation = 0
  private nextActionId = 0
  private destroyed = false
  private readonly debug: DebugEmitter

  constructor(options: ActionRuntimeOptions) {
    this.debug = new DebugEmitter(this.debugSource, options)
    this.registry = options.registry
    this.cardStore = options.cardStore
    this.defaultTimeoutMs = options.timeoutMs
    this.onActionStart = options.onActionStart
    this.onActionSuccess = options.onActionSuccess
    this.onActionError = options.onActionError
  }

  dispatch<TResult = unknown>(request: ActionRequest, options: ActionDispatchOptions = {}): Promise<TResult> {
    if (this.destroyed) return Promise.reject(new ActionDestroyedError())
    const key = getActionKey(request.type, request.cardType, request.cardId)
    const owner = options.owner ?? this.defaultOwner
    const existing = this.pending.get(key)?.get(owner)
    if (existing) return existing.promise as Promise<TResult>

    const actionId = `r${this.runtimeId}:${request.type}:${++this.nextActionId}`
    const event: ActionEventBase = {
      key,
      type: request.type,
      params: request.params,
      actionId,
      cardType: request.cardType,
      cardId: request.cardId,
    }
    if (this.debug.active) this.debug.emit("action-dispatched", { ...event })
    const definition = this.registry.get(request.type)
    if (!definition) return this.rejectPreflight<TResult>(event, new ActionNotFoundError(request.type))

    if (definition.schema !== undefined) {
      try {
        const validation = validateJSONSchema(definition.schema, request.params)
        if (!validation.valid) {
          return this.rejectPreflight<TResult>(event, new ActionValidationError(request.type, validation.issues))
        }
      } catch (cause) {
        return this.rejectPreflight<TResult>(event, new ActionExecutionError(request.type, cause))
      }
    }

    let startedMutationEpoch: number | undefined
    try {
      startedMutationEpoch = this.cardStore?.captureMutationEpoch()
    } catch (cause) {
      return this.rejectPreflight<TResult>(event, new ActionExecutionError(request.type, cause))
    }

    if (request.cardId && this.cardStore) {
      try {
        this.cardStore.beginAction(request.cardId, actionId)
      } catch (cause) {
        return this.rejectPreflight<TResult>(event, new ActionExecutionError(request.type, cause))
      }
    }

    const generation = this.generation
    const controller = new AbortController()
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs
    let timer: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    let settled = false
    let resolvePromise!: (result: unknown) => void
    let rejectPromise!: (error: ActionRuntimeError) => void
    const promise = new Promise<unknown>((resolve, reject) => {
      resolvePromise = resolve
      rejectPromise = reject
    })
    const state: Extract<ActionState, { status: "pending" }> = {
      status: "pending",
      key,
      type: request.type,
      cardType: request.cardType,
      cardId: request.cardId,
      actionId,
    }
    const pending: PendingAction = {
      controller,
      promise,
    }
    const runtime = this
    let cleanupExternalSignal = () => {}
    let cleanupAbortSignal = () => {}
    let owners = this.pending.get(key)
    if (!owners) {
      owners = new Map()
      this.pending.set(key, owners)
    }
    owners.set(owner, pending)

    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer)
      cleanupExternalSignal()
      cleanupAbortSignal()
      const currentOwners = this.pending.get(key)
      if (currentOwners?.get(owner) === pending) {
        currentOwners.delete(owner)
        if (currentOwners.size === 0) this.pending.delete(key)
      }
    }

    const finishSuccess = (result: unknown) => {
      if (settled) return
      const wasPublic = this.isPublic(key, actionId, generation)
      const canAffectCard = !request.cardId || !this.cardStore || this.cardStore.isActionCurrent(request.cardId, actionId)
      const canApplyResult = request.cardId ? canAffectCard : wasPublic
      if (canApplyResult && this.cardStore && startedMutationEpoch !== undefined && isCardPatchResult(result)) {
        try {
          this.cardStore.applyActionResult(result, startedMutationEpoch)
        } catch (error) {
          finishError(error)
          return
        }
      }
      settled = true
      cleanup()
      if (wasPublic) {
        this.commit({
          status: "success",
          key,
          type: request.type,
          cardType: request.cardType,
          cardId: request.cardId,
          actionId,
          result,
        })
        callEventHandler(this.onActionSuccess, { ...event, result })
        if (this.debug.active) this.debug.emit("action-success", { ...event, result })
      }
      if (request.cardId && this.cardStore && canAffectCard) {
        // The handler's result goes with it: a verdict it reported reaches the card that was acted
        // on, which is the only place a "you answered wrong" can be shown.
        settleCardAction(() => this.cardStore?.succeedAction(request.cardId as string, actionId, result))
      }
      resolvePromise(result)
    }

    function finishError(cause: unknown): void {
      if (settled) return
      settled = true
      const wasPublic = runtime.isPublic(key, actionId, generation)
      cleanup()
      const error = normalizeError(request.type, cause, controller.signal.aborted, timedOut, timeoutMs)
      if (request.cardId && runtime.cardStore) {
        settleCardAction(() => error instanceof ActionAbortedError
          ? runtime.cardStore?.cancelAction(request.cardId as string, actionId)
          : runtime.cardStore?.failAction(request.cardId as string, actionId, error))
      }
      if (wasPublic) {
        const state: ActionState = error instanceof ActionAbortedError
          ? { status: "cancelled", key, type: request.type, cardType: request.cardType, actionId, error }
          : { status: "error", key, type: request.type, cardType: request.cardType, cardId: request.cardId, actionId, error }
        if (request.cardId) state.cardId = request.cardId
        runtime.commit(state)
        callEventHandler(runtime.onActionError, { ...event, error })
        if (runtime.debug.active) runtime.debug.emit("action-error", { ...event, error })
      }
      rejectPromise(error)
    }

    this.commit(state)
    callEventHandler(this.onActionStart, event)

    cleanupExternalSignal = forwardAbort(options.signal, controller)
    cleanupAbortSignal = listenForAbort(controller.signal, (cause) => finishError(cause))
    if (timeoutMs !== undefined && timeoutMs > 0 && !settled) {
      timer = setTimeout(() => {
        timedOut = true
        controller.abort(new ActionTimeoutError(request.type, timeoutMs))
      }, timeoutMs)
    }

    if (controller.signal.aborted || this.generation !== generation || this.destroyed) {
      finishError(controller.signal.reason ?? new ActionAbortedError(request.type))
      return promise as Promise<TResult>
    }

    try {
      const result = definition.run(request.params, {
        signal: controller.signal,
        actionId,
        cardType: request.cardType,
        cardId: request.cardId,
      })
      Promise.resolve(result).then(finishSuccess, finishError)
    } catch (error) {
      finishError(error)
    }
    return promise as Promise<TResult>
  }

  getState(key: string): ActionState {
    return this.states.get(key) ?? getIdleActionState(key)
  }

  /** Check the runtime allowlist without exposing executable action definitions. */
  hasAction(type: string): boolean {
    return !this.destroyed && this.registry.has(type)
  }

  /** List registered action names without exposing executable definitions. */
  listActionTypes(): readonly string[] {
    return this.destroyed ? [] : Object.freeze(this.registry.list().map((action) => action.type))
  }

  subscribe(listener: ActionStateListener): () => void {
    if (this.destroyed) return () => {}
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  subscribeDebug(listener: DebugEventListener): () => void {
    return this.debug.subscribe(listener)
  }

  cancel(key: string): boolean {
    const actions = this.pending.get(key)
    if (!actions?.size) return false
    const type = this.states.get(key)?.type ?? getIdleActionState(key).type
    for (const action of [...actions.values()]) action.controller.abort(new ActionAbortedError(type))
    return true
  }

  reset(): void {
    const oldStates = [...this.states.values()]
    this.generation++
    const actions = [...this.pending.values()].flatMap((owners) => [...owners.values()])
    for (const action of actions) action.controller.abort(new ActionAbortedError("Action"))
    this.pending.clear()
    this.states.clear()
    for (const state of oldStates) this.notify(idleStateFrom(state))
  }

  destroy(): void {
    if (this.destroyed) return
    this.reset()
    this.destroyed = true
    this.listeners.clear()
  }

  private rejectPreflight<TResult>(event: ActionEventBase, error: ActionRuntimeError): Promise<TResult> {
    const errorState: ActionState = {
      status: "error",
      key: event.key,
      type: event.type,
      cardType: event.cardType,
      cardId: event.cardId,
      actionId: event.actionId,
      error,
    }
    this.commit(errorState)
    callEventHandler(this.onActionError, { ...event, error })
    if (this.debug.active) this.debug.emit("action-error", { ...event, error })
    return Promise.reject(error)
  }

  private isPublic(key: string, actionId: string, generation: number): boolean {
    return !this.destroyed && this.generation === generation && this.states.get(key)?.actionId === actionId
  }

  private commit(state: ActionState): void {
    this.states.set(state.key, state)
    if (this.debug.active) this.debug.emit("action-state", { ...state })
    this.notify(state)
  }

  private notify(state: ActionState): void {
    for (const listener of this.listeners) {
      try {
        listener(state)
      } catch {
        // Subscribers are observers and cannot change runtime semantics.
      }
    }
  }
}

export function createActionRuntime(options: ActionRuntimeOptions): ActionRuntime {
  return new ActionRuntime(options)
}

export class ActionRuntimeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = new.target.name
  }
}

export class ActionAlreadyRegisteredError extends ActionRuntimeError {
  constructor(type: string) {
    super(`Action "${type}" is already registered`)
  }
}

export class ActionNotFoundError extends ActionRuntimeError {
  constructor(type: string) {
    super(`Action "${type}" is not registered`)
  }
}

export class ActionValidationError extends ActionRuntimeError {
  constructor(public readonly actionType: string, public readonly issues: string[]) {
    super(`Action "${actionType}" parameters are invalid: ${issues.join(", ")}`)
  }
}

export class ActionExecutionError extends ActionRuntimeError {
  constructor(type: string, cause: unknown) {
    super(`Action "${type}" failed`, { cause })
  }
}

export class ActionAbortedError extends ActionRuntimeError {
  constructor(type: string) {
    super(`Action "${type}" was cancelled`)
  }
}

export class ActionTimeoutError extends ActionRuntimeError {
  constructor(type: string, public readonly timeoutMs: number) {
    super(`Action "${type}" timed out after ${timeoutMs}ms`)
  }
}

export class ActionDestroyedError extends ActionRuntimeError {
  constructor() {
    super("Action runtime has been destroyed")
  }
}

export function getActionKey(type: string, cardType?: string, cardId?: string): string {
  if (cardId !== undefined) return `::${JSON.stringify([cardType ?? null, type, cardId])}`
  if (!type.includes(":") && !cardType?.includes(":")) return cardType ? `${cardType}:${type}` : type
  return `::${JSON.stringify([cardType ?? null, type])}`
}

export function getIdleActionState(key: string): Extract<ActionState, { status: "idle" }> {
  if (key.startsWith("::")) {
    try {
      const [cardType, type, cardId] = JSON.parse(key.slice(2)) as [string | null, string, string?]
      if (cardId !== undefined) {
        return cardType === null
          ? { status: "idle", key, type, cardId }
          : { status: "idle", key, cardType, type, cardId }
      }
      return cardType === null ? { status: "idle", key, type } : { status: "idle", key, cardType, type }
    } catch {
      return { status: "idle", key, type: key }
    }
  }
  const separator = key.indexOf(":")
  return separator === -1
    ? { status: "idle", key, type: key }
    : { status: "idle", key, cardType: key.slice(0, separator), type: key.slice(separator + 1) }
}

function idleStateFrom(state: ActionState): ActionState {
  return {
    status: "idle",
    key: state.key,
    type: state.type,
    ...(state.cardType === undefined ? {} : { cardType: state.cardType }),
    ...(state.cardId === undefined ? {} : { cardId: state.cardId }),
  }
}

function listenForAbort(signal: AbortSignal, onAbort: (reason: unknown) => void): () => void {
  const abort = () => onAbort(signal.reason)
  if (signal.aborted) abort()
  else signal.addEventListener("abort", abort, { once: true })
  return () => signal.removeEventListener("abort", abort)
}

function forwardAbort(signal: AbortSignal | undefined, controller: AbortController): () => void {
  if (!signal) return () => {}
  const abort = () => controller.abort(signal.reason)
  if (signal.aborted) abort()
  else signal.addEventListener("abort", abort, { once: true })
  return () => signal.removeEventListener("abort", abort)
}

function normalizeError(
  type: string,
  cause: unknown,
  aborted: boolean,
  timedOut: boolean,
  timeoutMs: number | undefined,
): ActionRuntimeError {
  if (cause instanceof ActionRuntimeError) return cause
  if (timedOut) return new ActionTimeoutError(type, timeoutMs ?? 0)
  if (aborted || isAbortError(cause)) return new ActionAbortedError(type)
  return new ActionExecutionError(type, cause)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

function callEventHandler<T>(handler: ((event: T) => void) | undefined, event: T): void {
  try {
    handler?.(event)
  } catch {
    // Observability hooks must not change action execution semantics.
  }
}

function settleCardAction(settle: () => unknown): void {
  try { settle() } catch { /* Card deletion during an action cannot change promise settlement. */ }
}
