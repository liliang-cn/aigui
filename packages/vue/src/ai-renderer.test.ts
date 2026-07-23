// @vitest-environment jsdom
import { mount } from "@vue/test-utils"
import { defineComponent, h, nextTick } from "vue"
import { describe, expect, it, vi } from "vitest"
import { CardRegistry } from "@ai-gui/core"
import { AIRenderer } from "./ai-renderer"

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
})
