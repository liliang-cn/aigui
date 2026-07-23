// @vitest-environment jsdom
import { mount } from "@vue/test-utils"
import { defineComponent, h } from "vue"
import { describe, expect, it, vi } from "vitest"
import type { ASTNode } from "@ai-gui/core"
import { CardRegistry } from "@ai-gui/core"
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
  it("honors sanitize false and custom sanitizers", () => {
    const raw = wrap({ key: "raw", type: "custom", content: '<img src="x" data-raw="yes">' }, { sanitize: false })
    expect(raw.find("img").attributes("data-raw")).toBe("yes")
    const custom = wrap({ key: "custom", type: "custom", content: "raw" }, { sanitize: { sanitizer: () => "<b>custom</b>" } })
    expect(custom.find("b").text()).toBe("custom")
  })
})
