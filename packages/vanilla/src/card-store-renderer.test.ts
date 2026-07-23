// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import {
  ActionRegistry,
  CardRegistry,
  CardStore,
  createActionRuntime,
  type CardAction,
} from "@ai-gui/core"
import { createRenderer, type VanillaCardInstance } from "./index"
import { createReconcileState, reconcile } from "./reconcile"

function counterRegistry(render: (data: any, api: any) => HTMLElement | VanillaCardInstance) {
  const registry = new CardRegistry()
  registry.register({
    type: "counter",
    description: "counter",
    schema: {
      type: "object",
      required: ["id", "count"],
      properties: { id: { type: "string" }, count: { type: "number" } },
      additionalProperties: false,
    },
    render,
  })
  return registry
}

function source(id: string, count: number) {
  return `\`\`\`card:counter\n${JSON.stringify({ id, count })}\n\`\`\``
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

describe("createRenderer cardStore integration", () => {
  it("creates a card instance once and updates it without replacing host, element, or local input state", () => {
    const updates: Array<{ data: any; state: CardAction }> = []
    const factory = vi.fn((data: any, api: any): VanillaCardInstance => {
      const element = document.createElement("section")
      const output = document.createElement("span")
      const input = document.createElement("input")
      input.value = "local"
      element.append(output, input)
      const paint = (next: any, state: CardAction) => {
        output.textContent = `${next.count}:${state.status}`
      }
      paint(data, api.state)
      return {
        element,
        update(next, nextApi) {
          updates.push({ data: next, state: nextApi.state })
          paint(next, nextApi.state)
        },
      }
    })
    const registry = counterRegistry(factory)
    const store = new CardStore()
    const container = document.createElement("div")
    const renderer = createRenderer(container, { registry, cardStore: store })

    renderer.push(source("one", 1))
    const host = container.querySelector<HTMLElement>("[data-aigui-card]")!
    const element = container.querySelector("section")!
    const input = container.querySelector("input")!
    input.value = "edited"
    store.apply({ op: "merge", cardId: "one", data: { count: 2 } })

    expect(factory).toHaveBeenCalledOnce()
    expect(container.querySelector("[data-aigui-card]")).toBe(host)
    expect(container.querySelector("section")).toBe(element)
    expect(container.querySelector("input")).toBe(input)
    expect(input.value).toBe("edited")
    expect(element.querySelector("span")?.textContent).toBe("2:idle")
    expect(updates.at(-1)?.data).toEqual({ id: "one", count: 2 })
  })

  it("reconciles AST card data through the controller without replacing DOM", () => {
    const update = vi.fn()
    const registry = counterRegistry((): VanillaCardInstance => ({
      element: document.createElement("span"),
      update,
    }))
    const container = document.createElement("div")
    const state = createReconcileState()
    const ctx = { registry }
    const first = { key: "card", type: "card", card: { id: "one", type: "counter", data: { id: "one", count: 1 }, complete: true, valid: true } }
    const second = { key: "card", type: "card", card: { id: "one", type: "counter", data: { id: "one", count: 2 }, complete: true, valid: true } }

    reconcile(container, [first], ctx, state)
    const host = container.firstElementChild
    const element = container.querySelector("span")
    reconcile(container, [second], ctx, state)

    expect(container.firstElementChild).toBe(host)
    expect(container.querySelector("span")).toBe(element)
    expect(update).toHaveBeenCalledWith(
      { id: "one", count: 2 },
      expect.objectContaining({ state: { status: "idle" }, onAction: expect.any(Function) }),
    )
  })

  it("updates only the targeted card and shares updates across renderers", () => {
    const registry = counterRegistry((data: any, api: any): VanillaCardInstance => {
      const element = document.createElement("span")
      const paint = (next: any) => { element.textContent = `${next.id}:${next.count}` }
      paint(data)
      return { element, update: paint }
    })
    const store = new CardStore()
    const firstEl = document.createElement("div")
    const secondEl = document.createElement("div")
    const first = createRenderer(firstEl, { registry, cardStore: store })
    const second = createRenderer(secondEl, { registry, cardStore: store })

    first.push(`${source("one", 1)}\n\n${source("two", 2)}`)
    second.push(source("one", 999))
    const firstOne = firstEl.querySelectorAll("span")[0]
    const firstTwo = firstEl.querySelectorAll("span")[1]
    const sharedOne = secondEl.querySelector("span")
    store.apply({ op: "merge", cardId: "one", data: { count: 3 } })

    expect(firstOne.textContent).toBe("one:3")
    expect(sharedOne?.textContent).toBe("one:3")
    expect(firstTwo.textContent).toBe("two:2")
    expect(secondEl.querySelector("span")).toBe(sharedOne)
  })

  it("restores snapshots through update without replacing the card element", () => {
    const update = vi.fn((data: any, _api: any) => { element.textContent = String(data.count) })
    const element = document.createElement("span")
    const registry = counterRegistry((data: any): VanillaCardInstance => {
      element.textContent = String(data.count)
      return { element, update }
    })
    const store = new CardStore({ registry })
    const container = document.createElement("div")
    const renderer = createRenderer(container, { registry, cardStore: store })
    renderer.push(source("one", 1))
    const mountedElement = container.querySelector("span")

    store.restore({ version: 1, cards: [{ id: "one", type: "counter", data: { id: "one", count: 7 }, revision: 4 }] })

    expect(container.querySelector("span")).toBe(mountedElement)
    expect(mountedElement?.textContent).toBe("7")
    expect(update).toHaveBeenCalledWith(
      { id: "one", count: 7 },
      expect.objectContaining({ state: { status: "idle" }, onAction: expect.any(Function) }),
    )
  })

  it.each([
    ["delete", (store: CardStore) => store.delete("one")],
    ["clear", (store: CardStore) => store.clear()],
    ["restore-delete", (store: CardStore) => store.restore({ version: 1, cards: [] })],
  ])("shows a missing fallback instead of stale data after store %s", (_name, remove) => {
    const registry = counterRegistry((data: any): VanillaCardInstance => {
      const element = document.createElement("span")
      element.textContent = String(data.count)
      return { element, update: (next: any) => { element.textContent = String(next.count) } }
    })
    const store = new CardStore({ registry })
    const container = document.createElement("div")
    const renderer = createRenderer(container, { registry, cardStore: store })
    renderer.push(source("one", 1))

    remove(store)

    expect(container.querySelector("span")).toBeNull()
    expect(container.querySelector("[data-aigui-card-missing]")).toBeTruthy()
    expect(container.textContent).not.toContain("1")
  })

  it("recovers a missing card through the original controller and managed instance", () => {
    const update = vi.fn((data: any) => { element.textContent = String(data.count) })
    const element = document.createElement("span")
    const factory = vi.fn((data: any): VanillaCardInstance => {
      element.textContent = String(data.count)
      return { element, update }
    })
    const registry = counterRegistry(factory)
    const store = new CardStore()
    const container = document.createElement("div")
    const renderer = createRenderer(container, { registry, cardStore: store })
    renderer.push(source("one", 1))
    const host = container.querySelector<HTMLElement>("[data-aigui-card]")!
    const mountedElement = container.querySelector("span")

    store.delete("one")
    store.restore({ version: 1, cards: [{ id: "one", type: "other", data: { value: "wrong" }, revision: 1 }] })
    expect(host.hasAttribute("data-aigui-card-missing")).toBe(true)
    expect(container.querySelector("span")).toBeNull()
    store.restore({ version: 1, cards: [{ id: "one", type: "counter", data: { id: "one", count: 9 }, revision: 2 }] })

    expect(factory).toHaveBeenCalledOnce()
    expect(container.querySelector("[data-aigui-card]")).toBe(host)
    expect(container.querySelector("span")).toBe(mountedElement)
    expect(host.hasAttribute("data-aigui-card-missing")).toBe(false)
    expect(mountedElement?.textContent).toBe("9")
    expect(update).toHaveBeenLastCalledWith(
      { id: "one", count: 9 },
      expect.objectContaining({ state: { status: "idle" }, onAction: expect.any(Function) }),
    )
  })

  it("rebuilds only legacy HTMLElement content when store state changes", () => {
    const factory = vi.fn((data: any) => {
      const element = document.createElement("span")
      element.textContent = String(data.count)
      return element
    })
    const registry = counterRegistry(factory)
    const store = new CardStore()
    const container = document.createElement("div")
    const renderer = createRenderer(container, { registry, cardStore: store })
    renderer.push(source("one", 1))
    const host = container.querySelector("[data-aigui-card]")
    const firstElement = container.querySelector("span")

    store.apply({ op: "merge", cardId: "one", data: { count: 2 } })

    expect(factory).toHaveBeenCalledTimes(2)
    expect(container.querySelector("[data-aigui-card]")).toBe(host)
    expect(container.querySelector("span")).not.toBe(firstElement)
    expect(container.querySelector("span")?.textContent).toBe("2")
  })

  it.each(["reset", "destroy"] as const)("%s unsubscribes and destroys a card instance exactly once without clearing the external store", (method) => {
    const destroy = vi.fn()
    const update = vi.fn()
    const registry = counterRegistry((): VanillaCardInstance => ({
      element: document.createElement("span"),
      update,
      destroy,
    }))
    const store = new CardStore({ registry })
    const container = document.createElement("div")
    const renderer = createRenderer(container, { registry, cardStore: store })
    renderer.push(source("one", 1))

    renderer[method]()
    renderer[method]()
    store.apply({ op: "merge", cardId: "one", data: { count: 2 } })

    expect(destroy).toHaveBeenCalledOnce()
    expect(update).not.toHaveBeenCalled()
    expect(store.get("one")?.data).toEqual({ id: "one", count: 2 })
  })

  it("keeps cards without ids on the legacy non-store path", () => {
    const registry = new CardRegistry()
    const factory = vi.fn(() => document.createElement("span"))
    registry.register({ type: "plain", description: "plain", render: factory })
    const store = new CardStore({ registry })
    const container = document.createElement("div")
    const renderer = createRenderer(container, { registry, cardStore: store })

    renderer.push("```card:plain\n{\"value\":1}\n```")

    expect(factory).toHaveBeenCalledOnce()
    expect(store.list()).toEqual([])
  })

  it("recovers a managed card after its initial registration conflicts, then updates and cleans up", () => {
    const update = vi.fn((data: any) => { element.textContent = String(data.count) })
    const destroy = vi.fn()
    const element = document.createElement("span")
    const factory = vi.fn((data: any): VanillaCardInstance => {
      element.textContent = String(data.count)
      return { element, update, destroy }
    })
    const registry = counterRegistry(factory)
    const store = new CardStore()
    store.register({ id: "one", type: "other", data: {} })
    const unsubscribe = vi.fn()
    const subscribe = vi.spyOn(store, "subscribe").mockImplementation((_id, listener) => {
      const original = CardStore.prototype.subscribe.call(store, _id, listener)
      return () => { unsubscribe(); original() }
    })
    const container = document.createElement("div")
    const renderer = createRenderer(container, { registry, cardStore: store })

    expect(() => renderer.push(source("one", 1))).not.toThrow()
    const host = container.querySelector<HTMLElement>("[data-aigui-card]")!
    expect(host.hasAttribute("data-aigui-card-store-error")).toBe(true)
    expect(factory).not.toHaveBeenCalled()
    expect(subscribe).toHaveBeenCalledWith("one", expect.any(Function))

    store.restore({ version: 1, cards: [{ id: "one", type: "counter", data: { id: "one", count: 4 }, revision: 1 }] })
    expect(factory).toHaveBeenCalledOnce()
    expect(container.querySelector("[data-aigui-card]")).toBe(host)
    expect(container.querySelector("span")).toBe(element)
    expect(element.textContent).toBe("4")
    expect(host.hasAttribute("data-aigui-card-store-error")).toBe(false)

    store.apply({ op: "merge", cardId: "one", data: { count: 5 } })
    expect(factory).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledWith(
      { id: "one", count: 5 },
      expect.objectContaining({ state: { status: "idle" }, onAction: expect.any(Function) }),
    )

    renderer.reset()
    store.apply({ op: "merge", cardId: "one", data: { count: 6 } })
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(destroy).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledOnce()
  })

  it("registers an identified card without a factory before rendering its fallback", () => {
    const registry = new CardRegistry()
    registry.register({
      type: "data-only",
      description: "data only",
      schema: {
        type: "object",
        required: ["id", "value"],
        properties: { id: { type: "string" }, value: { type: "number" } },
        additionalProperties: false,
      },
    })
    const store = new CardStore({ registry })
    const container = document.createElement("div")
    const renderer = createRenderer(container, { registry, cardStore: store })

    renderer.push('```card:data-only\n{"id":"one","value":3}\n```')

    expect(store.get("one")).toMatchObject({ type: "data-only", data: { id: "one", value: 3 } })
    expect(container.querySelector("[data-aigui-card-fallback]")).toBeTruthy()
  })

  it("recovers and updates a fallback without a factory after its initial registration conflicts, then cleans up", () => {
    const registry = new CardRegistry()
    registry.register({ type: "data-only", description: "data only" })
    const store = new CardStore()
    store.register({ id: "one", type: "other", data: {} })
    const unsubscribe = vi.fn()
    const subscribe = vi.spyOn(store, "subscribe").mockImplementation((_id, listener) => {
      const original = CardStore.prototype.subscribe.call(store, _id, listener)
      return () => { unsubscribe(); original() }
    })
    const container = document.createElement("div")
    const renderer = createRenderer(container, { registry, cardStore: store })

    renderer.push('```card:data-only\n{"id":"one","value":1}\n```')
    const fallback = container.querySelector<HTMLElement>("[data-aigui-card-fallback]")!
    expect(fallback.hasAttribute("data-aigui-card-store-error")).toBe(true)
    expect(subscribe).toHaveBeenCalledWith("one", expect.any(Function))

    store.restore({ version: 1, cards: [{ id: "one", type: "data-only", data: { id: "one", value: 3 }, revision: 1 }] })
    expect(container.querySelector("[data-aigui-card-fallback]")).toBe(fallback)
    expect(fallback.hasAttribute("data-aigui-card-store-error")).toBe(false)
    expect(fallback.textContent).toContain('"value": 3')

    store.apply({ op: "merge", cardId: "one", data: { value: 4 } })
    expect(fallback.textContent).toContain('"value": 4')

    renderer.reset()
    store.apply({ op: "merge", cardId: "one", data: { value: 5 } })
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(fallback.textContent).toContain('"value": 4')
  })

  it("includes cardId in callbacks and runtime dispatch while action state and result patches update the instance", async () => {
    const pending = deferred<{ op: "merge"; cardId: string; data: { count: number } }>()
    const actions = new ActionRegistry()
    const run = vi.fn((_params, context) => pending.promise)
    actions.register({ type: "increment", run })
    const states: string[] = []
    const registry = counterRegistry((data: any, api: any): VanillaCardInstance => {
      const element = document.createElement("button")
      element.onclick = () => api.onAction({ type: "increment", params: { by: 1 } })
      const paint = (next: any, nextApi: any) => {
        element.textContent = `${next.count}:${nextApi.state.status}`
        element.onclick = () => nextApi.onAction({ type: "increment", params: { by: 1 } })
        states.push(nextApi.state.status)
      }
      paint(data, api)
      return { element, update: paint }
    })
    const store = new CardStore({ registry })
    const runtime = createActionRuntime({ registry: actions, cardStore: store })
    const onCardAction = vi.fn()
    const container = document.createElement("div")
    const renderer = createRenderer(container, { registry, cardStore: store, actionRuntime: runtime, onCardAction })
    renderer.push(source("one", 1))

    container.querySelector("button")!.click()
    expect(onCardAction).toHaveBeenCalledWith({ type: "increment", params: { by: 1 }, cardType: "counter", cardId: "one" })
    expect(run).toHaveBeenCalledWith({ by: 1 }, expect.objectContaining({ cardId: "one", cardType: "counter" }))
    expect(container.querySelector("button")?.textContent).toBe("1:loading")

    pending.resolve({ op: "merge", cardId: "one", data: { count: 2 } })
    await vi.waitFor(() => expect(container.querySelector("button")?.textContent).toBe("2:success"))
    expect(states).toContain("loading")
    expect(states).toContain("success")
  })
})
