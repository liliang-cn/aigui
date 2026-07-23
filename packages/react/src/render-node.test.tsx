// @vitest-environment jsdom
import { act, fireEvent, render } from "@testing-library/react"
import { createElement, StrictMode, useState } from "react"
import { createRoot, hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import type { AIGuiPlugin, ASTNode } from "@ai-gui/core"
import { CardRegistry, CardStore } from "@ai-gui/core"
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
  it("uses a card store record for identified cards and preserves the component instance", () => {
    const registry = new CardRegistry()
    const store = new CardStore({ registry })
    let mounts = 0
    function Counter({ data, state }: any) {
      const [local, setLocal] = useState(0)
      useState(() => { mounts++; return undefined })
      return <button onClick={() => setLocal((value) => value + 1)}>{data.count}:{state.status}:{local}</button>
    }
    registry.register({ type: "counter", description: "c", render: Counter })
    const node: ASTNode = { key: "0:card", type: "card", card: { id: "one", type: "counter", data: { id: "one", count: 1 }, complete: true, valid: true } }
    const view = render(<>{renderNode(node, { registry, cardStore: store })}</>)

    fireEvent.click(view.container.querySelector("button")!)
    act(() => store.apply({ op: "merge", cardId: "one", data: { count: 2 } }))

    expect(view.container.querySelector("button")?.textContent).toBe("2:idle:1")
    expect(mounts).toBe(1)
  })
  it("adds cardId to identified card actions while keeping no-id cards compatible", () => {
    const registry = new CardRegistry()
    const store = new CardStore({ registry })
    registry.register({
      type: "flight",
      description: "f",
      render: ({ data, state, onAction }: any) => <button onClick={() => onAction({ type: "book", params: data })}>{state?.status ?? "legacy"}</button>,
    })
    const onCardAction = vi.fn()
    const identified: ASTNode = { key: "identified", type: "card", card: { id: "flight-1", type: "flight", data: { id: "flight-1" }, complete: true, valid: true } }
    const legacy: ASTNode = { key: "legacy", type: "card", card: { type: "flight", data: { route: "A" }, complete: true, valid: true } }
    const view = render(<>{renderNode(identified, { registry, cardStore: store, onCardAction })}{renderNode(legacy, { registry, cardStore: store, onCardAction })}</>)

    fireEvent.click(view.getByText("idle"))
    fireEvent.click(view.getByText("legacy"))

    expect(onCardAction).toHaveBeenNthCalledWith(1, { type: "book", params: { id: "flight-1" }, cardType: "flight", cardId: "flight-1" })
    expect(onCardAction).toHaveBeenNthCalledWith(2, { type: "book", params: { route: "A" }, cardType: "flight" })
  })
  it("contains card store registration failures", () => {
    const registry = new CardRegistry()
    registry.register({ type: "flight", description: "f", render: () => <span>flight</span> })
    registry.register({ type: "other", description: "o", render: () => <span>other</span> })
    const store = new CardStore({ registry })
    store.register({ id: "same", type: "other", data: { id: "same" } })
    const node: ASTNode = { key: "card", type: "card", card: { id: "same", type: "flight", data: { id: "same" }, complete: true, valid: true } }

    const view = render(<>{renderNode(node, { registry, cardStore: store })}</>)

    expect(view.container.querySelector("[data-aigui-card-invalid]")).toBeTruthy()
    expect(view.queryByText("flight")).toBeNull()
  })
  it("registers identified cards even when they use the fallback renderer", () => {
    const registry = new CardRegistry()
    registry.register({ type: "flight", description: "f" })
    const store = new CardStore({ registry })
    const node: ASTNode = { key: "card", type: "card", card: { id: "one", type: "flight", data: { id: "one", route: "A" }, complete: true, valid: true } }

    const view = render(<>{renderNode(node, { registry, cardStore: store })}</>)

    expect(store.get("one")?.data).toMatchObject({ route: "A" })
    expect(view.container.querySelector("[data-aigui-card-fallback]")).toBeTruthy()
  })
  it("registers an identified card once after a StrictMode commit", () => {
    const registry = new CardRegistry()
    registry.register({ type: "flight", description: "f", render: ({ data }: any) => <span>{data.route}</span> })
    const store = new CardStore({ registry })
    const register = vi.spyOn(store, "register")
    const node: ASTNode = { key: "card", type: "card", card: { id: "one", type: "flight", data: { id: "one", route: "A" }, complete: true, valid: true } }

    const view = render(<StrictMode>{renderNode(node, { registry, cardStore: store })}</StrictMode>)

    expect(register).toHaveBeenCalledOnce()
    expect(view.getByText("A")).toBeTruthy()
  })
  it("does not mutate the card store during SSR", () => {
    const registry = new CardRegistry()
    registry.register({ type: "flight", description: "f", render: ({ data }: any) => <span>{data.route}</span> })
    const store = new CardStore({ registry })
    const node: ASTNode = { key: "card", type: "card", card: { id: "one", type: "flight", data: { id: "one", route: "A" }, complete: true, valid: true } }

    const html = renderToString(createElement(() => renderNode(node, { registry, cardStore: store })))

    expect(store.get("one")).toBeUndefined()
    expect(html).toContain("data-aigui-card-fallback")
  })
  it("hydrates identified cards from the SSR fallback before reading the client store", async () => {
    const registry = new CardRegistry()
    registry.register({ type: "flight", description: "f", render: ({ data }: any) => <span>{data.route}</span> })
    const store = new CardStore({ registry })
    const node: ASTNode = { key: "card", type: "card", card: { id: "one", type: "flight", data: { id: "one", route: "A" }, complete: true, valid: true } }
    const ui = createElement(() => renderNode(node, { registry, cardStore: store }))
    const container = document.createElement("div")
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    container.innerHTML = renderToString(ui)
    document.body.append(container)

    store.register({ id: "one", type: "flight", data: { id: "one", route: "B" } })
    const root = hydrateRoot(container, ui)

    try {
      expect(container.querySelector("[data-aigui-card-fallback]")).toBeTruthy()
      await act(async () => {})
      expect(container.querySelector("span")?.textContent).toBe("B")
      expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(/hydration|did not match|server html/i)
    } finally {
      await act(async () => root.unmount())
      container.remove()
      consoleError.mockRestore()
    }
  })
  it("does not register a card from a concurrent render that never commits", () => {
    const registry = new CardRegistry()
    registry.register({ type: "flight", description: "f", render: () => <span>flight</span> })
    const store = new CardStore({ registry })
    const node: ASTNode = { key: "card", type: "card", card: { id: "one", type: "flight", data: { id: "one" }, complete: true, valid: true } }
    const container = document.createElement("div")
    const root = createRoot(container)

    root.render(<>{renderNode(node, { registry, cardStore: store })}</>)
    root.unmount()

    expect(store.get("one")).toBeUndefined()
  })
  it("keeps deleted cards missing and resumes rendering when the same id is restored", () => {
    const registry = new CardRegistry()
    registry.register({ type: "flight", description: "f", render: ({ data }: any) => <span>{data.route}</span> })
    const store = new CardStore({ registry })
    const node: ASTNode = { key: "card", type: "card", card: { id: "one", type: "flight", data: { id: "one", route: "A" }, complete: true, valid: true } }
    const view = render(<>{renderNode(node, { registry, cardStore: store })}</>)

    act(() => store.delete("one"))
    expect(store.get("one")).toBeUndefined()
    expect(view.container.querySelector("[data-aigui-card-fallback]")).toBeTruthy()
    expect(view.container.querySelector("span")).toBeNull()

    act(() => store.restore({ version: 1, cards: [{ id: "one", type: "flight", data: { id: "one", route: "B" }, revision: 2 }] }))
    expect(view.getByText("B")).toBeTruthy()
  })
  it("does not revive cards removed by clear or restore", () => {
    const registry = new CardRegistry()
    registry.register({ type: "flight", description: "f", render: ({ data }: any) => <span>{data.route}</span> })
    const store = new CardStore({ registry })
    const node: ASTNode = { key: "card", type: "card", card: { id: "one", type: "flight", data: { id: "one", route: "A" }, complete: true, valid: true } }
    const view = render(<>{renderNode(node, { registry, cardStore: store })}</>)

    act(() => store.clear())
    expect(store.get("one")).toBeUndefined()
    expect(view.container.querySelector("span")).toBeNull()

    act(() => store.restore({ version: 1, cards: [{ id: "one", type: "flight", data: { id: "one", route: "B" }, revision: 1 }] }))
    expect(view.container.querySelector("span")?.textContent).toBe("B")
    act(() => store.restore({ version: 1, cards: [] }))
    expect(store.get("one")).toBeUndefined()
    expect(view.container.querySelector("span")).toBeNull()
  })
  it("unsubscribes the old card and registers a new id and type when a node key is reused", () => {
    const registry = new CardRegistry()
    registry.register({ type: "flight", description: "f", render: ({ data }: any) => <span>{data.route}</span> })
    registry.register({ type: "train", description: "t", render: ({ data }: any) => <span>{data.route}</span> })
    const store = new CardStore({ registry })
    const firstData = { id: "one", route: "A" }
    const secondData = { id: "two", route: "B" }
    const card = (id: string, type: string, data: unknown): ASTNode => ({ key: "card", type: "card", card: { id, type, data, complete: true, valid: true } })
    const view = render(<>{renderNode(card("one", "flight", firstData), { registry, cardStore: store })}</>)

    view.rerender(<>{renderNode(card("two", "train", secondData), { registry, cardStore: store })}</>)
    expect(store.get("two")?.data).toEqual(secondData)
    expect(store.get("two")?.type).toBe("train")
    expect(view.container.querySelector("span")?.textContent).toBe("B")

    act(() => store.apply({ op: "merge", cardId: "one", data: { route: "old" } }))
    expect(view.container.querySelector("span")?.textContent).toBe("B")
    act(() => store.apply({ op: "merge", cardId: "two", data: { route: "C" } }))
    expect(view.container.querySelector("span")?.textContent).toBe("C")
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
  it("honors sanitize false for trusted direct rendering", () => {
    const node: ASTNode = { key: "0:x", type: "callout", content: '<img src="x" data-raw="yes">' }
    const { container } = render(<>{renderNode(node, { sanitize: false })}</>)
    expect(container.querySelector("img")?.getAttribute("data-raw")).toBe("yes")
  })
  it("honors a custom sanitizer", () => {
    const node: ASTNode = { key: "0:x", type: "callout", content: "raw" }
    const { container } = render(<>{renderNode(node, { sanitize: { sanitizer: () => "<b>custom</b>" } })}</>)
    expect(container.querySelector("b")?.textContent).toBe("custom")
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
  it("contains plugin renderer exceptions", () => {
    const plugin: AIGuiPlugin = { name: "bad", nodeRenderers: { bad: () => { throw new Error("boom") } } }
    const node: ASTNode = { key: "bad", type: "bad", content: "safe fallback" }
    expect(() => render(<>{renderNode(node, { plugins: [plugin] })}</>)).not.toThrow()
  })
})
