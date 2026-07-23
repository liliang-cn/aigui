// @vitest-environment jsdom
import { mount } from "@vue/test-utils"
import { defineComponent, effectScope, h, nextTick, ref } from "vue"
import { describe, expect, it, vi } from "vitest"
import { ActionAbortedError, ActionRegistry, ActionRuntime, ActionValidationError, CardRegistry, CardStore } from "@ai-gui/core"
import { AIRenderer } from "./ai-renderer"
import { useActionState } from "./use-action-state"

function createPollRegistry(params: unknown = { q: "x" }) {
  const registry = new CardRegistry()
  const Poll = defineComponent({
    emits: ["action"],
    setup(_, { emit }) {
      return () => h("button", { onClick: () => emit("action", { type: "vote", params }) }, "vote")
    },
  })
  registry.register({ type: "poll", description: "p", render: Poll })
  return registry
}

async function mountPoll(actionRuntime?: ActionRuntime, params?: unknown) {
  const wrapper = mount(AIRenderer, { props: { registry: createPollRegistry(params), actionRuntime } })
  ;(wrapper.vm as any).push('```card:poll\n{}\n```')
  await nextTick()
  return wrapper
}

describe("AIRenderer", () => {
  it("exposes imperative push and renders", async () => {
    const w = mount(AIRenderer)
    ;(w.vm as any).push("# Hi")
    await nextTick()
    expect(w.find("h1").text()).toBe("Hi")
  })
  it("renders a card and routes onCardAction", async () => {
    const registry = new CardRegistry()
    const Poll = defineComponent({ props: ["data"], emits: ["action"], setup(props, { emit }) { return () => h("button", { onClick: () => emit("action", { type: "vote", params: props.data }) }, "vote") } })
    registry.register({ type: "poll", description: "p", render: Poll })
    const onCardAction = vi.fn()
    const w = mount(AIRenderer, { props: { registry, onCardAction } })
    ;(w.vm as any).push('```card:poll\n{"q":"x"}\n```')
    await nextTick()
    await w.find("button").trigger("click")
    expect(onCardAction).toHaveBeenCalledWith({ type: "vote", params: { q: "x" }, cardType: "poll" })
    expect(onCardAction).toHaveBeenCalledOnce()
  })
  it("routes template card-action listeners exactly once", async () => {
    const onCardAction = vi.fn()
    const Parent = defineComponent({
      components: { AIRenderer },
      setup() { return { registry: createPollRegistry(), onCardAction } },
      template: '<AIRenderer ref="renderer" :registry="registry" @card-action="onCardAction" />',
    })
    const w = mount(Parent)
    ;(w.getComponent(AIRenderer).vm as any).$?.exposed.push('```card:poll\n{}\n```')
    await nextTick()

    await w.find("button").trigger("click")

    expect(onCardAction).toHaveBeenCalledOnce()
    expect(onCardAction).toHaveBeenCalledWith({ type: "vote", params: { q: "x" }, cardType: "poll" })
  })
  it("does not mutate frozen vnode props while emitting", async () => {
    const onCardAction = vi.fn()
    const frozenProps = Object.freeze({ registry: createPollRegistry(), onCardAction })
    const Parent = defineComponent({
      setup() { return () => h(AIRenderer, frozenProps) },
    })
    const errorHandler = vi.fn()
    const w = mount(Parent, { global: { config: { errorHandler } } })
    ;(w.getComponent(AIRenderer).vm as any).$?.exposed.push('```card:poll\n{}\n```')
    await nextTick()

    await w.find("button").trigger("click")

    expect(onCardAction).toHaveBeenCalledOnce()
    expect(errorHandler).not.toHaveBeenCalled()
  })
  it("emits the standard card-action event", async () => {
    const registry = new CardRegistry()
    const Poll = defineComponent({ emits: ["action"], setup(_, { emit }) { return () => h("button", { onClick: () => emit("action", { type: "vote" }) }, "vote") } })
    registry.register({ type: "poll", description: "p", render: Poll })
    const w = mount(AIRenderer, { props: { registry } })
    ;(w.vm as any).push('```card:poll\n{}\n```')
    await nextTick(); await w.find("button").trigger("click")
    expect(w.emitted("card-action")?.[0]).toEqual([{ type: "vote", cardType: "poll" }])
  })
  it("registers complete valid identified cards and updates data and state without remounting", async () => {
    const registry = new CardRegistry()
    const store = new CardStore({ registry })
    let setups = 0
    const Counter = defineComponent({
      props: ["data", "state"],
      setup(props) {
        setups++
        const local = ref(0)
        return () => h("button", {
          "data-state": props.state.status,
          onClick: () => local.value++,
        }, `${props.data.count}:${local.value}`)
      },
    })
    registry.register({ type: "counter", description: "counter", render: Counter })
    const w = mount(AIRenderer, { props: { registry, cardStore: store } })

    ;(w.vm as any).push('```card:counter\n{"id":"one","count":1}\n```')
    await nextTick()
    const element = w.find("button").element
    expect(store.get("one")).toMatchObject({ id: "one", type: "counter", data: { id: "one", count: 1 }, action: { status: "idle" } })

    await w.find("button").trigger("click")
    store.apply({ op: "merge", cardId: "one", data: { count: 2 } })
    store.beginAction("one", "save:1")
    await nextTick()

    expect(w.find("button").text()).toBe("2:1")
    expect(w.find("button").attributes("data-state")).toBe("loading")
    expect(w.find("button").element).toBe(element)
    expect(setups).toBe(1)
  })
  it("adds cardId to emitted actions and runtime dispatch for identified cards", async () => {
    const registry = createPollRegistry()
    const store = new CardStore({ registry })
    const actions = new ActionRegistry()
    actions.register({ type: "vote", run: vi.fn() })
    const runtime = new ActionRuntime({ registry: actions, cardStore: store })
    const dispatch = vi.spyOn(runtime, "dispatch")
    const w = mount(AIRenderer, { props: { registry, cardStore: store, actionRuntime: runtime } })

    ;(w.vm as any).push('```card:poll\n{"id":"poll-one"}\n```')
    await nextTick()
    await w.find("button").trigger("click")

    expect(dispatch).toHaveBeenCalledWith(
      { type: "vote", params: { q: "x" }, cardType: "poll", cardId: "poll-one" },
      expect.anything(),
    )
    expect(w.emitted("card-action")?.[0]).toEqual([{ type: "vote", params: { q: "x" }, cardType: "poll", cardId: "poll-one" }])
  })
  it("patches only the targeted identified card", async () => {
    const registry = new CardRegistry()
    const store = new CardStore({ registry })
    const Counter = defineComponent({ props: ["data"], setup: (props) => () => h("span", { "data-id": props.data.id }, props.data.count) })
    registry.register({ type: "counter", description: "counter", render: Counter })
    const w = mount(AIRenderer, { props: { registry, cardStore: store } })

    ;(w.vm as any).push('```card:counter\n{"id":"one","count":1}\n```\n```card:counter\n{"id":"two","count":2}\n```')
    await nextTick()
    store.apply({ op: "merge", cardId: "two", data: { count: 3 } })
    await nextTick()

    expect(w.find('[data-id="one"]').text()).toBe("1")
    expect(w.find('[data-id="two"]').text()).toBe("3")
  })
  it("shares one card store across renderers", async () => {
    const registry = new CardRegistry()
    const store = new CardStore({ registry })
    const Counter = defineComponent({ props: ["data"], setup: (props) => () => h("span", props.data.count) })
    registry.register({ type: "counter", description: "counter", render: Counter })
    const first = mount(AIRenderer, { props: { registry, cardStore: store } })
    const second = mount(AIRenderer, { props: { registry, cardStore: store } })
    const source = '```card:counter\n{"id":"shared","count":1}\n```'

    ;(first.vm as any).push(source)
    ;(second.vm as any).push(source)
    await nextTick()
    store.apply({ op: "merge", cardId: "shared", data: { count: 2 } })
    await nextTick()

    expect(first.find("span").text()).toBe("2")
    expect(second.find("span").text()).toBe("2")
  })
  it("unsubscribes on reset and unmount without clearing an external store", async () => {
    const registry = createPollRegistry()
    const store = new CardStore({ registry })
    const unsubscribe = vi.fn()
    const subscribe = vi.spyOn(store, "subscribe").mockImplementation((id, listener) => {
      const stop = CardStore.prototype.subscribe.call(store, id, listener)
      return () => { unsubscribe(); stop() }
    })
    const w = mount(AIRenderer, { props: { registry, cardStore: store } })

    ;(w.vm as any).push('```card:poll\n{"id":"one"}\n```')
    await nextTick()
    expect(subscribe).toHaveBeenCalledWith("one", expect.any(Function))
    ;(w.vm as any).reset()
    await nextTick()
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(store.get("one")).toBeDefined()

    ;(w.vm as any).push('```card:poll\n{"id":"one"}\n```')
    await nextTick()
    w.unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(2)
    expect(store.get("one")).toBeDefined()
  })
  it("switches card stores without clearing the AST or remounting the card", async () => {
    const registry = new CardRegistry()
    const firstStore = new CardStore({ registry })
    const secondStore = new CardStore({ registry })
    let setups = 0
    const Counter = defineComponent({ props: ["data"], setup: (props) => {
      setups++
      const local = ref(0)
      return () => h("button", { onClick: () => local.value++ }, `${props.data.count}:${local.value}`)
    } })
    registry.register({ type: "counter", description: "counter", render: Counter })
    secondStore.register({ id: "one", type: "counter", data: { id: "one", count: 7 } })
    const w = mount(AIRenderer, { props: { registry, cardStore: firstStore } })

    ;(w.vm as any).push('```card:counter\n{"id":"one","count":1}\n```')
    await nextTick()
    await w.find("button").trigger("click")
    const element = w.find("button").element
    await w.setProps({ cardStore: secondStore })
    await nextTick()

    expect(w.find("button").text()).toBe("7:1")
    expect(w.find("button").element).toBe(element)
    expect(setups).toBe(1)
    firstStore.apply({ op: "merge", cardId: "one", data: { count: 9 } })
    await nextTick()
    expect(w.find("button").text()).toBe("7:1")
  })
  it("falls back safely when identified card registration fails", async () => {
    const registry = new CardRegistry()
    const store = new CardStore({ registry })
    registry.register({ type: "poll", description: "poll", render: defineComponent({ setup: () => () => h("button", "poll") }) })
    registry.register({ type: "other", description: "other" })
    store.register({ id: "one", type: "other", data: { id: "one" } })
    const errorHandler = vi.fn()
    const w = mount(AIRenderer, { props: { registry, cardStore: store }, global: { config: { errorHandler } } })

    ;(w.vm as any).push('```card:poll\n{"id":"one","q":"x"}\n```')
    await nextTick()

    expect(w.find("[data-aigui-card-fallback]").exists()).toBe(true)
    expect(w.text()).toContain('"q": "x"')
    expect(errorHandler).not.toHaveBeenCalled()
  })
  it("reflects runtime action lifecycle and applies returned patches", async () => {
    const registry = new CardRegistry()
    const store = new CardStore({ registry })
    let resolve!: (value: unknown) => void
    const Counter = defineComponent({
      props: ["data", "state"],
      emits: ["action"],
      setup: (props, { emit }) => () => h("button", { onClick: () => emit("action", { type: "increment", params: {} }) }, `${props.data.count}:${props.state.status}`),
    })
    registry.register({ type: "counter", description: "counter", render: Counter })
    const actions = new ActionRegistry()
    actions.register({ type: "increment", run: () => new Promise((done) => { resolve = done }) })
    const runtime = new ActionRuntime({ registry: actions, cardStore: store })
    const w = mount(AIRenderer, { props: { registry, cardStore: store, actionRuntime: runtime } })

    ;(w.vm as any).push('```card:counter\n{"id":"one","count":1}\n```')
    await nextTick()
    await w.find("button").trigger("click")
    await nextTick()
    expect(w.find("button").text()).toBe("1:loading")

    resolve({ op: "merge", cardId: "one", data: { count: 2 } })
    await new Promise((done) => setTimeout(done, 0))
    await nextTick()
    expect(w.find("button").text()).toBe("2:success")
  })
  it("dispatches card actions before invoking the callback and emitting", async () => {
    const order: string[] = []
    const actions = new ActionRegistry()
    actions.register({ type: "vote", run: () => { order.push("dispatch") } })
    const runtime = new ActionRuntime({ registry: actions })
    const dispatch = vi.spyOn(runtime, "dispatch")
    const onCardAction = vi.fn(() => order.push("callback"))
    const w = mount(AIRenderer, { props: { registry: createPollRegistry(), actionRuntime: runtime, onCardAction } })
    ;(w.vm as any).push('```card:poll\n{}\n```')
    await nextTick()

    await w.find("button").trigger("click")

    expect(order).toEqual(["dispatch", "callback"])
    expect(dispatch.mock.calls[0]![0]).toEqual({ type: "vote", params: { q: "x" }, cardType: "poll" })
    expect(Object.hasOwn(dispatch.mock.calls[0]![0], "cardId")).toBe(false)
    expect(onCardAction).toHaveBeenCalledOnce()
    expect(onCardAction).toHaveBeenCalledWith({ type: "vote", params: { q: "x" }, cardType: "poll" })
    expect(w.emitted("card-action")).toHaveLength(1)
    expect(w.emitted("card-action")?.[0]).toEqual([{ type: "vote", params: { q: "x" }, cardType: "poll" }])
  })
  it("starts the runtime and emits even when the callback throws", async () => {
    const run = vi.fn()
    const actions = new ActionRegistry()
    actions.register({ type: "vote", run })
    const runtime = new ActionRuntime({ registry: actions })
    const onCardAction = vi.fn(() => { throw new Error("callback failed") })
    const errorHandler = vi.fn()
    const w = mount(AIRenderer, {
      props: { registry: createPollRegistry(), actionRuntime: runtime, onCardAction },
      global: { config: { errorHandler } },
    })
    ;(w.vm as any).push('```card:poll\n{}\n```')
    await nextTick()

    await w.find("button").trigger("click")

    expect(run).toHaveBeenCalledOnce()
    expect(onCardAction).toHaveBeenCalledOnce()
    expect(w.emitted("card-action")).toHaveLength(1)
    expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({ message: "callback failed" }), expect.anything(), expect.anything())
  })
  it("routes rejected listeners to the Vue error handler without an unhandled rejection", async () => {
    const failure = new Error("async callback failed")
    const onCardAction = vi.fn(async () => { throw failure })
    const errorHandler = vi.fn()
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)
    try {
      const w = mount(AIRenderer, {
        props: { registry: createPollRegistry(), onCardAction },
        global: { config: { errorHandler } },
      })
      ;(w.vm as any).push('```card:poll\n{}\n```')
      await nextTick()

      await w.find("button").trigger("click")
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(onCardAction).toHaveBeenCalledOnce()
      expect(errorHandler).toHaveBeenCalledWith(failure, expect.anything(), expect.anything())
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off("unhandledRejection", unhandled)
    }
  })
  it("contains validation and execution rejections from automatic dispatch", async () => {
    const actions = new ActionRegistry()
    actions.register({
      type: "vote",
      schema: { type: "object", required: ["q"], properties: { q: { type: "string" } } },
      run: vi.fn(() => { throw new Error("failed") }),
    })
    const runtime = new ActionRuntime({ registry: actions })
    const dispatch = vi.spyOn(runtime, "dispatch")
    const invalid = await mountPoll(runtime, {})

    await invalid.find("button").trigger("click")
    await Promise.resolve()
    await expect(dispatch.mock.results[0]!.value).rejects.toBeInstanceOf(ActionValidationError)

    const failing = await mountPoll(runtime, { q: "x" })
    await failing.find("button").trigger("click")
    await Promise.resolve()
    await expect(dispatch.mock.results[1]!.value).rejects.toThrow("failed")
  })
  it("deduplicates repeated card actions through the runtime", async () => {
    let resolve!: () => void
    const run = vi.fn(() => new Promise<void>((done) => { resolve = done }))
    const actions = new ActionRegistry()
    actions.register({ type: "vote", run })
    const w = await mountPoll(new ActionRuntime({ registry: actions }))

    await w.find("button").trigger("click")
    await w.find("button").trigger("click")

    expect(run).toHaveBeenCalledOnce()
    resolve()
  })
  it("lets renderers sharing a runtime run concurrently and reset independently", async () => {
    const signals: AbortSignal[] = []
    const actions = new ActionRegistry()
    actions.register({ type: "vote", run: (_, context) => {
      signals.push(context.signal)
      return new Promise<void>((resolve, reject) => {
        context.signal.addEventListener("abort", () => reject(new ActionAbortedError("vote")), { once: true })
      })
    } })
    const runtime = new ActionRuntime({ registry: actions })
    const first = await mountPoll(runtime)
    const second = await mountPoll(runtime)

    await first.find("button").trigger("click")
    await second.find("button").trigger("click")

    expect(signals).toHaveLength(2)
    ;(first.vm as any).reset()
    await nextTick()
    expect(signals[0]!.aborted).toBe(true)
    expect(signals[1]!.aborted).toBe(false)
  })
  it("makes automatic dispatch preflight errors observable", async () => {
    const runtime = new ActionRuntime({ registry: new ActionRegistry() })
    const scope = effectScope()
    const state = scope.run(() => useActionState(runtime, "poll:vote"))!
    const w = await mountPoll(runtime)

    await w.find("button").trigger("click")

    expect(state.value).toMatchObject({ status: "error", error: expect.any(Error) })
    scope.stop()
  })
  it("replaces the action owner on reset and runtime changes", async () => {
    const actions = new ActionRegistry()
    actions.register({ type: "vote", run: () => undefined })
    const firstRuntime = new ActionRuntime({ registry: actions })
    const secondRuntime = new ActionRuntime({ registry: actions })
    const firstDispatch = vi.spyOn(firstRuntime, "dispatch")
    const secondDispatch = vi.spyOn(secondRuntime, "dispatch")
    const w = await mountPoll(firstRuntime)

    await w.find("button").trigger("click")
    const firstOwner = firstDispatch.mock.calls[0]![1]!.owner

    ;(w.vm as any).reset()
    ;(w.vm as any).push('```card:poll\n{}\n```')
    await nextTick()
    await w.find("button").trigger("click")
    const resetOwner = firstDispatch.mock.calls[1]![1]!.owner

    await w.setProps({ actionRuntime: secondRuntime })
    await w.find("button").trigger("click")
    const switchedOwner = secondDispatch.mock.calls[0]![1]!.owner

    expect(resetOwner).not.toBe(firstOwner)
    expect(switchedOwner).not.toBe(resetOwner)
  })
  it("reset cancels only this renderer's actions and wraps the renderer reset", async () => {
    let signal!: AbortSignal
    const actions = new ActionRegistry()
    actions.register({ type: "vote", run: (_, context) => {
      signal = context.signal
      return new Promise<void>(() => {})
    } })
    const runtime = new ActionRuntime({ registry: actions })
    const runtimeReset = vi.spyOn(runtime, "reset")
    const runtimeDestroy = vi.spyOn(runtime, "destroy")
    const w = await mountPoll(runtime)
    await w.find("button").trigger("click")

    ;(w.vm as any).reset()
    await nextTick()

    expect(signal.aborted).toBe(true)
    expect(w.text()).toBe("")
    expect(runtimeReset).not.toHaveBeenCalled()
    expect(runtimeDestroy).not.toHaveBeenCalled()
  })
  it("unmount cancels only this renderer's actions", async () => {
    let signal!: AbortSignal
    const actions = new ActionRegistry()
    actions.register({ type: "vote", run: (_, context) => {
      signal = context.signal
      return new Promise<void>(() => {})
    } })
    const runtime = new ActionRuntime({ registry: actions })
    const runtimeReset = vi.spyOn(runtime, "reset")
    const runtimeDestroy = vi.spyOn(runtime, "destroy")
    const w = await mountPoll(runtime)
    await w.find("button").trigger("click")

    w.unmount()

    expect(signal.aborted).toBe(true)
    expect(runtimeReset).not.toHaveBeenCalled()
    expect(runtimeDestroy).not.toHaveBeenCalled()
  })
  it("switches runtimes without clearing the AST and cancels the old action scope", async () => {
    let oldSignal!: AbortSignal
    const oldActions = new ActionRegistry()
    oldActions.register({ type: "vote", run: (_, context) => {
      oldSignal = context.signal
      return new Promise<void>((_, reject) => context.signal.addEventListener("abort", () => reject(new ActionAbortedError("vote")), { once: true }))
    } })
    const nextRun = vi.fn()
    const nextActions = new ActionRegistry()
    nextActions.register({ type: "vote", run: nextRun })
    const oldRuntime = new ActionRuntime({ registry: oldActions })
    const nextRuntime = new ActionRuntime({ registry: nextActions })
    const w = await mountPoll(oldRuntime)
    await w.find("button").trigger("click")

    await w.setProps({ actionRuntime: nextRuntime })

    expect(oldSignal.aborted).toBe(true)
    expect(w.find("button").exists()).toBe(true)
    await w.find("button").trigger("click")
    expect(nextRun).toHaveBeenCalledOnce()
  })
  it("recreates and clears the renderer when configuration changes", async () => {
    const w = mount(AIRenderer, { props: { plugins: [] } })
    ;(w.vm as any).push("old")
    await nextTick()
    await w.setProps({ plugins: [] })
    expect(w.text()).toBe("")
    ;(w.vm as any).push("new")
    await nextTick()
    expect(w.text()).toContain("new")
  })
  it.each(["registry", "sanitize", "plugins"] as const)("resets the action scope when %s changes", async (property) => {
    let signal!: AbortSignal
    const actions = new ActionRegistry()
    actions.register({ type: "vote", run: (_, context) => {
      signal = context.signal
      return new Promise<void>(() => {})
    } })
    const runtime = new ActionRuntime({ registry: actions })
    const initial = {
      registry: createPollRegistry(),
      sanitize: true,
      plugins: [],
      actionRuntime: runtime,
    }
    const w = mount(AIRenderer, { props: initial })
    ;(w.vm as any).push('```card:poll\n{}\n```')
    await nextTick()
    await w.find("button").trigger("click")

    const next = property === "registry"
      ? createPollRegistry()
      : property === "sanitize"
        ? false
        : []
    await w.setProps({ [property]: next })

    expect(signal.aborted).toBe(true)
  })
})
