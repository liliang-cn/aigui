import { describe, expect, it, vi } from "vitest"
import {
  ActionAbortedError,
  ActionDestroyedError,
  ActionExecutionError,
  ActionNotFoundError,
  ActionRegistry,
  ActionTimeoutError,
  ActionValidationError,
  createActionRuntime,
  getActionKey,
} from "./actions"
import { getIdleActionState } from "./index"
import { CardRegistry } from "./card-registry"
import { CardStore } from "./card-store"

const objectSchema = {
  type: "object",
  required: ["value"],
  properties: { value: { type: "string", minLength: 1 } },
  additionalProperties: false,
} as const

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("ActionRegistry", () => {
  it("registers, gets, lists, and explicitly controls replacement", () => {
    const registry = new ActionRegistry()
    const first = { type: "save", schema: objectSchema, run: vi.fn() }
    const second = { type: "save", schema: objectSchema, run: vi.fn() }

    registry.register(first)
    expect(registry.has("save")).toBe(true)
    expect(registry.get("save")).toBe(first)
    expect(registry.list()).toEqual([first])
    expect(() => registry.register(second)).toThrow(/already registered/i)

    registry.register(second, { override: true })
    expect(registry.get("save")).toBe(second)
    expect(registry.list()).toEqual([second])
  })

  it("rejects invalid definitions", () => {
    const registry = new ActionRegistry()
    expect(() => registry.register({ type: "", run: vi.fn() })).toThrow(/type/i)
    expect(() => registry.register({ type: "save", run: undefined as never })).toThrow(/run/i)
  })
})

describe("ActionRuntime", () => {
  it("reports whether an action is registered without exposing its definition", () => {
    const registry = new ActionRegistry()
    registry.register({ type: "save", run: () => undefined })
    const runtime = createActionRuntime({ registry })

    expect(runtime.hasAction("save")).toBe(true)
    expect(runtime.hasAction("missing")).toBe(false)
    expect(runtime.listActionTypes()).toEqual(["save"])
  })
  it("dispatches a validated action with context and observable lifecycle", async () => {
    const registry = new ActionRegistry()
    const run = vi.fn(async (_params, context) => ({ actionId: context.actionId, cardType: context.cardType }))
    registry.register({ type: "save", schema: objectSchema, run })
    const events: string[] = []
    const runtime = createActionRuntime({
      registry,
      onActionStart: () => events.push("start"),
      onActionSuccess: () => events.push("success"),
      onActionError: () => events.push("error"),
    })
    const states: string[] = []
    const unsubscribe = runtime.subscribe((state) => states.push(state.status))

    const key = getActionKey("save", "weather")
    expect(key).toBe("weather:save")
    expect(runtime.getState(key).status).toBe("idle")
    const result = await runtime.dispatch({ type: "save", params: { value: "x" }, cardType: "weather" })

    expect(result).toEqual({ actionId: expect.any(String), cardType: "weather" })
    expect(run).toHaveBeenCalledWith(
      { value: "x" },
      expect.objectContaining({ signal: expect.any(AbortSignal), actionId: expect.any(String), cardType: "weather" }),
    )
    expect(runtime.getState(key)).toMatchObject({
      status: "success",
      type: "save",
      cardType: "weather",
      result,
    })
    expect(states).toEqual(["pending", "success"])
    expect(events).toEqual(["start", "success"])

    unsubscribe()
    runtime.reset()
    expect(states).toEqual(["pending", "success"])
    expect(runtime.getState(key).status).toBe("idle")
  })

  it("commits and reports unregistered actions as preflight errors", async () => {
    const onActionError = vi.fn()
    const runtime = createActionRuntime({ registry: new ActionRegistry(), onActionError })
    const promise = runtime.dispatch({ type: "missing", params: { value: 1 } })

    await expect(promise).rejects.toBeInstanceOf(ActionNotFoundError)
    expect(runtime.getState("missing")).toMatchObject({
      status: "error",
      type: "missing",
      actionId: expect.any(String),
      error: expect.any(ActionNotFoundError),
    })
    expect(onActionError).toHaveBeenCalledWith(expect.objectContaining({
      key: "missing",
      type: "missing",
      params: { value: 1 },
      error: expect.any(ActionNotFoundError),
    }))
  })

  it("commits and reports validation failures before calling the handler", async () => {
    const registry = new ActionRegistry()
    const run = vi.fn()
    registry.register({ type: "save", schema: objectSchema, run })
    const onActionError = vi.fn()
    const runtime = createActionRuntime({ registry, onActionError })

    const promise = runtime.dispatch({ type: "save", params: { value: "", extra: true } })
    await expect(promise).rejects.toBeInstanceOf(ActionValidationError)
    await expect(promise).rejects.toMatchObject({ issues: expect.arrayContaining([expect.stringContaining("value")]) })
    expect(run).not.toHaveBeenCalled()
    expect(runtime.getState("save")).toMatchObject({ status: "error", error: expect.any(ActionValidationError) })
    expect(onActionError).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(ActionValidationError) }))
  })

  it("does not begin card loading when schema validation itself throws", async () => {
    const cards = actionCardStore()
    const registry = new ActionRegistry()
    const run = vi.fn()
    registry.register({ type: "save", schema: null as never, run })
    const runtime = createActionRuntime({ registry, cardStore: cards })

    await expect(runtime.dispatch({ type: "save", params: {}, cardId: "one" }))
      .rejects.toBeInstanceOf(ActionExecutionError)
    expect(run).not.toHaveBeenCalled()
    expect(cards.get("one")?.action).toEqual({ status: "idle" })
  })

  it("does not evict a valid card action when a later dispatch fails preflight", async () => {
    const cards = actionCardStore()
    const result = deferred<string>()
    const registry = new ActionRegistry()
    registry.register({ type: "save", schema: objectSchema, run: () => result.promise })
    const runtime = createActionRuntime({ registry, cardStore: cards })

    const valid = runtime.dispatch({ type: "save", params: { value: "valid" }, cardId: "one" }, { owner: {} })
    const validActionId = cards.get("one")?.action.status === "loading" ? cards.get("one")?.action.actionId : undefined
    const invalid = runtime.dispatch({ type: "save", params: { value: "" }, cardId: "one" }, { owner: {} })

    await expect(invalid).rejects.toBeInstanceOf(ActionValidationError)
    expect(cards.get("one")?.action).toEqual({ status: "loading", actionId: validActionId })

    result.reject(new Error("valid action failed"))
    await expect(valid).rejects.toBeInstanceOf(ActionExecutionError)
    expect(cards.get("one")?.action).toMatchObject({ status: "error", actionId: validActionId })
  })

  it("keeps a latest preflight error public after an older execution succeeds", async () => {
    const result = deferred<string>()
    const registry = new ActionRegistry()
    registry.register({ type: "save", schema: objectSchema, run: () => result.promise })
    const runtime = createActionRuntime({ registry })

    const pending = runtime.dispatch({ type: "save", params: { value: "valid" } }, { owner: {} })
    const invalid = runtime.dispatch({ type: "save", params: { value: "" } }, { owner: {} })

    await expect(invalid).rejects.toBeInstanceOf(ActionValidationError)
    const invalidActionId = runtime.getState("save").actionId
    expect(runtime.getState("save")).toMatchObject({
      status: "error",
      actionId: invalidActionId,
      error: expect.any(ActionValidationError),
    })

    result.resolve("ok")
    await expect(pending).resolves.toBe("ok")
    expect(runtime.getState("save")).toMatchObject({
      status: "error",
      actionId: invalidActionId,
      error: expect.any(ActionValidationError),
    })
  })

  it("deduplicates a pending action key by returning the same promise", async () => {
    const pending = deferred<string>()
    const registry = new ActionRegistry()
    const run = vi.fn(() => pending.promise)
    registry.register({ type: "save", run })
    const runtime = createActionRuntime({ registry })

    const first = runtime.dispatch({ type: "save", params: { value: 1 } })
    const duplicate = runtime.dispatch({ type: "save", params: { value: 2 } })
    const otherCard = runtime.dispatch({ type: "save", params: { value: 3 }, cardType: "other" })

    expect(duplicate).toBe(first)
    expect(otherCard).not.toBe(first)
    expect(run).toHaveBeenCalledTimes(2)
    pending.resolve("ok")
    await expect(first).resolves.toBe("ok")
    await expect(otherCard).resolves.toBe("ok")
  })

  it("deduplicates by owner identity while different owners execute independently", async () => {
    const firstResult = deferred<string>()
    const secondResult = deferred<string>()
    const registry = new ActionRegistry()
    const signals: AbortSignal[] = []
    const run = vi.fn((_params, { signal }) => {
      signals.push(signal)
      return signals.length === 1 ? firstResult.promise : secondResult.promise
    })
    registry.register({ type: "save", run })
    const runtime = createActionRuntime({ registry })
    const firstOwner = {}
    const secondOwner = {}
    const firstAbort = new AbortController()
    const secondAbort = new AbortController()

    const first = runtime.dispatch({ type: "save", params: { value: 1 } }, { owner: firstOwner, signal: firstAbort.signal })
    const duplicate = runtime.dispatch({ type: "save", params: { value: 2 } }, { owner: firstOwner })
    const second = runtime.dispatch({ type: "save", params: { value: 3 } }, { owner: secondOwner, signal: secondAbort.signal })

    expect(duplicate).toBe(first)
    expect(second).not.toBe(first)
    expect(run).toHaveBeenCalledTimes(2)
    firstAbort.abort()
    await expect(first).rejects.toBeInstanceOf(ActionAbortedError)
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)

    secondResult.resolve("second")
    await expect(second).resolves.toBe("second")
    expect(runtime.getState("save")).toMatchObject({ status: "success", result: "second" })
  })

  it("deduplicates an owner before re-running validation", async () => {
    const result = deferred<string>()
    const registry = new ActionRegistry()
    const run = vi.fn(() => result.promise)
    registry.register({ type: "save", schema: objectSchema, run })
    const runtime = createActionRuntime({ registry })
    const owner = {}

    const first = runtime.dispatch({ type: "save", params: { value: "valid" } }, { owner })
    const duplicate = runtime.dispatch({ type: "save", params: { value: "" } }, { owner })

    expect(duplicate).toBe(first)
    expect(run).toHaveBeenCalledTimes(1)
    result.resolve("ok")
    await expect(first).resolves.toBe("ok")
  })

  it("keeps the latest-started success public after an older execution succeeds", async () => {
    const firstResult = deferred<string>()
    const latestResult = deferred<string>()
    const registry = new ActionRegistry()
    registry.register({
      type: "save",
      run: vi.fn()
        .mockImplementationOnce(() => firstResult.promise)
        .mockImplementationOnce(() => latestResult.promise),
    })
    const runtime = createActionRuntime({ registry })

    const firstPromise = runtime.dispatch({ type: "save", params: {} }, { owner: {} })
    const latestPromise = runtime.dispatch({ type: "save", params: {} }, { owner: {} })
    const latestActionId = runtime.getState("save").actionId

    latestResult.resolve("latest")
    await expect(latestPromise).resolves.toBe("latest")
    expect(runtime.getState("save")).toMatchObject({ status: "success", actionId: latestActionId, result: "latest" })

    firstResult.resolve("first")
    await expect(firstPromise).resolves.toBe("first")
    expect(runtime.getState("save")).toMatchObject({ status: "success", actionId: latestActionId, result: "latest" })
  })

  it("keeps the latest-started cancellation public after an older execution succeeds", async () => {
    const firstResult = deferred<string>()
    const latestResult = deferred<string>()
    const registry = new ActionRegistry()
    registry.register({
      type: "save",
      run: vi.fn()
        .mockImplementationOnce(() => firstResult.promise)
        .mockImplementationOnce(() => latestResult.promise),
    })
    const runtime = createActionRuntime({ registry })
    const latestAbort = new AbortController()

    const firstPromise = runtime.dispatch({ type: "save", params: {} }, { owner: {} })
    const latestPromise = runtime.dispatch(
      { type: "save", params: {} },
      { owner: {}, signal: latestAbort.signal },
    )
    const latestActionId = runtime.getState("save").actionId

    latestAbort.abort()
    await expect(latestPromise).rejects.toBeInstanceOf(ActionAbortedError)
    expect(runtime.getState("save")).toMatchObject({ status: "cancelled", actionId: latestActionId })

    firstResult.resolve("first")
    await expect(firstPromise).resolves.toBe("first")
    expect(runtime.getState("save")).toMatchObject({ status: "cancelled", actionId: latestActionId })
  })

  it("establishes pending before synchronous start and handler re-entry", async () => {
    const result = deferred<string>()
    const registry = new ActionRegistry()
    const owner = {}
    let startDuplicate!: Promise<string>
    let runDuplicate!: Promise<string>
    let runtime: ReturnType<typeof createActionRuntime>
    registry.register({
      type: "save",
      run: () => {
        runDuplicate = runtime.dispatch<string>({ type: "save", params: { source: "run" } }, { owner })
        return result.promise
      },
    })
    runtime = createActionRuntime({
      registry,
      onActionStart: () => {
        startDuplicate = runtime.dispatch<string>({ type: "save", params: { source: "start" } }, { owner })
      },
    })

    const promise = runtime.dispatch<string>({ type: "save", params: { source: "outer" } }, { owner })

    expect(startDuplicate).toBe(promise)
    expect(runDuplicate).toBe(promise)
    result.resolve("ok")
    await expect(promise).resolves.toBe("ok")
  })

  it("handles synchronous cancellation and reset re-entry safely", async () => {
    const registry = new ActionRegistry()
    const run = vi.fn(() => "unexpected")
    registry.register({ type: "cancelled", run })
    registry.register({ type: "reset", run })
    let runtime: ReturnType<typeof createActionRuntime>
    runtime = createActionRuntime({
      registry,
      onActionStart: ({ key, type }) => {
        if (type === "cancelled") runtime.cancel(key)
        else runtime.reset()
      },
    })

    await expect(runtime.dispatch({ type: "cancelled", params: {} })).rejects.toBeInstanceOf(ActionAbortedError)
    await expect(runtime.dispatch({ type: "reset", params: {} })).rejects.toBeInstanceOf(ActionAbortedError)
    expect(run).not.toHaveBeenCalled()
    expect(runtime.getState("reset").status).toBe("idle")
  })

  it("supports external abort and explicit cancellation", async () => {
    const registry = new ActionRegistry()
    registry.register({ type: "save", run: (_params, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true })
    }) })
    const runtime = createActionRuntime({ registry })
    const controller = new AbortController()

    const external = runtime.dispatch({ type: "save", params: {} }, { signal: controller.signal })
    controller.abort("navigation")
    await expect(external).rejects.toBeInstanceOf(ActionAbortedError)
    expect(runtime.getState("save").status).toBe("cancelled")

    const explicit = runtime.dispatch({ type: "save", params: {} })
    expect(runtime.cancel("save")).toBe(true)
    await expect(explicit).rejects.toBeInstanceOf(ActionAbortedError)
    expect(runtime.cancel("save")).toBe(false)
  })

  it("settles a pre-aborted signal without leaving pending state", async () => {
    const registry = new ActionRegistry()
    const run = vi.fn()
    registry.register({ type: "save", run })
    const runtime = createActionRuntime({ registry })
    const controller = new AbortController()
    controller.abort("already gone")

    await expect(runtime.dispatch({ type: "save", params: {} }, { signal: controller.signal }))
      .rejects.toBeInstanceOf(ActionAbortedError)
    expect(run).not.toHaveBeenCalled()
    expect(runtime.getState("save").status).toBe("cancelled")
  })

  it("cancels every pending owner for a base key", async () => {
    const registry = new ActionRegistry()
    const signals: AbortSignal[] = []
    registry.register({ type: "save", run: (_params, { signal }) => {
      signals.push(signal)
      return new Promise(() => {})
    } })
    const runtime = createActionRuntime({ registry })

    const first = runtime.dispatch({ type: "save", params: {} }, { owner: {} })
    const second = runtime.dispatch({ type: "save", params: {} }, { owner: {} })
    const latestActionId = runtime.getState("save").actionId

    expect(runtime.cancel("save")).toBe(true)
    await expect(first).rejects.toBeInstanceOf(ActionAbortedError)
    await expect(second).rejects.toBeInstanceOf(ActionAbortedError)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    expect(runtime.getState("save")).toMatchObject({ status: "cancelled", actionId: latestActionId })
    expect(runtime.cancel("save")).toBe(false)
  })

  it("isolates throwing subscribers from commit and promise settlement", async () => {
    const registry = new ActionRegistry()
    registry.register({ type: "save", run: () => "ok" })
    const runtime = createActionRuntime({ registry })
    const observed: string[] = []
    runtime.subscribe(() => { throw new Error("listener failed") })
    runtime.subscribe((state) => observed.push(state.status))

    const promise = runtime.dispatch({ type: "save", params: {} })

    await expect(promise).resolves.toBe("ok")
    expect(runtime.getState("save")).toMatchObject({ status: "success", result: "ok" })
    expect(observed).toEqual(["pending", "success"])
  })

  it("isolates throwing subscribers from preflight rejection", async () => {
    const runtime = createActionRuntime({ registry: new ActionRegistry() })
    const listener = vi.fn(() => { throw new Error("listener failed") })
    runtime.subscribe(listener)

    const promise = runtime.dispatch({ type: "missing", params: {} })

    await expect(promise).rejects.toBeInstanceOf(ActionNotFoundError)
    expect(listener).toHaveBeenCalledOnce()
    expect(runtime.getState("missing").status).toBe("error")
  })

  it("times out with a distinct error and aborts the handler signal", async () => {
    vi.useFakeTimers()
    try {
      const registry = new ActionRegistry()
      let signal!: AbortSignal
      registry.register({ type: "slow", run: (_params, context) => {
        signal = context.signal
        return new Promise(() => {})
      } })
      const runtime = createActionRuntime({ registry, timeoutMs: 50 })

      const promise = runtime.dispatch({ type: "slow", params: {} })
      const rejection = expect(promise).rejects.toBeInstanceOf(ActionTimeoutError)
      await vi.advanceTimersByTimeAsync(50)

      await rejection
      expect(signal.aborted).toBe(true)
      expect(runtime.getState("slow").status).toBe("error")
    } finally {
      vi.useRealTimers()
    }
  })

  it("wraps handler failures, preserves cause, and emits error", async () => {
    const cause = new Error("database unavailable")
    const registry = new ActionRegistry()
    registry.register({ type: "save", run: () => { throw cause } })
    const onActionError = vi.fn()
    const runtime = createActionRuntime({ registry, onActionError })

    const promise = runtime.dispatch({ type: "save", params: {} })
    await expect(promise).rejects.toBeInstanceOf(ActionExecutionError)
    await expect(promise).rejects.toMatchObject({ cause })
    expect(runtime.getState("save")).toMatchObject({ status: "error", error: expect.any(ActionExecutionError) })
    expect(onActionError).toHaveBeenCalledWith(expect.objectContaining({ type: "save", error: expect.any(ActionExecutionError) }))
  })

  it("reset cancels work and prevents stale handlers from overwriting a new generation", async () => {
    const old = deferred<string>()
    const fresh = deferred<string>()
    const registry = new ActionRegistry()
    const run = vi.fn().mockImplementationOnce(() => old.promise).mockImplementationOnce(() => fresh.promise)
    registry.register({ type: "save", run })
    const runtime = createActionRuntime({ registry })

    const oldPromise = runtime.dispatch({ type: "save", params: {} })
    runtime.reset()
    const freshPromise = runtime.dispatch({ type: "save", params: {} })
    old.resolve("stale")
    await expect(oldPromise).rejects.toBeInstanceOf(ActionAbortedError)
    expect(runtime.getState("save").status).toBe("pending")

    fresh.resolve("fresh")
    await expect(freshPromise).resolves.toBe("fresh")
    expect(runtime.getState("save")).toMatchObject({ status: "success", result: "fresh" })
  })

  it("reset clears state and notifies every old key as idle", async () => {
    const registry = new ActionRegistry()
    registry.register({ type: "first", run: () => "done" })
    registry.register({ type: "second", run: () => new Promise(() => {}) })
    const runtime = createActionRuntime({ registry })
    await runtime.dispatch({ type: "first", params: {}, cardType: "card" })
    const pending = runtime.dispatch({ type: "second", params: {} })
    const listener = vi.fn()
    runtime.subscribe(listener)

    runtime.reset()

    await expect(pending).rejects.toBeInstanceOf(ActionAbortedError)
    expect(listener).toHaveBeenCalledWith({ status: "idle", key: "card:first", type: "first", cardType: "card" })
    expect(listener).toHaveBeenCalledWith({ status: "idle", key: "second", type: "second" })
    expect(runtime.getState("card:first").status).toBe("idle")
    expect(runtime.getState("second").status).toBe("idle")
  })

  it("isolates throwing subscribers during reset and destroy", async () => {
    const registry = new ActionRegistry()
    registry.register({ type: "save", run: () => new Promise(() => {}) })
    const runtime = createActionRuntime({ registry })
    const resetPromise = runtime.dispatch({ type: "save", params: {} })
    runtime.subscribe(() => { throw new Error("listener failed") })

    expect(() => runtime.reset()).not.toThrow()
    await expect(resetPromise).rejects.toBeInstanceOf(ActionAbortedError)
    expect(runtime.getState("save").status).toBe("idle")

    const destroyPromise = runtime.dispatch({ type: "save", params: {} })
    expect(() => runtime.destroy()).not.toThrow()
    await expect(destroyPromise).rejects.toBeInstanceOf(ActionAbortedError)
    expect(runtime.getState("save").status).toBe("idle")
  })

  it("removes abort listeners after normal settlement", async () => {
    const registry = new ActionRegistry()
    registry.register({ type: "save", run: () => "ok" })
    const runtime = createActionRuntime({ registry })
    const controller = new AbortController()
    const add = vi.spyOn(controller.signal, "addEventListener")
    const remove = vi.spyOn(controller.signal, "removeEventListener")

    await expect(runtime.dispatch({ type: "save", params: {} }, { signal: controller.signal })).resolves.toBe("ok")

    expect(add).toHaveBeenCalledWith("abort", expect.any(Function), { once: true })
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function))
  })

  it("uses collision-safe keys when action components contain colons", () => {
    const first = getActionKey("b:c", "a")
    const second = getActionKey("c", "a:b")
    const noCard = getActionKey("a:b:c")

    expect(first).not.toBe(second)
    expect(first).not.toBe(noCard)
    expect(second).not.toBe(noCard)
    expect(getActionKey("save", "weather")).toBe("weather:save")
  })

  it("exports a collision-safe idle state helper", () => {
    expect(getIdleActionState("weather:save")).toEqual({
      status: "idle",
      key: "weather:save",
      cardType: "weather",
      type: "save",
    })
    const key = getActionKey("b:c", "a")
    expect(getIdleActionState(key)).toEqual({ status: "idle", key, cardType: "a", type: "b:c" })
  })

  it("destroy cancels work, clears subscribers, and rejects future dispatches", async () => {
    const registry = new ActionRegistry()
    registry.register({ type: "save", run: () => new Promise(() => {}) })
    const runtime = createActionRuntime({ registry })
    const listener = vi.fn()
    runtime.subscribe(listener)
    const promise = runtime.dispatch({ type: "save", params: {} })

    runtime.destroy()

    await expect(promise).rejects.toBeInstanceOf(ActionAbortedError)
    await expect(runtime.dispatch({ type: "save", params: {} })).rejects.toBeInstanceOf(ActionDestroyedError)
    expect(runtime.getState("save").status).toBe("idle")
    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenLastCalledWith({ status: "idle", key: "save", type: "save" })
  })

  it("isolates action keys and context by card id while preserving legacy keys", async () => {
    const registry = new ActionRegistry()
    registry.register({ type: "save", run: (_params, context) => context.cardId })
    const runtime = createActionRuntime({ registry })
    expect(getActionKey("save", "weather")).toBe("weather:save")
    expect(getActionKey("save", "weather", "one")).not.toBe(getActionKey("save", "weather", "two"))
    await expect(runtime.dispatch({ type: "save", params: {}, cardType: "weather", cardId: "one" })).resolves.toBe("one")
  })

  it("drives card loading and success and applies explicit patches only", async () => {
    const cards = actionCardStore()
    const registry = new ActionRegistry()
    const pending = deferred<unknown>()
    registry.register({ type: "save", run: () => pending.promise })
    const runtime = createActionRuntime({ registry, cardStore: cards })

    const promise = runtime.dispatch({ type: "save", params: {}, cardType: "counter", cardId: "one" })
    expect(cards.get("one")?.action).toMatchObject({ status: "loading", actionId: expect.any(String) })
    pending.resolve({ op: "merge", cardId: "one", data: { count: 2 } })
    await expect(promise).resolves.toEqual({ op: "merge", cardId: "one", data: { count: 2 } })
    expect(cards.get("one")).toMatchObject({ data: expect.objectContaining({ count: 2 }), revision: 1, action: { status: "success" } })

    registry.register({ type: "plain", run: () => ({ cardId: "one", count: 9 }) })
    await runtime.dispatch({ type: "plain", params: {}, cardType: "counter", cardId: "one" })
    expect(cards.get("one")).toMatchObject({ data: expect.objectContaining({ count: 2 }), revision: 1 })
  })

  it("rejects an action patch when onActionStart mutates its target card", async () => {
    const cards = actionCardStore()
    const registry = new ActionRegistry()
    registry.register({ type: "save", run: () => ({ op: "merge", cardId: "one", data: { count: 3 } }) })
    const runtime = createActionRuntime({
      registry,
      cardStore: cards,
      onActionStart: () => cards.apply({ op: "merge", cardId: "one", data: { count: 2 } }),
    })

    await expect(runtime.dispatch({ type: "save", params: {}, cardId: "one" }))
      .rejects.toBeInstanceOf(ActionExecutionError)
    expect(cards.get("one")).toMatchObject({
      revision: 1,
      data: expect.objectContaining({ count: 2 }),
      action: { status: "error" },
    })
  })

  it("rejects an action patch when a card loading subscriber mutates its target card", async () => {
    const cards = actionCardStore()
    let mutated = false
    cards.subscribe("one", (card) => {
      if (!mutated && card?.action.status === "loading") {
        mutated = true
        cards.apply({ op: "merge", cardId: "one", data: { count: 2 } })
      }
    })
    const registry = new ActionRegistry()
    registry.register({ type: "save", run: () => ({ op: "merge", cardId: "one", data: { count: 3 } }) })
    const runtime = createActionRuntime({ registry, cardStore: cards })

    await expect(runtime.dispatch({ type: "save", params: {}, cardId: "one" }))
      .rejects.toBeInstanceOf(ActionExecutionError)
    expect(cards.get("one")).toMatchObject({
      revision: 1,
      data: expect.objectContaining({ count: 2 }),
      action: { status: "error" },
    })
  })

  it.each(["success", "failure", "cancel"] as const)(
    "keeps shared card lifecycles isolated across runtimes when the older action ends with %s",
    async (outcome) => {
      const cards = actionCardStore()
      const first = deferred<string>()
      const second = deferred<string>()
      const registry = new ActionRegistry()
      registry.register({ type: "save", run: ({ source }: { source: string }) => source === "first" ? first.promise : second.promise })
      const firstRuntime = createActionRuntime({ registry, cardStore: cards })
      const secondRuntime = createActionRuntime({ registry, cardStore: cards })

      const firstPromise = firstRuntime.dispatch({ type: "save", params: { source: "first" }, cardId: "one" })
      const firstActionId = firstRuntime.getState(getActionKey("save", undefined, "one")).actionId
      const secondPromise = secondRuntime.dispatch({ type: "save", params: { source: "second" }, cardId: "one" })
      const secondActionId = secondRuntime.getState(getActionKey("save", undefined, "one")).actionId

      expect(firstActionId).toMatch(/^r\d+:save:1$/)
      expect(secondActionId).toMatch(/^r\d+:save:1$/)
      expect(secondActionId).not.toBe(firstActionId)
      expect(cards.get("one")?.action).toEqual({ status: "loading", actionId: secondActionId })

      if (outcome === "success") {
        first.resolve("first")
        await expect(firstPromise).resolves.toBe("first")
      } else if (outcome === "failure") {
        first.reject(new Error("first failed"))
        await expect(firstPromise).rejects.toBeInstanceOf(ActionExecutionError)
      } else {
        expect(firstRuntime.cancel(getActionKey("save", undefined, "one"))).toBe(true)
        await expect(firstPromise).rejects.toBeInstanceOf(ActionAbortedError)
      }

      expect(cards.get("one")?.action).toEqual({ status: "loading", actionId: secondActionId })
      second.resolve("second")
      await expect(secondPromise).resolves.toBe("second")
      expect(cards.get("one")?.action).toEqual({ status: "success", actionId: secondActionId })
    },
  )

  it("marks patch failures as action errors without mutating the card", async () => {
    const cards = actionCardStore()
    const registry = new ActionRegistry()
    registry.register({ type: "save", run: () => ({ op: "merge", cardId: "one", data: { count: -1 } }) })
    const runtime = createActionRuntime({ registry, cardStore: cards })

    await expect(runtime.dispatch({ type: "save", params: {}, cardType: "counter", cardId: "one" }))
      .rejects.toBeInstanceOf(ActionExecutionError)
    expect(cards.get("one")).toMatchObject({ data: expect.objectContaining({ count: 1 }), revision: 0, action: { status: "error" } })
  })

  it("updates card error, timeout, and cancellation lifecycle", async () => {
    vi.useFakeTimers()
    try {
      const cards = actionCardStore()
      const registry = new ActionRegistry()
      registry.register({ type: "fail", run: () => { throw new Error("no") } })
      registry.register({ type: "slow", run: () => new Promise(() => {}) })
      const runtime = createActionRuntime({ registry, cardStore: cards, timeoutMs: 10 })
      await expect(runtime.dispatch({ type: "fail", params: {}, cardId: "one" })).rejects.toBeInstanceOf(ActionExecutionError)
      expect(cards.get("one")?.action.status).toBe("error")

      const timeout = runtime.dispatch({ type: "slow", params: {}, cardId: "one" })
      const timeoutRejection = expect(timeout).rejects.toBeInstanceOf(ActionTimeoutError)
      await vi.advanceTimersByTimeAsync(10)
      await timeoutRejection
      expect(cards.get("one")?.action).toMatchObject({
        status: "error",
        error: { name: "ActionTimeoutError" },
      })

      const controller = new AbortController()
      const cancelled = runtime.dispatch({ type: "slow", params: {}, cardId: "one" }, { signal: controller.signal })
      controller.abort()
      await expect(cancelled).rejects.toBeInstanceOf(ActionAbortedError)
      expect(cards.get("one")?.action).toEqual({ status: "idle" })
    } finally {
      vi.useRealTimers()
    }
  })

  it("returns card actions to idle on explicit cancel, reset, and destroy", async () => {
    const cards = actionCardStore()
    const registry = new ActionRegistry()
    registry.register({ type: "slow", run: () => new Promise(() => {}) })

    const runtime = createActionRuntime({ registry, cardStore: cards })
    const cancelled = runtime.dispatch({ type: "slow", params: {}, cardId: "one" })
    expect(runtime.cancel(getActionKey("slow", undefined, "one"))).toBe(true)
    await expect(cancelled).rejects.toBeInstanceOf(ActionAbortedError)
    expect(cards.get("one")?.action).toEqual({ status: "idle" })

    const reset = runtime.dispatch({ type: "slow", params: {}, cardId: "one" })
    runtime.reset()
    await expect(reset).rejects.toBeInstanceOf(ActionAbortedError)
    expect(cards.get("one")?.action).toEqual({ status: "idle" })

    const destroy = runtime.dispatch({ type: "slow", params: {}, cardId: "one" })
    runtime.destroy()
    await expect(destroy).rejects.toBeInstanceOf(ActionAbortedError)
    expect(cards.get("one")?.action).toEqual({ status: "idle" })
  })

  it("does not apply a stale action result, but still resolves its promise", async () => {
    const cards = actionCardStore()
    const first = deferred<unknown>()
    const latest = deferred<unknown>()
    const registry = new ActionRegistry()
    registry.register({ type: "save", run: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(latest.promise) })
    const runtime = createActionRuntime({ registry, cardStore: cards })
    const oldPromise = runtime.dispatch({ type: "save", params: {}, cardId: "one" }, { owner: {} })
    const latestPromise = runtime.dispatch({ type: "save", params: {}, cardId: "one" }, { owner: {} })

    first.resolve({ op: "merge", cardId: "one", data: { count: 4 } })
    await expect(oldPromise).resolves.toMatchObject({ op: "merge" })
    expect(cards.get("one")?.revision).toBe(0)
    latest.resolve({ op: "merge", cardId: "one", data: { count: 3 } })
    await latestPromise
    expect(cards.get("one")).toMatchObject({ revision: 1, data: expect.objectContaining({ count: 3 }), action: { status: "success" } })
  })

  it("does not apply an older result from a different action type on the same card", async () => {
    const cards = actionCardStore()
    const old = deferred<unknown>()
    const latest = deferred<unknown>()
    const registry = new ActionRegistry()
    registry.register({ type: "old", run: () => old.promise })
    registry.register({ type: "latest", run: () => latest.promise })
    const runtime = createActionRuntime({ registry, cardStore: cards })
    const oldPromise = runtime.dispatch({ type: "old", params: {}, cardId: "one" })
    const latestPromise = runtime.dispatch({ type: "latest", params: {}, cardId: "one" })

    old.resolve({ op: "merge", cardId: "one", data: { count: 8 } })
    await oldPromise
    expect(cards.get("one")?.revision).toBe(0)
    latest.resolve({ op: "merge", cardId: "one", data: { count: 2 } })
    await latestPromise
    expect(cards.get("one")).toMatchObject({ revision: 1, data: expect.objectContaining({ count: 2 }) })
  })

  it("applies action patch batches atomically", async () => {
    const cards = actionCardStore()
    cards.register({ id: "two", type: "counter", data: { count: 1 } })
    const registry = new ActionRegistry()
    registry.register({ type: "save", run: () => ({ op: "batch", patches: [
      { op: "merge", cardId: "one", data: { count: 2 } },
      { op: "merge", cardId: "two", data: { count: -1 } },
    ] }) })
    const runtime = createActionRuntime({ registry, cardStore: cards })
    await expect(runtime.dispatch({ type: "save", params: {}, cardId: "one" })).rejects.toBeInstanceOf(ActionExecutionError)
    expect(cards.get("one")?.revision).toBe(0)
    expect(cards.get("two")?.revision).toBe(0)
  })

  it("rejects a cross-card action patch when its target changed after the handler started", async () => {
    const cards = actionCardStore()
    cards.register({ id: "two", type: "counter", data: { count: 1 } })
    const result = deferred<unknown>()
    const registry = new ActionRegistry()
    registry.register({ type: "copy", run: () => result.promise })
    const runtime = createActionRuntime({ registry, cardStore: cards })

    const promise = runtime.dispatch({ type: "copy", params: {}, cardId: "one" })
    cards.apply({ op: "merge", cardId: "two", data: { count: 5 } })
    result.resolve({ op: "merge", cardId: "two", data: { count: 9 } })

    await expect(promise).rejects.toBeInstanceOf(ActionExecutionError)
    expect(cards.get("two")).toMatchObject({ revision: 1, data: expect.objectContaining({ count: 5 }) })
    expect(cards.get("one")?.action.status).toBe("error")
  })

  it("protects automatic patches even when the request has no source card", async () => {
    const cards = actionCardStore()
    const result = deferred<unknown>()
    const registry = new ActionRegistry()
    registry.register({ type: "refresh", run: () => result.promise })
    const runtime = createActionRuntime({ registry, cardStore: cards })

    const promise = runtime.dispatch({ type: "refresh", params: {} })
    cards.apply({ op: "merge", cardId: "one", data: { count: 4 } })
    result.resolve({ op: "merge", cardId: "one", data: { count: 8 } })

    await expect(promise).rejects.toBeInstanceOf(ActionExecutionError)
    expect(cards.get("one")).toMatchObject({ revision: 1, data: expect.objectContaining({ count: 4 }) })
  })

  it("captures action concurrency in O(1) without reading all revisions", async () => {
    const cards = actionCardStore()
    const revisions = vi.spyOn(cards, "revisions")
    const captureMutationEpoch = vi.spyOn(cards, "captureMutationEpoch")
    const registry = new ActionRegistry()
    registry.register({ type: "refresh", run: () => ({ op: "merge", cardId: "one", data: { count: 2 } }) })
    const runtime = createActionRuntime({ registry, cardStore: cards })

    await runtime.dispatch({ type: "refresh", params: {} })

    expect(captureMutationEpoch).toHaveBeenCalledOnce()
    expect(revisions).not.toHaveBeenCalled()
  })

  it("rejects a stale batch atomically when any target changed during the action", async () => {
    const cards = actionCardStore()
    cards.register({ id: "two", type: "counter", data: { count: 1 } })
    const result = deferred<unknown>()
    const registry = new ActionRegistry()
    registry.register({ type: "refresh", run: () => result.promise })
    const runtime = createActionRuntime({ registry, cardStore: cards })

    const promise = runtime.dispatch({ type: "refresh", params: {} })
    cards.apply({ op: "merge", cardId: "two", data: { count: 5 } })
    result.resolve({ op: "batch", patches: [
      { op: "merge", cardId: "one", data: { count: 2 } },
      { op: "merge", cardId: "two", data: { count: 8 } },
    ] })

    await expect(promise).rejects.toBeInstanceOf(ActionExecutionError)
    expect(cards.get("one")).toMatchObject({ revision: 0, data: expect.objectContaining({ count: 1 }) })
    expect(cards.get("two")).toMatchObject({ revision: 1, data: expect.objectContaining({ count: 5 }) })
  })
})

function actionCardStore(): CardStore {
  const registry = new CardRegistry()
  registry.register({
    type: "counter",
    description: "counter",
    schema: { type: "object", required: ["count"], properties: { count: { type: "integer", minimum: 0 } } },
  })
  const store = new CardStore({ registry })
  store.register({ id: "one", type: "counter", data: { count: 1 } })
  return store
}
