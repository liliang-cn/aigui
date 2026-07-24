import { describe, expect, expectTypeOf, it, vi } from "vitest"
import type {
  AIGuiPlugin,
  ASTNode,
  CollectNodeRendererOptions,
  NodeRenderer,
  RenderOutput,
} from "./index"
import {
  collectNodeRenderers,
  createTestNode,
  definePlugin,
  getPluginRenderer,
  mountOutputForTest,
  pluginNodeTypes,
  renderPluginNode,
} from "./index"

describe("definePlugin", () => {
  it("returns the exact plugin object and preserves its concrete type", () => {
    const plugin = {
      name: "example",
      promptSpec: "Example blocks",
      nodeRenderers: {
        example: () => ({ kind: "html", html: "ok" }) as const,
      },
    }

    const defined = definePlugin(plugin)

    expect(defined).toBe(plugin)
    expectTypeOf(defined).toEqualTypeOf<typeof plugin>()
  })
})

describe("createTestNode", () => {
  it("creates a complete node with a deterministic key", () => {
    expect(createTestNode("example")).toEqual({
      key: "test:example",
      type: "example",
      complete: true,
    })
  })

  it("applies overrides without allowing type to be omitted", () => {
    expect(createTestNode("example", { key: "custom", content: "hello", complete: false })).toEqual({
      key: "custom",
      type: "example",
      content: "hello",
      complete: false,
    })
  })
})

describe("plugin renderer helpers", () => {
  const render: NodeRenderer = (node) => ({ kind: "html", html: node.content ?? "" })
  const plugin: AIGuiPlugin = { name: "example", nodeRenderers: { example: render } }

  it("returns the registered renderer", () => {
    expect(getPluginRenderer(plugin, "example")).toBe(render)
  })

  it("throws a useful error when the renderer is absent", () => {
    expect(() => getPluginRenderer(plugin, "missing")).toThrow(
      'Plugin "example" does not define a renderer for node type "missing".',
    )
  })

  it("renders both synchronous and asynchronous plugin nodes", async () => {
    await expect(renderPluginNode(plugin, createTestNode("example", { content: "sync" }))).resolves.toEqual({
      kind: "html",
      html: "sync",
    })

    const asyncPlugin: AIGuiPlugin = {
      name: "async",
      nodeRenderers: {
        example: async (node) => ({ kind: "html", html: node.content ?? "" }),
      },
    }
    await expect(renderPluginNode(asyncPlugin, createTestNode("example", { content: "async" }))).resolves.toEqual({
      kind: "html",
      html: "async",
    })
  })
})

describe("mountOutputForTest", () => {
  it("mounts into the supplied element and wraps cleanup idempotently", () => {
    const dispose = vi.fn()
    const mount = vi.fn(() => dispose)
    const output: RenderOutput = { kind: "mount", mount }
    const element = {} as HTMLElement

    const cleanup = mountOutputForTest(output, element)
    cleanup()
    cleanup()

    expect(mount).toHaveBeenCalledOnce()
    expect(mount).toHaveBeenCalledWith(element, {})
    expect(dispose).toHaveBeenCalledOnce()
  })

  it("passes an explicit mount context to card-capable plugins", () => {
    const mount = vi.fn()
    const context = { mountCard: vi.fn() }
    mountOutputForTest({ kind: "mount", mount }, {} as HTMLElement, context)
    expect(mount).toHaveBeenCalledWith(expect.anything(), context)
  })

  it("returns a harmless idempotent cleanup when mount has no disposer", () => {
    const mount = vi.fn()
    const cleanup = mountOutputForTest({ kind: "mount", mount }, {} as HTMLElement)

    expect(() => {
      cleanup()
      cleanup()
    }).not.toThrow()
    expect(mount).toHaveBeenCalledOnce()
  })

  it("rejects non-mount outputs", () => {
    expect(() => mountOutputForTest({ kind: "html", html: "ok" }, {} as HTMLElement)).toThrow(
      'Expected a "mount" render output, received "html".',
    )
  })
})

describe("public types", () => {
  it("is safe to import without browser globals", () => {
    expect(typeof document).toBe("undefined")
  })

  it("accepts core authoring types without adapters", () => {
    const node: ASTNode = createTestNode("example")
    const options: CollectNodeRendererOptions = { debug: false }
    expect(node.type).toBe("example")
    expect(options.debug).toBe(false)
  })

  it("re-exports core plugin collection helpers", () => {
    const plugin = definePlugin({
      name: "example",
      nodeRenderers: { example: () => ({ kind: "html", html: "ok" }) as const },
    })

    expect(collectNodeRenderers([plugin]).example).toBe(plugin.nodeRenderers.example)
    expect(pluginNodeTypes([plugin])).toEqual(new Set(["example"]))
  })
})
