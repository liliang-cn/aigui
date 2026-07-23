// @vitest-environment jsdom
import { ActionRegistry, createActionRuntime } from "@ai-gui/core"
import { form } from "@ai-gui/plugin-form"
import { describe, expect, it, vi } from "vitest"
import { createRenderer } from "./create-renderer"

describe("Vanilla form plugin", () => {
  it("mounts and submits an interactive form", async () => {
    const run = vi.fn()
    const registry = new ActionRegistry()
    registry.register({ type: "save", run })
    const host = document.createElement("div")
    const renderer = createRenderer(host, { plugins: [form({ actionRuntime: createActionRuntime({ registry }) })] })
    renderer.push('```form\n{"id":"profile","fields":[{"name":"name","type":"text","label":"Name","required":true}],"submitAction":"save"}\n```')
    await Promise.resolve()
    const input = host.querySelector<HTMLInputElement>('input[name="name"]')!
    input.value = "Ada"
    input.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await Promise.resolve()
    expect(run).toHaveBeenCalledWith({ name: "Ada" }, expect.anything())
  })
})
