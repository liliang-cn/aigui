// @vitest-environment jsdom
import { ActionRegistry, createActionRuntime } from "@ai-gui/core"
import { form } from "@ai-gui/plugin-form"
import { act, render } from "@testing-library/react"
import { createRef } from "react"
import { describe, expect, it, vi } from "vitest"
import { AIRenderer, type AIRendererHandle } from "./ai-renderer"

describe("React form plugin", () => {
  it("mounts and submits an interactive form", async () => {
    const run = vi.fn()
    const registry = new ActionRegistry()
    registry.register({ type: "save", run })
    const plugin = form({ actionRuntime: createActionRuntime({ registry }) })
    const ref = createRef<AIRendererHandle>()
    const view = render(<AIRenderer ref={ref} plugins={[plugin]} />)
    act(() => ref.current?.push('```form\n{"id":"profile","fields":[{"name":"name","type":"text","label":"Name","required":true}],"submitAction":"save"}\n```'))
    const input = view.container.querySelector<HTMLInputElement>('input[name="name"]')!
    input.value = "Ada"
    act(() => ref.current?.push("\nAfter the form"))
    expect(view.container.querySelector<HTMLInputElement>('input[name="name"]')).toBe(input)
    expect(input.value).toBe("Ada")
    view.container.querySelector<HTMLButtonElement>("[data-aigui-form-submit]")!.click()
    await act(async () => { await Promise.resolve() })
    expect(run).toHaveBeenCalledWith({ name: "Ada" }, expect.anything())
  })

  it("cancels a pending form action when the renderer unmounts", async () => {
    const aborted = vi.fn()
    const registry = new ActionRegistry()
    registry.register({
      type: "save",
      run: (_params, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => { aborted(); reject(signal.reason) }, { once: true })
      }),
    })
    const plugin = form({ actionRuntime: createActionRuntime({ registry }) })
    const ref = createRef<AIRendererHandle>()
    const view = render(<AIRenderer ref={ref} plugins={[plugin]} />)
    act(() => ref.current?.push('```form\n{"id":"profile","fields":[],"submitAction":"save"}\n```'))
    view.container.querySelector<HTMLButtonElement>("[data-aigui-form-submit]")!.click()
    view.unmount()
    await Promise.resolve()
    expect(aborted).toHaveBeenCalledOnce()
  })
})
