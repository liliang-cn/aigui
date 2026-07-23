// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ActionRegistry, createActionRuntime, getActionKey } from "@ai-gui/core"
import { useActionState } from "./use-action-state"

describe("useActionState", () => {
  it("subscribes to runtime state for the requested key", async () => {
    const registry = new ActionRegistry()
    let resolve!: (value: string) => void
    registry.register({ type: "save", run: () => new Promise<string>((done) => { resolve = done }) })
    const runtime = createActionRuntime({ registry })
    const { result } = renderHook(() => useActionState(runtime, "editor:save"))

    expect(result.current).toMatchObject({ status: "idle", key: "editor:save", type: "save", cardType: "editor" })
    let dispatched!: Promise<unknown>
    act(() => {
      dispatched = runtime.dispatch({ type: "save", params: {}, cardType: "editor" })
    })
    expect(result.current.status).toBe("pending")

    resolve("saved")
    await act(async () => { await dispatched })
    await waitFor(() => expect(result.current).toMatchObject({ status: "success", result: "saved" }))
  })

  it("returns an idle snapshot during SSR", () => {
    const registry = new ActionRegistry()
    registry.register({ type: "save", run: () => new Promise(() => {}) })
    const runtime = createActionRuntime({ registry })
    void runtime.dispatch({ type: "save", params: {}, cardType: "editor" }).catch(() => {})

    function State() {
      return createElement("span", null, useActionState(runtime, "editor:save").status)
    }

    expect(renderToString(createElement(State))).toContain("idle")
    runtime.reset()
  })

  it("returns to idle when the runtime resets", async () => {
    const registry = new ActionRegistry()
    registry.register({ type: "save", run: () => "saved" })
    const runtime = createActionRuntime({ registry })
    const { result } = renderHook(() => useActionState(runtime, "editor:save"))

    await act(async () => { await runtime.dispatch({ type: "save", params: {}, cardType: "editor" }) })
    expect(result.current.status).toBe("success")

    act(() => runtime.reset())

    expect(result.current).toMatchObject({ status: "idle", key: "editor:save", type: "save", cardType: "editor" })
  })

  it("returns idle when runtime is undefined", () => {
    const { result } = renderHook(() => useActionState(undefined, "editor:save"))

    expect(result.current).toMatchObject({ status: "idle", key: "editor:save", type: "save", cardType: "editor" })
  })

  it("decodes an encoded action key for the idle snapshot", () => {
    const key = getActionKey("save:now", "editor:main")
    const { result } = renderHook(() => useActionState(undefined, key))

    expect(result.current).toEqual({ status: "idle", key, type: "save:now", cardType: "editor:main" })
  })
})
