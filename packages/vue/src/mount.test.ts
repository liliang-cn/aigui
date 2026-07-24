// @vitest-environment jsdom
import { mount as vueMount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"
import { CardRegistry, type ASTNode, type AIGuiPlugin, type MountedCardSlot, type RenderMountContext } from "@ai-gui/core"
import { renderNode } from "./render-node"
import { renderOutput } from "./render-output"
import { defineComponent, h, nextTick, onUnmounted, ref } from "vue"

describe("vue mount RenderOutput", () => {
  it("calls mount with a DOM element and cleanup on unmount", async () => {
    const cleanup = vi.fn()
    const mountFn = vi.fn((el: HTMLElement) => { el.setAttribute("data-mounted", ""); return cleanup })
    const plugin: AIGuiPlugin = { name: "live", nodeRenderers: { live: () => ({ kind: "mount", mount: mountFn }) } }
    const node: ASTNode = { key: "0:live", type: "live", content: "" }
    const w = vueMount({ render: () => renderNode(node, { plugins: [plugin] }) })
    expect(mountFn).toHaveBeenCalledTimes(1)
    expect(w.find("[data-mounted]").exists()).toBe(true)
    w.unmount()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
  it("cleans up and remounts when the mount prop changes", async () => {
    const firstCleanup = vi.fn()
    const secondCleanup = vi.fn()
    const current = ref<(el: HTMLElement) => void | (() => void)>(() => firstCleanup)
    const second = vi.fn(() => secondCleanup)
    const w = vueMount({ setup: () => () => h("div", [renderOutput({ kind: "mount", mount: current.value })]) })
    current.value = second
    await w.vm.$nextTick()
    expect(firstCleanup).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    w.unmount()
    expect(secondCleanup).toHaveBeenCalledTimes(1)
  })
  it("mounts, updates, routes actions, and idempotently destroys a registered Vue card slot", async () => {
    const registry = new CardRegistry()
    const onCardAction = vi.fn()
    const unmounted = vi.fn()
    const Card = defineComponent({
      props: ["data"],
      emits: ["action"],
      setup(props, { emit }) {
        onUnmounted(unmounted)
        return () => h("button", { onClick: () => emit("action", { type: "select", params: props.data.value }) }, props.data.value)
      },
    })
    registry.register({ type: "choice", description: "choice", render: Card })
    let slot: MountedCardSlot | undefined
    let slotHost: HTMLElement | undefined
    const plugin: AIGuiPlugin = {
      name: "card-slot",
      nodeRenderers: {
        slot: () => ({
          kind: "mount",
          mount(el, context) {
            slotHost = el
            slot = context.mountCard?.(el, { type: "choice", data: { value: "one" } })
            return () => slot?.destroy()
          },
        }),
      },
    }
    const node: ASTNode = { key: "0:slot", type: "slot", content: "" }
    const w = vueMount({ render: () => renderNode(node, { plugins: [plugin], registry, onCardAction }) })

    const host = w.find("[data-aigui-mount]").element
    expect(slotHost).toBe(host)
    expect(w.find("button").text()).toBe("one")
    await w.find("button").trigger("click")
    expect(onCardAction).toHaveBeenCalledWith({ type: "select", params: "one", cardType: "choice" })

    slot?.update({ value: "two" })
    await nextTick()
    expect(w.find("[data-aigui-mount]").element).toBe(host)
    expect(w.find("button").text()).toBe("two")

    slot?.destroy()
    slot?.destroy()
    expect(unmounted).toHaveBeenCalledTimes(1)
    expect(host.childElementCount).toBe(0)
    w.unmount()
    expect(unmounted).toHaveBeenCalledTimes(1)
  })
  it("returns undefined for an unknown card type", () => {
    const registry = new CardRegistry()
    let mounted: MountedCardSlot | undefined
    const plugin: AIGuiPlugin = {
      name: "unknown-card-slot",
      nodeRenderers: {
        slot: () => ({
          kind: "mount",
          mount(el, context) {
            mounted = context.mountCard?.(el, { type: "missing", data: {} })
          },
        }),
      },
    }
    const w = vueMount({ render: () => renderNode({ key: "slot", type: "slot" }, { plugins: [plugin], registry }) })
    expect(mounted).toBeUndefined()
    expect(w.find("[data-aigui-mount]").element.childElementCount).toBe(0)
  })
  it("passes the card mount context to async plugin outputs", async () => {
    const registry = new CardRegistry()
    registry.register({ type: "async-card", description: "async", render: defineComponent({ props: ["data"], setup: (props) => () => h("span", props.data.label) }) })
    let received: RenderMountContext | undefined
    const plugin: AIGuiPlugin = {
      name: "async-slot",
      nodeRenderers: {
        slot: async () => ({
          kind: "mount",
          mount(el, context) {
            received = context
            context.mountCard?.(el, { type: "async-card", data: { label: "ready" } })
          },
        }),
      },
    }
    const w = vueMount({ render: () => renderNode({ key: "slot", type: "slot" }, { plugins: [plugin], registry }) })
    await Promise.resolve()
    await nextTick()
    expect(received?.mountCard).toBeTypeOf("function")
    expect(w.find("span").text()).toBe("ready")
  })
})
