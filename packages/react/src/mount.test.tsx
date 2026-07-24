// @vitest-environment jsdom
import { act, fireEvent, render } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { CardRegistry, type ASTNode, type AIGuiPlugin, type MountedCardSlot, type RenderMountContext } from "@ai-gui/core"
import { renderNode } from "./render-node"
import { renderOutput } from "./render-output"

describe("react mount RenderOutput", () => {
  it("calls mount with a DOM element and cleanup on unmount", () => {
    const cleanup = vi.fn()
    const mount = vi.fn((el: HTMLElement) => { el.setAttribute("data-mounted", ""); return cleanup })
    const plugin: AIGuiPlugin = { name: "live", nodeRenderers: { live: () => ({ kind: "mount", mount }) } }
    const node: ASTNode = { key: "0:live", type: "live", content: "" }
    const { container, unmount } = render(<>{renderNode(node, { plugins: [plugin] })}</>)
    expect(mount).toHaveBeenCalledTimes(1)
    expect(container.querySelector("[data-mounted]")).toBeTruthy()
    unmount()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
  it("cleans up and remounts when the mount function changes", () => {
    const firstCleanup = vi.fn()
    const secondCleanup = vi.fn()
    const first = vi.fn(() => firstCleanup)
    const second = vi.fn(() => secondCleanup)
    const { rerender, unmount } = render(<>{renderOutput({ kind: "mount", mount: first })}</>)
    rerender(<>{renderOutput({ kind: "mount", mount: second })}</>)
    expect(firstCleanup).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    unmount()
    expect(secondCleanup).toHaveBeenCalledTimes(1)
  })

  it("mounts and updates a registered React card without replacing its slot host", () => {
    const registry = new CardRegistry()
    let componentMounts = 0
    function Counter({ data }: any) {
      const [local] = useState(() => { componentMounts++; return "stable" })
      return <span>{data.count}:{local}</span>
    }
    registry.register({ type: "counter", description: "counter", render: Counter })
    let slot!: MountedCardSlot
    let slotHost!: HTMLElement
    const plugin: AIGuiPlugin = {
      name: "card-slot",
      nodeRenderers: {
        slot: () => ({
          kind: "mount",
          mount: (el, context) => {
            slotHost = document.createElement("section")
            el.append(slotHost)
            slot = context.mountCard!(slotHost, { type: "counter", data: { count: 1 } })!
          },
        }),
      },
    }
    const node: ASTNode = { key: "0:slot", type: "slot", content: "" }
    const view = render(<>{renderNode(node, { plugins: [plugin], registry })}</>)
    const originalHost = slotHost

    expect(view.getByText("1:stable")).toBeTruthy()
    act(() => slot.update({ count: 2 }))

    expect(view.getByText("2:stable")).toBeTruthy()
    expect(slotHost).toBe(originalHost)
    expect(componentMounts).toBe(1)
  })

  it("routes mounted card actions with cardType and destroys idempotently", () => {
    const registry = new CardRegistry()
    registry.register({
      type: "flight",
      description: "flight",
      render: ({ data, onAction }: any) => <button onClick={() => onAction({ type: "book", params: data })}>book</button>,
    })
    const onCardAction = vi.fn()
    let slot!: MountedCardSlot
    const mount = vi.fn((_el: HTMLElement, context: RenderMountContext) => {
      const host = document.createElement("div")
      _el.append(host)
      slot = context.mountCard!(host, { type: "flight", data: { id: 7 } })!
      return () => {
        slot.destroy()
        slot.destroy()
      }
    })
    const plugin: AIGuiPlugin = { name: "flight-slot", nodeRenderers: { slot: () => ({ kind: "mount", mount }) } }
    const node: ASTNode = { key: "0:slot", type: "slot", content: "" }
    const view = render(<>{renderNode(node, { plugins: [plugin], registry, onCardAction })}</>)

    fireEvent.click(view.getByText("book"))
    expect(onCardAction).toHaveBeenCalledWith({ type: "book", params: { id: 7 }, cardType: "flight" })

    view.unmount()
    expect(() => slot.destroy()).not.toThrow()
  })

  it("returns undefined for an unknown card type", () => {
    let mounted: MountedCardSlot | undefined
    const plugin: AIGuiPlugin = {
      name: "unknown-slot",
      nodeRenderers: {
        slot: () => ({
          kind: "mount",
          mount: (el, context) => {
            mounted = context.mountCard?.(el, { type: "missing", data: {} })
          },
        }),
      },
    }
    const node: ASTNode = { key: "0:slot", type: "slot", content: "" }

    render(<>{renderNode(node, { plugins: [plugin], registry: new CardRegistry() })}</>)

    expect(mounted).toBeUndefined()
  })

  it("passes the card mount context through AsyncOutput", async () => {
    const registry = new CardRegistry()
    registry.register({ type: "status", description: "status", render: ({ data }: any) => <span>{data.label}</span> })
    const plugin: AIGuiPlugin = {
      name: "async-slot",
      nodeRenderers: {
        slot: async () => ({
          kind: "mount",
          mount: (el: HTMLElement, context: RenderMountContext) => {
            const host = document.createElement("div")
            el.append(host)
            context.mountCard!(host, { type: "status", data: { label: "ready" } })
          },
        }),
      },
    }
    const node: ASTNode = { key: "0:slot", type: "slot", content: "" }
    const view = render(<>{renderNode(node, { plugins: [plugin], registry })}</>)

    await act(async () => { await Promise.resolve() })

    expect(view.getByText("ready")).toBeTruthy()
  })
})
