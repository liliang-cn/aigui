// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import type { ASTNode } from "@ai-gui/core"
import { CardRegistry } from "@ai-gui/core"
import { renderNodeToElement } from "./render-node-dom"

describe("renderNodeToElement", () => {
  it("renders a paragraph's html", () => {
    const el = renderNodeToElement({ key: "0:p", type: "paragraph", tag: "p", html: "a <strong>b</strong>" }, {})
    expect(el.tagName).toBe("P"); expect(el.querySelector("strong")?.textContent).toBe("b")
  })
  it("renders a heading tag", () => {
    const el = renderNodeToElement({ key: "0:h", type: "heading", tag: "h3", html: "T" }, {})
    expect(el.tagName).toBe("H3")
  })
  it("renders code text", () => {
    const el = renderNodeToElement({ key: "0:c", type: "code", content: "x=1", attrs: { lang: "ts" } }, {})
    expect(el.querySelector("code")?.textContent).toBe("x=1")
  })
  it("renders an incomplete card as a loading skeleton", () => {
    const el = renderNodeToElement({ key: "0:card", type: "card", card: { type: "f", data: {}, complete: false, valid: false } }, {})
    expect(el.hasAttribute("data-aigui-card-loading")).toBe(true)
  })
  it("renders a complete-but-invalid card as raw fallback (not skeleton)", () => {
    const el = renderNodeToElement({ key: "0:card", type: "card", card: { type: "f", data: { a: 1 }, complete: true, valid: false } }, {})
    expect(el.hasAttribute("data-aigui-card-loading")).toBe(false)
    expect(el.hasAttribute("data-aigui-card-invalid")).toBe(true)
    expect(el.textContent).toContain("a")
  })
  it("renders a registered card element and routes onAction", () => {
    const registry = new CardRegistry()
    registry.register({ type: "poll", description: "p", render: (data: any, api: any) => { const b = document.createElement("button"); b.textContent = "vote"; b.onclick = () => api.onAction({ type: "vote", params: data }); return b } })
    const onCardAction = vi.fn()
    const el = renderNodeToElement({ key: "0:card", type: "card", card: { type: "poll", data: { q: "x" }, complete: true, valid: true } }, { registry, onCardAction })
    el.querySelector("button")!.click()
    expect(onCardAction).toHaveBeenCalledWith({ type: "vote", params: { q: "x" }, cardType: "poll" })
  })
  it("honors sanitize false and custom sanitizers", () => {
    const raw = renderNodeToElement({ key: "raw", type: "custom", content: '<img src="x" data-raw="yes">' }, { sanitize: false })
    expect(raw.querySelector("img")?.getAttribute("data-raw")).toBe("yes")
    const custom = renderNodeToElement({ key: "custom", type: "custom", content: "raw" }, { sanitize: { sanitizer: () => "<b>custom</b>" } })
    expect(custom.querySelector("b")?.textContent).toBe("custom")
  })
})
