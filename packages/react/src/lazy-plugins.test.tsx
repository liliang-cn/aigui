// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, waitFor } from "@testing-library/react"
import { createRef } from "react"
import { ActionRegistry, CardRegistry, createActionRuntime, type AIGuiPlugin } from "@ai-gui/core"
import { AIRenderer, type AIRendererHandle } from "./ai-renderer"

const widget: AIGuiPlugin = {
  name: "widget",
  css: ".widget{color:red}",
  nodeRenderers: { widget: (node) => ({ kind: "html", html: `<b data-widget>${node.content?.trim()}</b>` }) },
}

describe("AIRenderer with a plugin loader", () => {
  it("renders plain markdown first and redraws when the plugins land", async () => {
    const load = () => Promise.resolve([widget])
    const view = render(<AIRenderer text={"```widget\nhello\n```"} plugins={load} />)

    expect(view.container.querySelector("pre")).not.toBeNull()

    await waitFor(() => expect(view.container.querySelector("[data-widget]")?.textContent).toBe("hello"))
    expect(view.container.querySelector("pre")).toBeNull()
  })
  it("keeps text pushed imperatively before the plugins arrive", async () => {
    const load = () => Promise.resolve([widget])
    const ref = createRef<AIRendererHandle>()
    const view = render(<AIRenderer ref={ref} plugins={load} />)
    act(() => ref.current!.push("# Title\n\n```widget\nhal"))

    await waitFor(() => expect(view.container.querySelector("h1")).not.toBeNull())
    act(() => ref.current!.push("f\n```\n"))

    // No `text` prop to replay from: the renderer reparsed its own buffer.
    await waitFor(() => expect(view.container.querySelector("[data-widget]")?.textContent).toBe("half"))
    expect(view.container.querySelector("h1")?.textContent).toBe("Title")
  })
  it("injects the late plugins' stylesheets", async () => {
    const styled: AIGuiPlugin = { ...widget, name: "react-late-styles", css: ".late{color:blue}" }
    const load = () => Promise.resolve([styled])
    expect(document.querySelector('style[data-aigui-style="react-late-styles"]')).toBeNull()
    render(<AIRenderer text="hi" plugins={load} />)
    await waitFor(() => expect(document.querySelector('style[data-aigui-style="react-late-styles"]')).not.toBeNull())
  })
  it("keeps rendering plain markdown and reports a failed import", async () => {
    const onDebugEvent = vi.fn()
    const load = () => Promise.reject(new Error("chunk 404"))
    const view = render(<AIRenderer text={"```widget\nhello\n```"} plugins={load} debug onDebugEvent={onDebugEvent} />)
    await waitFor(() => expect(onDebugEvent.mock.calls.map(([event]) => event.type)).toContain("plugins-load-failed"))
    expect(view.container.querySelector("pre")?.textContent).toContain("hello")
  })
  it("still accepts a plain array, with no intermediate redraw", () => {
    const view = render(<AIRenderer text={"```widget\nhello\n```"} plugins={[widget]} />)
    expect(view.container.querySelector("[data-widget]")?.textContent).toBe("hello")
  })
  it("keeps an in-flight card action alive when the plugins land", async () => {
    // Aborting the action the reader just triggered because a diagram library finished loading is
    // never what a host meant.
    const registry = new CardRegistry()
    registry.register({
      type: "poll",
      description: "p",
      render: ({ data, onAction }: { data: unknown; onAction: (action: { type: string; params?: unknown }) => void }) => (
        <button onClick={() => onAction({ type: "vote", params: data })}>vote</button>
      ),
    })
    const actions = new ActionRegistry()
    let actionSignal!: AbortSignal
    actions.register({ type: "vote", run: (_params, context) => { actionSignal = context.signal; return new Promise(() => {}) } })
    const runtime = createActionRuntime({ registry: actions })

    let resolveLoad!: (plugins: AIGuiPlugin[]) => void
    const pending = new Promise<AIGuiPlugin[]>((resolve) => { resolveLoad = resolve })
    const load = () => pending
    const ref = createRef<AIRendererHandle>()
    const view = render(<AIRenderer ref={ref} registry={registry} actionRuntime={runtime} plugins={load} />)
    act(() => ref.current!.push('```card:poll\n{"q":"x"}\n```'))
    fireEvent.click(view.container.querySelector("button")!)

    await act(async () => { resolveLoad([widget]) })

    expect(actionSignal.aborted).toBe(false)
    expect(view.container.querySelector("button")).not.toBeNull()
  })
})
