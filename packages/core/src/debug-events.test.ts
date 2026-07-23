import { describe, expect, it, vi } from "vitest"
import { ActionRegistry, CardStore, Renderer, collectNodeRenderers, createActionRuntime } from "./index"
import type { DebugEvent } from "./index"

describe("core debug events", () => {
  it("reports renderer stream, repair, AST, patch, and feed lifecycle in order", async () => {
    const events: DebugEvent[] = []
    const renderer = new Renderer({ debug: true, onDebugEvent: (event) => events.push(event) })

    await renderer.feed((async function* () {
      yield "# Hel"
      yield "lo"
    })())

    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "feed-started",
      "chunk-received",
      "markdown-repaired",
      "ast-snapshot",
      "ast-patches",
      "feed-completed",
    ]))
    expect(events.map((event) => event.sequence)).toEqual(events.map((_, index) => index + 1))
    expect(events.every((event) => Number.isFinite(event.timestamp))).toBe(true)
  })

  it("does not allocate or call debug hooks while disabled", () => {
    const hook = vi.fn()
    const renderer = new Renderer({ onDebugEvent: hook })
    renderer.push("hello")
    expect(hook).not.toHaveBeenCalled()
  })

  it("reports action states without exposing Error causes", async () => {
    const events: DebugEvent[] = []
    const registry = new ActionRegistry()
    registry.register({
      type: "account.load",
      run() {
        throw new Error("outer", { cause: new Error("secret handler detail") })
      },
    })
    const runtime = createActionRuntime({ registry, debug: true, onDebugEvent: (event) => events.push(event) })

    await expect(runtime.dispatch({ type: "account.load", params: { token: "secret" } })).rejects.toThrow()

    const serialized = JSON.stringify(events)
    expect(events.some((event) => event.type === "action-state" && event.data.status === "pending")).toBe(true)
    expect(events.some((event) => event.type === "action-error")).toBe(true)
    expect(serialized).not.toContain("secret handler detail")
    expect(serialized).not.toContain("cause")
  })

  it("reports card snapshots and the patch that produced each change", () => {
    const events: DebugEvent[] = []
    const store = new CardStore({ debug: true, onDebugEvent: (event) => events.push(event) })
    store.register({ id: "weather", type: "weather", data: { id: "weather", temp: 20 } })
    store.apply({ op: "merge", cardId: "weather", data: { temp: 21 } })

    expect(events.some((event) => event.type === "card-store-change")).toBe(true)
    expect(events.some((event) => event.type === "card-store-patch" && event.data.patch.op === "merge")).toBe(true)
  })

  it("supports dynamic listeners and removes them cleanly", () => {
    const renderer = new Renderer({ debug: true })
    const listener = vi.fn()
    const unsubscribe = renderer.subscribeDebug(listener)
    renderer.push("one")
    unsubscribe()
    renderer.push("two")
    expect(listener).toHaveBeenCalled()
    const count = listener.mock.calls.length
    renderer.push("three")
    expect(listener).toHaveBeenCalledTimes(count)
  })

  it("reports synchronous and asynchronous plugin render lifecycle", async () => {
    const events: DebugEvent[] = []
    const renderers = collectNodeRenderers([{
      name: "demo",
      nodeRenderers: {
        sync: () => ({ kind: "html", html: "ok" }),
        async: async () => ({ kind: "html", html: "later" }),
      },
    }], { debug: true, onDebugEvent: (event) => events.push(event) })

    renderers.sync({ key: "1", type: "sync" })
    await renderers.async({ key: "2", type: "async" })

    expect(events.map((event) => event.type)).toEqual([
      "plugin-render-started",
      "plugin-render-completed",
      "plugin-render-started",
      "async-output-resolved",
      "plugin-render-completed",
    ])
  })
})
