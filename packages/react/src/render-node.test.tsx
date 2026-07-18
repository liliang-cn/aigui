// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ASTNode } from "@aigui/core"
import { CardRegistry } from "@aigui/core"
import { renderNode } from "./render-node"

describe("renderNode", () => {
  it("renders a paragraph's html", () => {
    const node: ASTNode = { key: "0:p", type: "paragraph", tag: "p", html: "a <strong>b</strong>" }
    const { container } = render(<>{renderNode(node, {})}</>)
    expect(container.querySelector("strong")?.textContent).toBe("b")
  })
  it("renders a heading with the right tag", () => {
    const node: ASTNode = { key: "0:h", type: "heading", tag: "h2", html: "Title" }
    const { container } = render(<>{renderNode(node, {})}</>)
    expect(container.querySelector("h2")?.textContent).toBe("Title")
  })
  it("renders a code node", () => {
    const node: ASTNode = { key: "0:c", type: "code", content: "const a=1", attrs: { lang: "ts" } }
    const { container } = render(<>{renderNode(node, {})}</>)
    expect(container.querySelector("code")?.textContent).toContain("const a=1")
  })
  it("renders a registered card component and fires onCardAction", () => {
    const registry = new CardRegistry()
    function Flight({ data, onAction }: any) {
      return <button onClick={() => onAction({ type: "book", params: data })}>book</button>
    }
    registry.register({ type: "flight", description: "f", render: Flight })
    const onCardAction = vi.fn()
    const node: ASTNode = { key: "0:card", type: "card", card: { type: "flight", data: { id: 1 }, complete: true, valid: true } }
    const { container } = render(<>{renderNode(node, { registry, onCardAction })}</>)
    container.querySelector("button")!.click()
    expect(onCardAction).toHaveBeenCalledWith({ type: "book", params: { id: 1 }, cardType: "flight" })
  })
  it("renders a raw fallback (not a skeleton) for a complete-but-invalid card", () => {
    const node: ASTNode = { key: "0:card", type: "card", card: { type: "flight", data: { partial: 1 }, complete: true, valid: false } }
    const { container } = render(<>{renderNode(node, {})}</>)
    expect(container.querySelector("[data-aigui-card-loading]")).toBeNull()
    expect(container.querySelector("[data-aigui-card-invalid]")).toBeTruthy()
    expect(container.textContent).toContain("partial")
  })
  it("still renders a skeleton for an incomplete card", () => {
    const node: ASTNode = { key: "0:card", type: "card", card: { type: "flight", data: {}, complete: false, valid: false } }
    const { container } = render(<>{renderNode(node, {})}</>)
    expect(container.querySelector("[data-aigui-card-loading]")).toBeTruthy()
  })
  it("sanitizes content in the default/unknown node branch", () => {
    const node: ASTNode = { key: "0:x", type: "callout", content: "<img src=x onerror=alert(1)>" }
    const { container } = render(<>{renderNode(node, {})}</>)
    expect(container.innerHTML).not.toContain("onerror")
  })
  it("renders an hr node", () => {
    const node: ASTNode = { key: "0:hr", type: "hr" }
    const { container } = render(<>{renderNode(node, {})}</>)
    expect(container.querySelector("hr")).toBeTruthy()
  })
  it("injects an html node's content", () => {
    const node: ASTNode = { key: "0:html", type: "html", content: "<span>raw</span>" }
    const { container } = render(<>{renderNode(node, {})}</>)
    expect(container.querySelector("span")?.textContent).toBe("raw")
  })
})
