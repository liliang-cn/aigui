// @vitest-environment jsdom
import { ActionRegistry, createActionRuntime } from "@ai-gui/core"
import { form } from "@ai-gui/plugin-form"
import { mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"
import { AIRenderer } from "./ai-renderer"

describe("Vue form plugin", () => {
  it("mounts and submits an interactive form", async () => {
    const run = vi.fn()
    const registry = new ActionRegistry()
    registry.register({ type: "save", run })
    const wrapper = mount(AIRenderer, { props: { plugins: [form({ actionRuntime: createActionRuntime({ registry }) })] } })
    wrapper.vm.push('```form\n{"id":"profile","fields":[{"name":"name","type":"text","label":"Name","required":true}],"submitAction":"save"}\n```')
    await wrapper.vm.$nextTick()
    const input = wrapper.element.querySelector<HTMLInputElement>('input[name="name"]')!
    input.value = "Ada"
    wrapper.element.querySelector<HTMLButtonElement>("[data-aigui-form-submit]")!.click()
    await Promise.resolve()
    await Promise.resolve()
    expect(run).toHaveBeenCalledWith({ name: "Ada" }, expect.anything())
    expect(input.disabled).toBe(true)
    expect(wrapper.element.querySelector("[data-aigui-form-submitted]")).toBeTruthy()
    wrapper.element.querySelector<HTMLButtonElement>("[data-aigui-form-submit]")!.click()
    expect(run).toHaveBeenCalledTimes(1)
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
    const wrapper = mount(AIRenderer, { props: { plugins: [form({ actionRuntime: createActionRuntime({ registry }) })] } })
    wrapper.vm.push('```form\n{"id":"profile","fields":[],"submitAction":"save"}\n```')
    await wrapper.vm.$nextTick()
    wrapper.element.querySelector<HTMLButtonElement>("[data-aigui-form-submit]")!.click()
    wrapper.unmount()
    await Promise.resolve()
    expect(aborted).toHaveBeenCalledOnce()
  })
})
