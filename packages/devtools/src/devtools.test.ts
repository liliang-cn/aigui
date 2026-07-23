import { describe, expect, it, vi } from "vitest"
import { ActionRegistry, CardStore, Renderer, createActionRuntime } from "@ai-gui/core"
import { createDevTools } from "./index"

describe("devtools timeline", () => {
  it("attaches multiple runtimes into one ordered timeline", async () => {
    let now = 100
    const renderer = new Renderer({ debug: true })
    const cards = new CardStore({ debug: true })
    const registry = new ActionRegistry()
    registry.register({ type: "refresh", run: () => ({ ok: true }) })
    const actions = createActionRuntime({ registry, debug: true })
    const devtools = createDevTools({ now: () => ++now })
    devtools.attach(renderer, actions, cards)

    renderer.push("hello")
    cards.register({ id: "one", type: "demo", data: { id: "one" } })
    await actions.dispatch({ type: "refresh", params: {} })

    const timeline = devtools.snapshot()
    expect(timeline.map((event) => event.sequence)).toEqual(timeline.map((_, index) => index + 1))
    expect(timeline.map((event) => event.timestamp)).toEqual([...timeline.map((event) => event.timestamp)].sort((a, b) => a - b))
    expect(new Set(timeline.map((event) => event.source))).toEqual(new Set(["renderer", "action-runtime", "card-store"]))
  })

  it("bounds retained events and reports dropped entries", () => {
    const renderer = new Renderer({ debug: true })
    const devtools = createDevTools({ maxEvents: 3 })
    devtools.attach(renderer)
    renderer.push("a")
    renderer.push("b")
    renderer.push("c")

    const snapshot = devtools.snapshot()
    expect(snapshot).toHaveLength(3)
    expect(snapshot[0].sequence).toBeGreaterThan(1)
    expect(devtools.stats().dropped).toBeGreaterThan(0)
  })

  it("redacts sensitive keys and truncates payloads before storage", async () => {
    const registry = new ActionRegistry()
    registry.register({ type: "login", run: (params) => params })
    const runtime = createActionRuntime({ registry, debug: true })
    const devtools = createDevTools({ maxStringLength: 8, redact: ({ key }) => key === "email" })
    devtools.attach(runtime)
    await runtime.dispatch({
      type: "login",
      params: { token: "top-secret", oauthAccessTokenValue: "normalized-secret", email: "a@example.com", note: "Bearer bearer-secret?api_key=query-secret abcdefghijklmnop" },
    })

    const serialized = JSON.stringify(devtools.snapshot())
    expect(serialized).not.toContain("top-secret")
    expect(serialized).not.toContain("normalized-secret")
    expect(serialized).not.toContain("bearer-secret")
    expect(serialized).not.toContain("query-secret")
    expect(serialized).not.toContain("a@example.com")
    expect(serialized).not.toContain("abcdefghijklmnop")
    expect(serialized).toContain("[REDACTED]")
    expect(serialized).toContain("[TRUNCATED]")
  })

  it("notifies subscribers, clears, detaches, and destroys idempotently", () => {
    const renderer = new Renderer({ debug: true })
    const devtools = createDevTools()
    const detach = devtools.attach(renderer)
    const listener = vi.fn()
    const unsubscribe = devtools.subscribe(listener)
    renderer.push("one")
    expect(listener).toHaveBeenCalled()
    devtools.clear()
    expect(devtools.snapshot()).toEqual([])
    unsubscribe()
    detach()
    renderer.push("two")
    expect(devtools.snapshot()).toEqual([])
    devtools.destroy()
    devtools.destroy()
    expect(() => devtools.attach(renderer)).toThrow(/destroyed/i)
  })

  it("keeps duplicate attachments independent", () => {
    const renderer = new Renderer({ debug: true })
    const devtools = createDevTools()
    const detachFirst = devtools.attach(renderer)
    const detachSecond = devtools.attach(renderer)
    detachFirst()
    renderer.push("still attached")
    expect(devtools.snapshot().length).toBeGreaterThan(0)
    const retained = devtools.snapshot().length
    detachSecond()
    renderer.push("detached")
    expect(devtools.snapshot()).toHaveLength(retained)
  })

  it("rolls back earlier subscriptions when a later target fails", () => {
    const renderer = new Renderer({ debug: true })
    const devtools = createDevTools()
    const broken = { debugSource: "renderer" as const, subscribeDebug: () => { throw new Error("attach failed") } }
    expect(() => devtools.attach(renderer, broken)).toThrow("attach failed")
    renderer.push("not retained")
    expect(devtools.snapshot()).toEqual([])
  })
})
