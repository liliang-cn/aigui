// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { AIGuiPlugin, NodeRenderer } from "@ai-gui/core"
import { AIRenderer } from "./ai-renderer"

const widget: AIGuiPlugin = {
  name: "widget",
  css: "[data-widget]{color:red}",
  nodeRenderers: {
    widget: (node) => ({ kind: "html", html: `<div data-widget>plugin: ${node.content ?? ""}</div>` }),
  },
}
const text = "```widget\nx\n```"

describe("host nodeRenderers", () => {
  it("override the plugin that claims the same node type", () => {
    const mine: Record<string, NodeRenderer> = {
      widget: () => ({ kind: "html", html: "<div data-widget>host</div>" }),
    }
    const view = render(<AIRenderer text={text} plugins={[widget]} nodeRenderers={mine} />)
    expect(view.container.textContent).toContain("host")
    expect(view.container.textContent).not.toContain("plugin:")
  })

  it("leave the plugin's other node types alone", () => {
    // Overriding one block must not mean losing the rest of what the plugin renders.
    const mine: Record<string, NodeRenderer> = {
      other: () => ({ kind: "html", html: "<i>unused</i>" }),
    }
    const view = render(<AIRenderer text={text} plugins={[widget]} nodeRenderers={mine} />)
    expect(view.container.textContent).toContain("plugin: x")
  })

  it("are optional", () => {
    const view = render(<AIRenderer text={text} plugins={[widget]} />)
    expect(view.container.textContent).toContain("plugin: x")
  })
})

describe("plugin styles", () => {
  it("are injected into the document by the renderer", () => {
    render(<AIRenderer text="hi" plugins={[widget]} />)
    const style = document.head.querySelector('style[data-aigui-style="widget"]')
    expect(style?.textContent).toBe("[data-widget]{color:red}")
  })

  it("include the base sheet that keeps blocks inside the viewport", () => {
    render(<AIRenderer text="hi" plugins={[widget]} />)
    const base = document.head.querySelector('style[data-aigui-style="base"]')
    expect(base?.textContent).toContain("overflow-x:auto")
  })

  it("are not duplicated by a second renderer", () => {
    render(<AIRenderer text="a" plugins={[widget]} />)
    render(<AIRenderer text="b" plugins={[widget]} />)
    expect(document.head.querySelectorAll('style[data-aigui-style="widget"]')).toHaveLength(1)
  })
})

describe("locale", () => {
  const probe = (seen: (string | undefined)[]): AIGuiPlugin => ({
    name: "locale-probe",
    nodeRenderers: {
      widget: (_node, ctx) => {
        seen.push(ctx?.locale)
        return { kind: "html", html: `<i data-locale="${ctx?.locale ?? "none"}"></i>` }
      },
    },
  })

  it("reaches the plugin that draws the labels", () => {
    const seen: (string | undefined)[] = []
    const view = render(<AIRenderer text={text} plugins={[probe(seen)]} locale="zh-CN" />)
    expect(seen).toContain("zh-CN")
    expect(view.container.querySelector("i")?.dataset.locale).toBe("zh-CN")
  })

  it("re-renders the block when the locale changes", () => {
    // Same node, different language: the cached output is the wrong one now.
    const seen: (string | undefined)[] = []
    const plugins = [probe(seen)]
    const view = render(<AIRenderer text={text} plugins={plugins} locale="en" />)
    view.rerender(<AIRenderer text={text} plugins={plugins} locale="zh-CN" />)
    expect(view.container.querySelector("i")?.dataset.locale).toBe("zh-CN")
  })

  it("is undefined when the host does not set one", () => {
    const seen: (string | undefined)[] = []
    render(<AIRenderer text={text} plugins={[probe(seen)]} />)
    expect(seen).toContain(undefined)
  })
})
