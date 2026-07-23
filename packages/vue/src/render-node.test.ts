// @vitest-environment jsdom
import { mount } from "@vue/test-utils"
import { defineComponent, h, nextTick, ref } from "vue"
import { describe, expect, it, vi } from "vitest"
import type { ASTNode } from "@ai-gui/core"
import { CardRegistry, CardStore } from "@ai-gui/core"
import { renderNode } from "./render-node"

const wrap = (node: ASTNode, ctx: any) => mount({ render: () => renderNode(node, ctx) })

describe("renderNode", () => {
  it("renders a paragraph's html", () => {
    const w = wrap({ key: "0:p", type: "paragraph", tag: "p", html: "a <strong>b</strong>" }, {})
    expect(w.find("strong").text()).toBe("b")
  })
  it("renders a heading tag", () => {
    const w = wrap({ key: "0:h", type: "heading", tag: "h3", html: "T" }, {})
    expect(w.find("h3").exists()).toBe(true)
  })
  it("renders code text", () => {
    const w = wrap({ key: "0:c", type: "code", content: "x=1", attrs: { lang: "ts" } }, {})
    expect(w.find("code").text()).toBe("x=1")
  })
  it("renders a loading skeleton for an incomplete card", () => {
    const w = wrap({ key: "0:card", type: "card", card: { type: "f", data: {}, complete: false, valid: false } }, {})
    expect(w.find("[data-aigui-card-loading]").exists()).toBe(true)
  })
  it("renders a raw fallback for a complete-but-invalid card", () => {
    const w = wrap({ key: "0:card", type: "card", card: { type: "f", data: { a: 1 }, complete: true, valid: false } }, {})
    expect(w.find("[data-aigui-card-loading]").exists()).toBe(false)
    expect(w.find("[data-aigui-card-invalid]").exists()).toBe(true)
    expect(w.text()).toContain("a")
  })
  it("renders a registered card component and routes onCardAction", () => {
    const registry = new CardRegistry()
    const Poll = defineComponent({ props: ["data"], emits: ["action"], setup(props, { emit }) { return () => h("button", { onClick: () => emit("action", { type: "vote", params: props.data }) }, "vote") } })
    registry.register({ type: "poll", description: "p", render: Poll })
    const onCardAction = vi.fn()
    const w = wrap({ key: "0:card", type: "card", card: { type: "poll", data: { q: "x" }, complete: true, valid: true } }, { registry, onCardAction })
    w.find("button").trigger("click")
    expect(onCardAction).toHaveBeenCalledWith({ type: "vote", params: { q: "x" }, cardType: "poll" })
  })
  it("keeps cards without ids compatible when a store is provided", () => {
    const registry = new CardRegistry()
    const store = new CardStore({ registry })
    const Poll = defineComponent({ props: ["data", "state"], setup: (props) => () => h("span", `${props.data.q}:${String(props.state)}`) })
    registry.register({ type: "poll", description: "p", render: Poll })

    const w = wrap(
      { key: "0:card", type: "card", card: { type: "poll", data: { q: "x" }, complete: true, valid: true } },
      { registry, cardStore: store },
    )

    expect(w.find("span").text()).toBe("x:undefined")
    expect(store.list()).toEqual([])
  })
  it("shows fallback after delete and recovers when the card is restored", async () => {
    const registry = new CardRegistry()
    const store = new CardStore({ registry })
    const Counter = defineComponent({ props: ["data"], setup: (props) => () => h("span", props.data.count) })
    registry.register({ type: "counter", description: "counter", render: Counter })
    const w = wrap(
      { key: "0:card", type: "card", card: { id: "one", type: "counter", data: { id: "one", count: 1 }, complete: true, valid: true } },
      { registry, cardStore: store },
    )

    store.delete("one")
    await nextTick()
    expect(w.find("[data-aigui-card-fallback]").exists()).toBe(true)

    store.restore({ version: 1, cards: [{ id: "one", type: "counter", data: { id: "one", count: 2 }, revision: 1 }] })
    await nextTick()
    expect(w.find("span").text()).toBe("2")
  })
  it("recovers from an initial type conflict after restore", async () => {
    const registry = new CardRegistry()
    const store = new CardStore({ registry })
    const Counter = defineComponent({ props: ["data"], setup: (props) => () => h("span", props.data.count) })
    registry.register({ type: "counter", description: "counter", render: Counter })
    registry.register({ type: "other", description: "other" })
    store.register({ id: "one", type: "other", data: { id: "one" } })

    const w = wrap(
      { key: "0:card", type: "card", card: { id: "one", type: "counter", data: { id: "one", count: 1 }, complete: true, valid: true } },
      { registry, cardStore: store },
    )
    expect(w.find("[data-aigui-card-fallback]").exists()).toBe(true)

    store.restore({ version: 1, cards: [{ id: "one", type: "counter", data: { id: "one", count: 2 }, revision: 1 }] })
    await nextTick()

    expect(w.find("span").text()).toBe("2")
  })
  it("rebinds id and type changes on the same vnode and routes actions to the latest card", async () => {
    const registry = new CardRegistry()
    const store = new CardStore({ registry })
    const unsubscribed: string[] = []
    const subscribe = vi.spyOn(store, "subscribe").mockImplementation((id, listener) => {
      const stop = CardStore.prototype.subscribe.call(store, id, listener)
      return () => { unsubscribed.push(id); stop() }
    })
    const Card = defineComponent({
      props: ["data"],
      emits: ["action"],
      setup: (props, { emit }) => () => h("button", { onClick: () => emit("action", { type: "select", params: props.data.id }) }, props.data.id),
    })
    registry.register({ type: "first", description: "first", render: Card })
    registry.register({ type: "second", description: "second", render: Card })
    const onCardAction = vi.fn()
    const node = ref<ASTNode>({ key: "same", type: "card", card: { id: "one", type: "first", data: { id: "one" }, complete: true, valid: true } })
    const w = mount(defineComponent({ setup: () => () => renderNode(node.value, { registry, cardStore: store, onCardAction }) }))

    node.value = { key: "same", type: "card", card: { id: "two", type: "second", data: { id: "two" }, complete: true, valid: true } }
    await nextTick()
    expect(w.find("button").text()).toBe("two")
    await w.find("button").trigger("click")

    expect(subscribe.mock.calls.map(([id]) => id)).toEqual(["one", "two"])
    expect(unsubscribed).toEqual(["one"])
    expect(onCardAction).toHaveBeenCalledWith({ type: "select", params: "two", cardType: "second", cardId: "two" })
  })
  it("registers an identified card before falling back when no render component exists", async () => {
    const registry = new CardRegistry()
    const store = new CardStore({ registry })
    registry.register({ type: "headless", description: "headless" })

    const w = wrap(
      { key: "0:card", type: "card", card: { id: "one", type: "headless", data: { id: "one", value: 1 }, complete: true, valid: true } },
      { registry, cardStore: store },
    )
    await nextTick()

    expect(store.get("one")).toMatchObject({ id: "one", type: "headless", data: { id: "one", value: 1 } })
    expect(w.find("[data-aigui-card-fallback]").exists()).toBe(true)
    store.apply({ op: "merge", cardId: "one", data: { value: 2 } })
    await nextTick()
    expect(w.text()).toContain('"value": 2')
  })
  it("recovers fallback data from an initial type conflict when no render component exists", async () => {
    const registry = new CardRegistry()
    const store = new CardStore({ registry })
    registry.register({ type: "headless", description: "headless" })
    registry.register({ type: "other", description: "other" })
    store.register({ id: "one", type: "other", data: { id: "one" } })

    const w = wrap(
      { key: "0:card", type: "card", card: { id: "one", type: "headless", data: { id: "one", value: 1 }, complete: true, valid: true } },
      { registry, cardStore: store },
    )
    expect(w.text()).toContain('"value": 1')

    store.restore({ version: 1, cards: [{ id: "one", type: "headless", data: { id: "one", value: 2 }, revision: 1 }] })
    await nextTick()

    expect(w.find("[data-aigui-card-fallback]").exists()).toBe(true)
    expect(w.text()).toContain('"value": 2')
  })
  it("honors sanitize false and custom sanitizers", () => {
    const raw = wrap({ key: "raw", type: "custom", content: '<img src="x" data-raw="yes">' }, { sanitize: false })
    expect(raw.find("img").attributes("data-raw")).toBe("yes")
    const custom = wrap({ key: "custom", type: "custom", content: "raw" }, { sanitize: { sanitizer: () => "<b>custom</b>" } })
    expect(custom.find("b").text()).toBe("custom")
  })
})
