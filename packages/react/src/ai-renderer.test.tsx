// @vitest-environment jsdom
import { render, act, fireEvent, waitFor } from "@testing-library/react"
import { createElement, createRef, StrictMode, useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { ActionAbortedError, ActionNotFoundError, ActionRegistry, ActionValidationError, CardRegistry, CardStore, createActionRuntime, Renderer, type AIGuiPlugin, type ASTNode } from "@ai-gui/core"
import { AIRenderer, type AIRendererHandle } from "./ai-renderer"
import { useActionState } from "./use-action-state"

function setupActionCard() {
  const registry = new CardRegistry()
  registry.register({
    type: "poll",
    description: "p",
    render: ({ data, onAction }: any) => (
      <button onClick={() => onAction({ type: "vote", params: data })}>vote</button>
    ),
  })
  return registry
}

function pushPoll(ref: React.RefObject<AIRendererHandle | null>, data = { q: "x" }) {
  act(() => ref.current!.push(`\`\`\`card:poll\n${JSON.stringify(data)}\n\`\`\``))
}

describe("AIRenderer", () => {
  it("exposes an imperative push and renders", () => {
    const ref = createRef<AIRendererHandle>()
    const { container } = render(<AIRenderer ref={ref} />)
    act(() => ref.current!.push("# Hi"))
    expect(container.querySelector("h1")?.textContent).toBe("Hi")
  })
  it("renders the text prop and pushes only what was added", () => {
    const view = render(<AIRenderer text="# Ti" />)
    const push = vi.spyOn(Renderer.prototype, "push")

    view.rerender(<AIRenderer text="# Title" />)

    expect(push.mock.calls).toEqual([["tle"]])
    expect(view.container.querySelector("h1")?.textContent).toBe("Title")
    push.mockRestore()
  })

  it("starts over when the new text is not a continuation", () => {
    const view = render(<AIRenderer text="# First" />)

    view.rerender(<AIRenderer text="# Second" />)

    const headings = view.container.querySelectorAll("h1")
    expect(Array.from(headings, (h) => h.textContent)).toEqual(["Second"])
  })

  it("keeps the text on screen when StrictMode remounts the effects", () => {
    const view = render(<AIRenderer text="# Hi" />, { wrapper: StrictMode })

    expect(view.container.querySelector("h1")?.textContent).toBe("Hi")

    view.rerender(<StrictMode><AIRenderer text="# Hi there" /></StrictMode>)

    expect(view.container.querySelector("h1")?.textContent).toBe("Hi there")
  })

  it("re-sends the whole text after an imperative reset", () => {
    const ref = createRef<AIRendererHandle>()
    const view = render(<AIRenderer ref={ref} text="# Title" />)

    act(() => ref.current!.reset())
    expect(view.container.querySelector("h1")).toBeNull()

    view.rerender(<AIRenderer ref={ref} text="# Title and more" />)

    expect(view.container.querySelector("h1")?.textContent).toBe("Title and more")
  })

  it("reports the rendered nodes so a host can tell what the answer produced", () => {
    const onRender = vi.fn()
    const view = render(<AIRenderer text="# Title" onRender={onRender} />)

    view.rerender(<AIRenderer text={"# Title\n\n```mermaid\ngraph TD;\n```"} onRender={onRender} />)

    // A host counting the diagrams in an answer reads them off the nodes, rather than watching
    // the DOM for whatever elements a plugin happened to create.
    const last = onRender.mock.lastCall![0] as ASTNode[]
    expect(last.map((node) => node.type)).toEqual(["heading", "code"])
    expect(last[1]!.attrs?.lang).toBe("mermaid")
    expect(onRender.mock.calls.length).toBeGreaterThan(1)
  })

  it("hands the host theme to plugins and re-renders when it changes", () => {
    const themes: Array<string | undefined> = []
    const plugin: AIGuiPlugin = {
      name: "probe",
      nodeRenderers: {
        probe: (node, context) => {
          themes.push(context?.theme)
          return { kind: "html", html: `<i data-theme="${context?.theme ?? "none"}">${node.content ?? ""}</i>` }
        },
      },
    }
    const plugins = [plugin]
    const text = "```probe\nx\n```"
    const view = render(<AIRenderer text={text} plugins={plugins} theme="light" />)
    expect(view.container.querySelector("i")?.dataset.theme).toBe("light")

    view.rerender(<AIRenderer text={text} plugins={plugins} theme="dark" />)

    // The node did not change, but the picture drawn for the light page is the wrong one now.
    expect(view.container.querySelector("i")?.dataset.theme).toBe("dark")
    expect(themes).toEqual(["light", "dark"])
  })

  it("renders a card component and routes onCardAction", () => {
    const registry = setupActionCard()
    const onCardAction = vi.fn()
    const ref = createRef<AIRendererHandle>()
    const { container } = render(<AIRenderer ref={ref} registry={registry} onCardAction={onCardAction} />)
    act(() => ref.current!.push('```card:poll\n{"q":"x"}\n```'))
    container.querySelector("button")!.click()
    expect(onCardAction).toHaveBeenCalledWith({ type: "vote", params: { q: "x" }, cardType: "poll" })
  })

  it("updates only the targeted identified card host", () => {
    const registry = new CardRegistry()
    const renders = { one: 0, two: 0 }
    registry.register({
      type: "poll",
      description: "p",
      render: ({ data }: any) => {
        renders[data.id as keyof typeof renders]++
        return <span data-testid={data.id}>{data.value}</span>
      },
    })
    const store = new CardStore({ registry })
    const ref = createRef<AIRendererHandle>()
    const view = render(<AIRenderer ref={ref} registry={registry} cardStore={store} />)
    act(() => ref.current!.push('```card:poll\n{"id":"one","value":1}\n```\n```card:poll\n{"id":"two","value":2}\n```'))
    const before = { ...renders }

    act(() => store.apply({ op: "merge", cardId: "one", data: { value: 3 } }))

    expect(view.getByTestId("one").textContent).toBe("3")
    expect(view.getByTestId("two").textContent).toBe("2")
    expect(renders.one).toBe(before.one + 1)
    expect(renders.two).toBe(before.two)
  })

  it("synchronizes a shared card store across renderers and turns", () => {
    const registry = new CardRegistry()
    registry.register({ type: "poll", description: "p", render: ({ data }: any) => <span>{data.value}</span> })
    const store = new CardStore({ registry })
    const firstRef = createRef<AIRendererHandle>()
    const secondRef = createRef<AIRendererHandle>()
    const first = render(<AIRenderer ref={firstRef} registry={registry} cardStore={store} />)
    const second = render(<AIRenderer ref={secondRef} registry={registry} cardStore={store} />)
    const card = '```card:poll\n{"id":"shared","value":1}\n```'
    act(() => firstRef.current!.push(card))
    act(() => store.apply({ op: "merge", cardId: "shared", data: { value: 2 } }))
    act(() => secondRef.current!.push(card))

    expect(first.container.textContent).toBe("2")
    expect(second.container.textContent).toBe("2")
    act(() => firstRef.current!.reset())
    expect(store.get("shared")?.data).toMatchObject({ value: 2 })
    act(() => firstRef.current!.push(card))
    expect(first.container.textContent).toBe("2")
  })

  it("reflects snapshot restores in mounted cards", () => {
    const registry = new CardRegistry()
    registry.register({ type: "poll", description: "p", render: ({ data }: any) => <span>{data.value}</span> })
    const store = new CardStore({ registry })
    const ref = createRef<AIRendererHandle>()
    const view = render(<AIRenderer ref={ref} registry={registry} cardStore={store} />)
    act(() => ref.current!.push('```card:poll\n{"id":"one","value":1}\n```'))

    act(() => store.restore({ version: 1, cards: [{ id: "one", type: "poll", data: { id: "one", value: 9 }, revision: 4 }] }))

    expect(view.container.textContent).toBe("9")
  })

  it("soft-switches card stores without clearing AST or remounting the card", () => {
    const registry = new CardRegistry()
    let mounts = 0
    registry.register({
      type: "poll",
      description: "p",
      render: ({ data }: any) => {
        useState(() => { mounts++; return undefined })
        return <span>{data.value}</span>
      },
    })
    const firstStore = new CardStore({ registry })
    const secondStore = new CardStore({ registry })
    secondStore.register({ id: "one", type: "poll", data: { id: "one", value: 7 } })
    const ref = createRef<AIRendererHandle>()
    const view = render(<AIRenderer ref={ref} registry={registry} cardStore={firstStore} />)
    act(() => ref.current!.push('```card:poll\n{"id":"one","value":1}\n```'))

    view.rerender(<AIRenderer ref={ref} registry={registry} cardStore={secondStore} />)

    expect(view.container.textContent).toBe("7")
    expect(mounts).toBe(1)
  })

  it("unsubscribes from an external card store without clearing it", () => {
    const registry = setupActionCard()
    const store = new CardStore({ registry })
    const unsubscribe = vi.fn()
    const subscribe = vi.spyOn(store, "subscribe").mockImplementation((id, listener) => {
      const original = CardStore.prototype.subscribe.call(store, id, listener)
      return () => { unsubscribe(); original() }
    })
    const ref = createRef<AIRendererHandle>()
    const view = render(<AIRenderer ref={ref} registry={registry} cardStore={store} />)
    act(() => ref.current!.push('```card:poll\n{"id":"one","q":"x"}\n```'))
    expect(subscribe).toHaveBeenCalledWith("one", expect.any(Function))

    view.unmount()

    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(store.get("one")).toBeTruthy()
  })

  it("passes card lifecycle state, cardId, and action patches through the store", async () => {
    const registry = new CardRegistry()
    registry.register({
      type: "poll",
      description: "p",
      render: ({ data, state, onAction }: any) => <button onClick={() => onAction({ type: "vote", params: data })}>{data.value}:{state.status}</button>,
    })
    const store = new CardStore({ registry })
    const actions = new ActionRegistry()
    let resolve!: (value: unknown) => void
    const run = vi.fn((_params, context) => new Promise((done) => { resolve = done; expect(context.cardId).toBe("one") }))
    actions.register({ type: "vote", run })
    const runtime = createActionRuntime({ registry: actions, cardStore: store })
    const onCardAction = vi.fn()
    const ref = createRef<AIRendererHandle>()
    const view = render(<AIRenderer ref={ref} registry={registry} cardStore={store} actionRuntime={runtime} onCardAction={onCardAction} />)
    act(() => ref.current!.push('```card:poll\n{"id":"one","value":1}\n```'))

    fireEvent.click(view.container.querySelector("button")!)
    expect(view.container.querySelector("button")?.textContent).toBe("1:loading")
    expect(onCardAction).toHaveBeenCalledWith(expect.objectContaining({ cardId: "one", cardType: "poll" }))
    resolve({ op: "merge", cardId: "one", data: { value: 2 } })
    await waitFor(() => expect(view.container.querySelector("button")?.textContent).toBe("2:success"))

    actions.register({ type: "vote", run: () => Promise.reject(new Error("boom")) }, { override: true })
    fireEvent.click(view.container.querySelector("button")!)
    await waitFor(() => expect(view.container.querySelector("button")?.textContent).toBe("2:error"))
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ id: "one" }), expect.objectContaining({ cardId: "one" }))
  })

  it("automatically dispatches card actions and still calls onCardAction", async () => {
    const registry = setupActionCard()
    const actions = new ActionRegistry()
    const run = vi.fn().mockResolvedValue("ok")
    actions.register({ type: "vote", run })
    const runtime = createActionRuntime({ registry: actions })
    const onCardAction = vi.fn()
    const ref = createRef<AIRendererHandle>()
    const { container } = render(
      <AIRenderer ref={ref} registry={registry} actionRuntime={runtime} onCardAction={onCardAction} />,
    )
    pushPoll(ref)

    fireEvent.click(container.querySelector("button")!)

    await waitFor(() => expect(run).toHaveBeenCalledOnce())
    expect(run).toHaveBeenCalledWith(
      { q: "x" },
      expect.objectContaining({ cardType: "poll", signal: expect.any(AbortSignal) }),
    )
    expect(onCardAction).toHaveBeenCalledOnce()
    expect(onCardAction).toHaveBeenCalledWith({ type: "vote", params: { q: "x" }, cardType: "poll" })
  })

  it("starts runtime dispatch before calling onCardAction", () => {
    const registry = setupActionCard()
    const actions = new ActionRegistry()
    const order: string[] = []
    actions.register({ type: "vote", run: () => { order.push("runtime"); return new Promise(() => {}) } })
    const runtime = createActionRuntime({ registry: actions })
    const onCardAction = vi.fn(() => { order.push("callback") })
    const ref = createRef<AIRendererHandle>()
    const { container } = render(
      <AIRenderer ref={ref} registry={registry} actionRuntime={runtime} onCardAction={onCardAction} />,
    )
    pushPoll(ref)

    fireEvent.click(container.querySelector("button")!)

    expect(order).toEqual(["runtime", "callback"])
  })

  it("keeps an already-started runtime action when onCardAction throws synchronously", () => {
    const registry = setupActionCard()
    const actions = new ActionRegistry()
    const run = vi.fn(() => new Promise(() => {}))
    actions.register({ type: "vote", run })
    const runtime = createActionRuntime({ registry: actions })
    const callbackError = new Error("callback failed")
    const onCardAction = vi.fn(() => { throw callbackError })
    const errors: unknown[] = []
    const handleError = (event: ErrorEvent) => {
      errors.push(event.error)
      event.preventDefault()
    }
    window.addEventListener("error", handleError)
    const ref = createRef<AIRendererHandle>()
    const { container } = render(
      <AIRenderer ref={ref} registry={registry} actionRuntime={runtime} onCardAction={onCardAction} />,
    )
    pushPoll(ref)

    fireEvent.click(container.querySelector("button")!)
    window.removeEventListener("error", handleError)

    expect(errors).toContain(callbackError)
    expect(run).toHaveBeenCalledOnce()
    expect(runtime.getState("poll:vote").status).toBe("pending")
  })

  it("contains validation and handler rejections without unhandled rejections", async () => {
    const registry = setupActionCard()
    const actions = new ActionRegistry()
    actions.register({
      type: "vote",
      schema: {
        type: "object",
        properties: { q: { type: "string", minLength: 2 } },
        required: ["q"],
      },
      run: vi.fn(),
    })
    const runtime = createActionRuntime({ registry: actions })
    const dispatch = vi.spyOn(runtime, "dispatch")
    const ref = createRef<AIRendererHandle>()
    const { container } = render(<AIRenderer ref={ref} registry={registry} actionRuntime={runtime} />)
    pushPoll(ref, { q: "" })

    fireEvent.click(container.querySelector("button")!)

    await waitFor(() => expect(dispatch).toHaveBeenCalledOnce())
    await expect(dispatch.mock.results[0]!.value).rejects.toBeInstanceOf(ActionValidationError)

    actions.register({ type: "vote", run: () => Promise.reject(new Error("boom")) }, { override: true })
    fireEvent.click(container.querySelector("button")!)
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2))
    await expect(dispatch.mock.results[1]!.value).rejects.toThrow('Action "vote" failed')
  })

  it("deduplicates duplicate clicks in the runtime while preserving every callback event", async () => {
    const registry = setupActionCard()
    const actions = new ActionRegistry()
    let resolve!: (value: string) => void
    const run = vi.fn(() => new Promise<string>((done) => { resolve = done }))
    actions.register({ type: "vote", run })
    const runtime = createActionRuntime({ registry: actions })
    const onCardAction = vi.fn()
    const ref = createRef<AIRendererHandle>()
    const { container } = render(
      <AIRenderer ref={ref} registry={registry} actionRuntime={runtime} onCardAction={onCardAction} />,
    )
    pushPoll(ref)

    fireEvent.click(container.querySelector("button")!)
    fireEvent.click(container.querySelector("button")!)

    expect(run).toHaveBeenCalledOnce()
    expect(onCardAction).toHaveBeenCalledTimes(2)
    resolve("ok")
    await waitFor(() => expect(runtime.getState("poll:vote").status).toBe("success"))
  })

  it("lets two renderers sharing a runtime run the same action independently and reset only one scope", async () => {
    const registry = setupActionCard()
    const actions = new ActionRegistry()
    const calls: Array<{ params: unknown; signal: AbortSignal }> = []
    actions.register({
      type: "vote",
      run: (params, { signal }) => {
        calls.push({ params, signal })
        return new Promise(() => {})
      },
    })
    const runtime = createActionRuntime({ registry: actions })
    const firstRef = createRef<AIRendererHandle>()
    const secondRef = createRef<AIRendererHandle>()
    const first = render(<AIRenderer ref={firstRef} registry={registry} actionRuntime={runtime} />)
    const second = render(<AIRenderer ref={secondRef} registry={registry} actionRuntime={runtime} />)
    pushPoll(firstRef, { q: "first" })
    pushPoll(secondRef, { q: "second" })

    fireEvent.click(first.container.querySelector("button")!)
    fireEvent.click(second.container.querySelector("button")!)

    expect(calls).toHaveLength(2)
    expect(calls.map(({ params }) => params)).toEqual([{ q: "first" }, { q: "second" }])
    act(() => firstRef.current!.reset())
    await waitFor(() => expect(calls[0]!.signal.aborted).toBe(true))
    expect(calls[1]!.signal.aborted).toBe(false)
  })

  it.each([
    ["validation", true, ActionValidationError],
    ["not found", false, ActionNotFoundError],
  ] as const)("exposes %s preflight errors through useActionState", async (_name, registerAction, ErrorType) => {
    const registry = setupActionCard()
    const actions = new ActionRegistry()
    if (registerAction) {
      actions.register({
        type: "vote",
        schema: {
          type: "object",
          properties: { q: { type: "string", minLength: 2 } },
          required: ["q"],
        },
        run: vi.fn(),
      })
    }
    const runtime = createActionRuntime({ registry: actions })
    const ref = createRef<AIRendererHandle>()
    function State() {
      const state = useActionState(runtime, "poll:vote")
      return createElement("span", { "data-testid": "state" }, state.status === "error" ? state.error.name : state.status)
    }
    const view = render(<><AIRenderer ref={ref} registry={registry} actionRuntime={runtime} /><State /></>)
    pushPoll(ref, { q: "" })

    fireEvent.click(view.container.querySelector("button")!)

    await waitFor(() => expect(view.container.querySelector('[data-testid="state"]')?.textContent).toBe(ErrorType.name))
  })

  it("reset cancels adapter actions, ignores stale results, and does not reset the shared runtime", async () => {
    const registry = setupActionCard()
    const actions = new ActionRegistry()
    let resolve!: (value: string) => void
    let actionSignal!: AbortSignal
    actions.register({
      type: "vote",
      run: (_params, context) => {
        actionSignal = context.signal
        return new Promise<string>((done) => { resolve = done })
      },
    })
    const runtime = createActionRuntime({ registry: actions })
    const runtimeReset = vi.spyOn(runtime, "reset")
    const ref = createRef<AIRendererHandle>()
    const { container } = render(
      <AIRenderer ref={ref} registry={registry} actionRuntime={runtime} />,
    )
    pushPoll(ref)
    fireEvent.click(container.querySelector("button")!)

    act(() => ref.current!.reset())

    expect(container.querySelector("button")).toBeNull()
    expect(actionSignal.aborted).toBe(true)
    expect(runtimeReset).not.toHaveBeenCalled()
    resolve("late")
    await waitFor(() => expect(runtime.getState("poll:vote").status).toBe("cancelled"))
    expect(runtime.getState("poll:vote")).toMatchObject({ status: "cancelled", error: expect.any(ActionAbortedError) })
  })

  it("unmount cancels adapter actions without destroying or resetting the shared runtime", () => {
    const registry = setupActionCard()
    const actions = new ActionRegistry()
    let actionSignal!: AbortSignal
    actions.register({
      type: "vote",
      run: (_params, context) => {
        actionSignal = context.signal
        return new Promise(() => {})
      },
    })
    const runtime = createActionRuntime({ registry: actions })
    const runtimeReset = vi.spyOn(runtime, "reset")
    const runtimeDestroy = vi.spyOn(runtime, "destroy")
    const ref = createRef<AIRendererHandle>()
    const view = render(<AIRenderer ref={ref} registry={registry} actionRuntime={runtime} />)
    pushPoll(ref)
    fireEvent.click(view.container.querySelector("button")!)

    view.unmount()

    expect(actionSignal.aborted).toBe(true)
    expect(runtimeReset).not.toHaveBeenCalled()
    expect(runtimeDestroy).not.toHaveBeenCalled()
  })

  it("switching runtimes cancels the old scope without clearing the rendered AST", async () => {
    const registry = setupActionCard()
    const oldActions = new ActionRegistry()
    let oldSignal!: AbortSignal
    oldActions.register({
      type: "vote",
      run: (_params, context) => {
        oldSignal = context.signal
        return new Promise(() => {})
      },
    })
    const oldRuntime = createActionRuntime({ registry: oldActions })
    const newActions = new ActionRegistry()
    const newRun = vi.fn().mockResolvedValue("new")
    newActions.register({ type: "vote", run: newRun })
    const newRuntime = createActionRuntime({ registry: newActions })
    const ref = createRef<AIRendererHandle>()
    const view = render(<AIRenderer ref={ref} registry={registry} actionRuntime={oldRuntime} />)
    pushPoll(ref)
    fireEvent.click(view.container.querySelector("button")!)

    view.rerender(<AIRenderer ref={ref} registry={registry} actionRuntime={newRuntime} />)

    expect(oldSignal.aborted).toBe(true)
    expect(view.container.querySelector("button")).toBeTruthy()
    expect(view.container.textContent).toContain("vote")
    fireEvent.click(view.container.querySelector("button")!)
    await waitFor(() => expect(newRun).toHaveBeenCalledOnce())
  })

  it.each([
    ["registry", { registry: setupActionCard() }, { registry: setupActionCard() }],
    ["sanitize", { sanitize: true }, { sanitize: false }],
    ["plugins", { plugins: [] as AIGuiPlugin[] }, { plugins: [{ name: "added" }] as AIGuiPlugin[] }],
  ] as const)("changing %s clears the AST and cancels the old action scope", async (_name, initial, next) => {
    const registry = setupActionCard()
    const actions = new ActionRegistry()
    let actionSignal!: AbortSignal
    actions.register({
      type: "vote",
      run: (_params, context) => {
        actionSignal = context.signal
        return new Promise(() => {})
      },
    })
    const runtime = createActionRuntime({ registry: actions })
    const ref = createRef<AIRendererHandle>()
    const view = render(<AIRenderer ref={ref} registry={registry} actionRuntime={runtime} {...initial} />)
    pushPoll(ref)
    fireEvent.click(view.container.querySelector("button")!)

    view.rerender(<AIRenderer ref={ref} registry={registry} actionRuntime={runtime} {...next} />)

    expect(view.container.querySelector("button")).toBeNull()
    await waitFor(() => expect(actionSignal.aborted).toBe(true))
  })
})
