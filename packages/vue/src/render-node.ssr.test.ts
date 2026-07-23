import { CardRegistry, CardStore, type ASTNode } from "@ai-gui/core"
import { createSSRApp, defineComponent, h } from "vue"
import { renderToString } from "vue/server-renderer"
import { describe, expect, it, vi } from "vitest"
import { renderNode } from "./render-node"

describe("renderNode SSR", () => {
  it("renders identified cards as fallback without registering or subscribing", async () => {
    const registry = new CardRegistry()
    const store = new CardStore({ registry })
    const register = vi.spyOn(store, "register")
    const subscribe = vi.spyOn(store, "subscribe")
    registry.register({
      type: "counter",
      description: "counter",
      render: defineComponent({ props: ["data"], setup: (props) => () => h("span", props.data.count) }),
    })
    const node: ASTNode = {
      key: "0:card",
      type: "card",
      card: { id: "one", type: "counter", data: { id: "one", count: 1 }, complete: true, valid: true },
    }
    const app = createSSRApp({ render: () => renderNode(node, { registry, cardStore: store }) })

    const html = await renderToString(app)

    expect(html).toContain("data-aigui-card-fallback")
    expect(html).toContain("&quot;count&quot;: 1")
    expect(store.list()).toEqual([])
    expect(register).not.toHaveBeenCalled()
    expect(subscribe).not.toHaveBeenCalled()
  })
})
