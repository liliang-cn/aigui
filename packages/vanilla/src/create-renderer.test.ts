// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { CardRegistry } from "@aigui/core"
import { createRenderer } from "./create-renderer"

describe("createRenderer", () => {
  it("push renders into the element", () => {
    const el = document.createElement("div")
    const r = createRenderer(el)
    r.push("# Hi")
    expect(el.querySelector("h1")?.textContent).toBe("Hi")
  })
  it("streaming updates in place (heading node reused, content grows)", () => {
    const el = document.createElement("div")
    const r = createRenderer(el)
    r.push("# Ti"); const first = el.querySelector("h1")
    r.push("tle"); const second = el.querySelector("h1")
    expect(second?.textContent).toBe("Title")
    expect(first).toBe(second) // same element instance reused via keyed reconcile
  })
  it("reset clears the element", () => {
    const el = document.createElement("div")
    const r = createRenderer(el)
    r.push("hello"); r.reset()
    expect(el.children.length).toBe(0)
  })
  it("renders a card and routes onCardAction", () => {
    const registry = new CardRegistry()
    registry.register({ type: "poll", description: "p", render: (data: any, api: any) => { const b = document.createElement("button"); b.onclick = () => api.onAction({ type: "vote", params: data }); return b } })
    const onCardAction = vi.fn()
    const el = document.createElement("div")
    const r = createRenderer(el, { registry, onCardAction })
    r.push('```card:poll\n{"q":"x"}\n```')
    el.querySelector("button")!.click()
    expect(onCardAction).toHaveBeenCalledWith({ type: "vote", params: { q: "x" }, cardType: "poll" })
  })
})
