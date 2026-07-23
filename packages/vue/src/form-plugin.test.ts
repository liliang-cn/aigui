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
    input.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await Promise.resolve()
    expect(run).toHaveBeenCalledWith({ name: "Ada" }, expect.anything())
  })
})
