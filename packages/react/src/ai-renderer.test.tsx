// @vitest-environment jsdom
import { render, act } from "@testing-library/react"
import { createRef } from "react"
import { describe, expect, it, vi } from "vitest"
import { CardRegistry } from "@aigui/core"
import { AIRenderer, type AIRendererHandle } from "./ai-renderer"

describe("AIRenderer", () => {
  it("exposes an imperative push and renders", () => {
    const ref = createRef<AIRendererHandle>()
    const { container } = render(<AIRenderer ref={ref} />)
    act(() => ref.current!.push("# Hi"))
    expect(container.querySelector("h1")?.textContent).toBe("Hi")
  })
  it("renders a card component and routes onCardAction", () => {
    const registry = new CardRegistry()
    registry.register({ type: "poll", description: "p", render: ({ data, onAction }: any) => <button onClick={() => onAction({ type: "vote", params: data })}>vote</button> })
    const onCardAction = vi.fn()
    const ref = createRef<AIRendererHandle>()
    const { container } = render(<AIRenderer ref={ref} registry={registry} onCardAction={onCardAction} />)
    act(() => ref.current!.push('```card:poll\n{"q":"x"}\n```'))
    container.querySelector("button")!.click()
    expect(onCardAction).toHaveBeenCalledWith({ type: "vote", params: { q: "x" }, cardType: "poll" })
  })
})
