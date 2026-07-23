import { effectScope } from "vue"
import { describe, expect, it, vi } from "vitest"
import { ActionRegistry, ActionRuntime, getActionKey } from "@ai-gui/core"
import { useActionState } from "./use-action-state"

describe("useActionState", () => {
  it("tracks one action key with a shallow ref and unsubscribes with its scope", async () => {
    const actions = new ActionRegistry()
    actions.register({ type: "save", run: async () => "saved" })
    const runtime = new ActionRuntime({ registry: actions })
    const unsubscribe = vi.fn()
    const subscribe = vi.spyOn(runtime, "subscribe").mockImplementation((listener) => {
      const stop = ActionRuntime.prototype.subscribe.call(runtime, listener)
      return () => { unsubscribe(); stop() }
    })
    const scope = effectScope()
    const state = scope.run(() => useActionState(runtime, getActionKey("save", "editor")))!

    expect(state.value.status).toBe("idle")
    await runtime.dispatch({ type: "save", params: {}, cardType: "other" })
    expect(state.value.status).toBe("idle")
    await runtime.dispatch({ type: "save", params: {}, cardType: "editor" })
    expect(state.value.status).toBe("success")

    scope.stop()
    expect(subscribe).toHaveBeenCalledOnce()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it("returns to idle when the runtime resets", async () => {
    const actions = new ActionRegistry()
    actions.register({ type: "save", run: async () => "saved" })
    const runtime = new ActionRuntime({ registry: actions })
    const scope = effectScope()
    const state = scope.run(() => useActionState(runtime, getActionKey("save", "editor")))!

    await runtime.dispatch({ type: "save", params: {}, cardType: "editor" })
    expect(state.value.status).toBe("success")

    runtime.reset()

    expect(state.value).toEqual({ status: "idle", key: "editor:save", type: "save", cardType: "editor" })
    scope.stop()
  })
})
