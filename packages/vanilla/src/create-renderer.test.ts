// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import {
  ActionAbortedError,
  ActionExecutionError,
  ActionNotFoundError,
  ActionRegistry,
  ActionValidationError,
  CardRegistry,
  createActionRuntime,
  type AIGuiPlugin,
  type RenderOutput,
} from "@ai-gui/core"
import { createRenderer } from "./create-renderer"

function pollRegistry(actionType = "vote") {
  const registry = new CardRegistry()
  registry.register({
    type: "poll",
    description: "p",
    render: (data: any, api: any) => {
      const button = document.createElement("button")
      button.onclick = () => api.onAction({ type: actionType, params: data })
      return button
    },
  })
  return registry
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

describe("createRenderer", () => {
  it("push renders into the element", () => {
    const el = document.createElement("div")
    const r = createRenderer(el)
    r.push("# Hi")
    expect(el.querySelector("h1")?.textContent).toBe("Hi")
  })
  it("streaming updates in place (heading node reused, content grows)", () => {
    const el = document.createElement("div")
    const r = createRenderer(el)
    r.push("# Ti"); const first = el.querySelector("h1")
    r.push("tle"); const second = el.querySelector("h1")
    expect(second?.textContent).toBe("Title")
    expect(first).toBe(second) // same element instance reused via keyed reconcile
  })
  it("reset clears the element", () => {
    const el = document.createElement("div")
    const r = createRenderer(el)
    r.push("hello"); r.reset()
    expect(el.children.length).toBe(0)
  })
  it("renders a card and routes onCardAction", () => {
    const registry = pollRegistry()
    const onCardAction = vi.fn()
    const el = document.createElement("div")
    const r = createRenderer(el, { registry, onCardAction })
    r.push('```card:poll\n{"q":"x"}\n```')
    el.querySelector("button")!.click()
    expect(onCardAction).toHaveBeenCalledWith({ type: "vote", params: { q: "x" }, cardType: "poll" })
  })
  it("automatically dispatches card actions and still calls onCardAction", async () => {
    const actions = new ActionRegistry()
    const run = vi.fn(() => "accepted")
    actions.register({ type: "vote", run })
    const actionRuntime = createActionRuntime({ registry: actions })
    const onCardAction = vi.fn()
    const el = document.createElement("div")
    const r = createRenderer(el, { registry: pollRegistry(), actionRuntime, onCardAction })

    r.push('```card:poll\n{"q":"x"}\n```')
    el.querySelector("button")!.click()
    await Promise.resolve()

    expect(onCardAction).toHaveBeenCalledWith({ type: "vote", params: { q: "x" }, cardType: "poll" })
    expect(run).toHaveBeenCalledWith(
      { q: "x" },
      expect.objectContaining({ signal: expect.any(AbortSignal), cardType: "poll" }),
    )
    await vi.waitFor(() => {
      expect(actionRuntime.getState("poll:vote")).toMatchObject({ status: "success", result: "accepted" })
    })
  })
  it("starts runtime dispatch before the callback and keeps it running when the callback throws", async () => {
    const order: string[] = []
    const actions = new ActionRegistry()
    actions.register({ type: "vote", run: () => { order.push("runtime"); return "accepted" } })
    const actionRuntime = createActionRuntime({ registry: actions })
    const onCardAction = vi.fn(() => { order.push("callback"); throw new Error("callback failed") })
    const el = document.createElement("div")
    const r = createRenderer(el, { registry: pollRegistry(), actionRuntime, onCardAction })

    r.push('```card:poll\n{"q":"x"}\n```')
    const button = el.querySelector("button")!
    expect(() => button.onclick!(new MouseEvent("click"))).toThrow("callback failed")

    expect(order).toEqual(["runtime", "callback"])
    await vi.waitFor(() => {
      expect(actionRuntime.getState("poll:vote")).toMatchObject({ status: "success", result: "accepted" })
    })
  })
  it("passes one owner per action scope and creates a new owner on reset", () => {
    const actionRuntime = createActionRuntime({ registry: new ActionRegistry() })
    const dispatch = vi.spyOn(actionRuntime, "dispatch")
    const el = document.createElement("div")
    const r = createRenderer(el, { registry: pollRegistry("missing"), actionRuntime })

    r.push('```card:poll\n{"q":"first"}\n```')
    el.querySelector("button")!.click()
    const firstOptions = dispatch.mock.calls[0][1]

    r.reset()
    r.push('```card:poll\n{"q":"second"}\n```')
    el.querySelector("button")!.click()
    const secondOptions = dispatch.mock.calls[1][1]

    expect(firstOptions).toMatchObject({ owner: expect.any(Object), signal: expect.any(AbortSignal) })
    expect(secondOptions).toMatchObject({ owner: expect.any(Object), signal: expect.any(AbortSignal) })
    expect(secondOptions!.owner).not.toBe(firstOptions!.owner)
  })
  it("deduplicates repeated runtime dispatches while calling onCardAction for every click", async () => {
    const pending = deferred<string>()
    const actions = new ActionRegistry()
    const run = vi.fn(() => pending.promise)
    actions.register({ type: "vote", run })
    const actionRuntime = createActionRuntime({ registry: actions })
    const onCardAction = vi.fn()
    const el = document.createElement("div")
    const r = createRenderer(el, { registry: pollRegistry(), actionRuntime, onCardAction })

    r.push('```card:poll\n{"q":"x"}\n```')
    el.querySelector("button")!.click()
    el.querySelector("button")!.click()

    expect(onCardAction).toHaveBeenCalledTimes(2)
    expect(run).toHaveBeenCalledTimes(1)
    pending.resolve("accepted")
    await Promise.resolve()
  })
  it("exposes preflight validation and not-found errors in runtime state", async () => {
    const actions = new ActionRegistry()
    const validateRun = vi.fn()
    actions.register({
      type: "vote",
      schema: {
        type: "object",
        properties: { q: { type: "string", minLength: 2 } },
        required: ["q"],
        additionalProperties: false,
      },
      run: validateRun,
    })
    actions.register({ type: "fail", run: () => { throw new Error("nope") } })
    const actionRuntime = createActionRuntime({ registry: actions })
    const el = document.createElement("div")
    const r = createRenderer(el, { registry: pollRegistry(), actionRuntime })

    r.push('```card:poll\n{"q":"x"}\n```')
    el.querySelector("button")!.click()
    await Promise.resolve()
    expect(validateRun).not.toHaveBeenCalled()
    expect(actionRuntime.getState("poll:vote")).toMatchObject({
      status: "error",
      error: expect.any(ActionValidationError),
    })

    r.destroy()
    const missingEl = document.createElement("div")
    const missingRenderer = createRenderer(missingEl, { registry: pollRegistry("missing"), actionRuntime })
    missingRenderer.push('```card:poll\n{}\n```')
    missingEl.querySelector("button")!.click()
    await Promise.resolve()
    expect(actionRuntime.getState("poll:missing")).toMatchObject({
      status: "error",
      error: expect.any(ActionNotFoundError),
    })

    missingRenderer.destroy()
    const failingEl = document.createElement("div")
    const failingRenderer = createRenderer(failingEl, { registry: pollRegistry("fail"), actionRuntime })
    failingRenderer.push('```card:poll\n{}\n```')
    failingEl.querySelector("button")!.click()
    await vi.waitFor(() => {
      expect(actionRuntime.getState("poll:fail")).toMatchObject({
        status: "error",
        error: expect.any(ActionExecutionError),
      })
    })

    await expect(actionRuntime.dispatch({ type: "vote", params: { q: "x" }, cardType: "direct" }))
      .rejects.toBeInstanceOf(ActionValidationError)
  })
  it("runs the same card action concurrently for two renderers and reset only cancels its owner", async () => {
    const firstResult = deferred<string>()
    const secondResult = deferred<string>()
    const calls: Array<{ params: unknown; signal: AbortSignal }> = []
    const actions = new ActionRegistry()
    actions.register({
      type: "vote",
      run: (params, { signal }) => {
        calls.push({ params, signal })
        return calls.length === 1 ? firstResult.promise : secondResult.promise
      },
    })
    const actionRuntime = createActionRuntime({ registry: actions })
    const firstEl = document.createElement("div")
    const secondEl = document.createElement("div")
    const first = createRenderer(firstEl, { registry: pollRegistry(), actionRuntime })
    const second = createRenderer(secondEl, { registry: pollRegistry(), actionRuntime })

    first.push('```card:poll\n{"renderer":"first"}\n```')
    second.push('```card:poll\n{"renderer":"second"}\n```')
    firstEl.querySelector("button")!.click()
    secondEl.querySelector("button")!.click()

    expect(calls.map((call) => call.params)).toEqual([{ renderer: "first" }, { renderer: "second" }])
    first.reset()
    expect(calls[0].signal.aborted).toBe(true)
    expect(calls[1].signal.aborted).toBe(false)

    secondResult.resolve("second")
    await vi.waitFor(() => {
      expect(actionRuntime.getState("poll:vote")).toMatchObject({ status: "success", result: "second" })
    })
  })
  it.each(["reset", "destroy"] as const)("%s aborts adapter actions without resetting or destroying the external runtime", async (method) => {
    const pending = deferred<string>()
    let adapterSignal!: AbortSignal
    const actions = new ActionRegistry()
    actions.register({ type: "vote", run: (_params, { signal }) => { adapterSignal = signal; return pending.promise } })
    actions.register({ type: "external", run: () => "still alive" })
    const actionRuntime = createActionRuntime({ registry: actions })
    const reset = vi.spyOn(actionRuntime, "reset")
    const destroy = vi.spyOn(actionRuntime, "destroy")
    const el = document.createElement("div")
    const r = createRenderer(el, { registry: pollRegistry(), actionRuntime })

    r.push('```card:poll\n{"q":"x"}\n```')
    el.querySelector("button")!.click()
    r[method]()

    expect(adapterSignal.aborted).toBe(true)
    await vi.waitFor(() => {
      expect(actionRuntime.getState("poll:vote")).toMatchObject({ status: "cancelled", error: expect.any(ActionAbortedError) })
    })
    expect(reset).not.toHaveBeenCalled()
    expect(destroy).not.toHaveBeenCalled()
    await expect(actionRuntime.dispatch({ type: "external", params: {} })).resolves.toBe("still alive")
  })
  it("prevents a stale action result after reset from replacing a fresh result", async () => {
    const stale = deferred<string>()
    const fresh = deferred<string>()
    const actions = new ActionRegistry()
    const run = vi.fn().mockImplementationOnce(() => stale.promise).mockImplementationOnce(() => fresh.promise)
    actions.register({ type: "vote", run })
    const actionRuntime = createActionRuntime({ registry: actions })
    const el = document.createElement("div")
    const r = createRenderer(el, { registry: pollRegistry(), actionRuntime })

    r.push('```card:poll\n{"q":"old"}\n```')
    el.querySelector("button")!.click()
    r.reset()
    await vi.waitFor(() => expect(actionRuntime.getState("poll:vote").status).toBe("cancelled"))
    r.push('```card:poll\n{"q":"new"}\n```')
    el.querySelector("button")!.click()

    stale.resolve("stale")
    await Promise.resolve()
    expect(actionRuntime.getState("poll:vote").status).toBe("pending")

    fresh.resolve("fresh")
    await vi.waitFor(() => {
      expect(actionRuntime.getState("poll:vote")).toMatchObject({ status: "success", result: "fresh" })
    })
  })
  it("ignores push and pending feed updates after destroy", async () => {
    let release!: () => void
    const source = (async function* () {
      yield "first"
      await new Promise<void>((resolve) => { release = resolve })
      yield " late"
    })()
    const el = document.createElement("div")
    const r = createRenderer(el)
    const feeding = r.feed(source)
    await new Promise((resolve) => setTimeout(resolve))
    r.destroy()
    r.push("ignored")
    release()
    await feeding
    expect(el.children).toHaveLength(0)
  })
  it("does not revive an async plugin placeholder after reset", async () => {
    let resolve!: (output: RenderOutput) => void
    const plugin: AIGuiPlugin = { name: "async", nodeRenderers: { async: () => new Promise((r) => { resolve = r }) } }
    const el = document.createElement("div")
    const r = createRenderer(el, { plugins: [plugin] })
    r.push("```async\n \n```")
    r.reset()
    resolve({ kind: "html", html: "<b>late</b>" })
    await Promise.resolve()
    expect(el.children).toHaveLength(0)
  })
  it("re-renders a plugin node when its streamed fence becomes complete", () => {
    const render = vi.fn(() => ({ kind: "html" as const, html: "<strong>ready</strong>" }))
    const plugin: AIGuiPlugin = { name: "widget", nodeRenderers: { widget: render } }
    const el = document.createElement("div")
    const r = createRenderer(el, { plugins: [plugin] })
    r.push("```widget\nstreaming")
    expect(render).not.toHaveBeenCalled()
    expect(el.querySelector("[data-aigui-block-loading]")).toBeTruthy()
    r.push("\n```")
    expect(render).toHaveBeenCalledOnce()
    expect(el.querySelector("strong")?.textContent).toBe("ready")
  })
  it("does not inject streamed plugin content while replacing its loading gate", () => {
    const plugin: AIGuiPlugin = {
      name: "widget",
      nodeRenderers: { widget: () => ({ kind: "html", html: "<span>safe</span>" }) },
    }
    const el = document.createElement("div")
    const r = createRenderer(el, { plugins: [plugin] })
    r.push('```widget\n<img src=x onerror="globalThis.pwned=true">')
    expect(el.querySelector("img")).toBeNull()
    r.push("\n```")
    expect(el.querySelector("img")).toBeNull()
    expect(el.querySelector("span")?.textContent).toBe("safe")
  })
  it("await feed observes the final scheduled DOM update", async () => {
    const scheduled: Array<() => void> = []
    const el = document.createElement("div")
    const renderer = createRenderer(el, { scheduler: (render) => scheduled.push(render) })
    await renderer.feed((async function* () { yield "# Ready" })())
    expect(el.querySelector("h1")?.textContent).toBe("Ready")
    expect(scheduled).toHaveLength(1)
  })
  it("decodes a fetch byte stream across UTF-8 chunk boundaries", async () => {
    const bytes = new TextEncoder().encode("你好")
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 2))
        controller.enqueue(bytes.slice(2))
        controller.close()
      },
    })
    const el = document.createElement("div")
    const renderer = createRenderer(el)
    await renderer.feed(source)
    expect(el.textContent).toBe("你好")
  })
})
