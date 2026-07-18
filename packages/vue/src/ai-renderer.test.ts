// @vitest-environment jsdom
import { mount } from "@vue/test-utils"
import { defineComponent, h, nextTick } from "vue"
import { describe, expect, it, vi } from "vitest"
import { CardRegistry } from "@aigui/core"
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
})
