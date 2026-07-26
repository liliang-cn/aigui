// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { collectNodeRenderers, type ASTNode, type RenderOutput } from "@ai-gui/core"

const mocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}))

vi.mock("mermaid", () => ({
  default: { initialize: mocks.initialize, render: mocks.render },
}))

describe("plugin-mermaid", () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.initialize.mockReset()
    mocks.render.mockReset()
    mocks.render.mockImplementation(async (id: string) => ({ svg: `<svg id="${id}"></svg>` }))
  })

  it("exposes an async node renderer for the mermaid fence", async () => {
    const { mermaid } = await import("./index")
    const r = collectNodeRenderers([mermaid()]).mermaid
    expect(typeof r).toBe("function")
    const out = r({ key: "0:m", type: "mermaid", content: "graph TD; A-->B" } as ASTNode)
    expect(typeof (out as Promise<RenderOutput>).then).toBe("function")
  })
  it("describes supported UML and general diagram syntax to the model", async () => {
    const { mermaidPromptSpec } = await import("./index")
    const prompt = mermaidPromptSpec()
    expect(prompt).toContain("flowchart")
    expect(prompt).toContain("sequenceDiagram")
    expect(prompt).toContain("classDiagram")
    expect(prompt).toContain("stateDiagram-v2")
    expect(prompt).toContain("erDiagram")
    expect(prompt).toContain("Never emit")
  })
  it("resolves to an html RenderOutput and never throws (error → fallback html)", async () => {
    mocks.render.mockRejectedValue(new Error("bad diagram"))
    const { mermaid } = await import("./index")
    const r = collectNodeRenderers([mermaid()]).mermaid
    const out = (await r({ key: "0:m", type: "mermaid", content: "not a valid diagram !!!" } as ASTNode)) as RenderOutput
    expect(out.kind).toBe("html")
    if (out.kind === "html") {
      expect(out.html).toContain("data-aigui-mermaid-error")
      expect(out.html).not.toContain("bad diagram")
    }
  })

  it("uses globally unique IDs across plugin instances and concurrent renders", async () => {
    const { mermaid } = await import("./index")
    const first = collectNodeRenderers([mermaid()]).mermaid
    const second = collectNodeRenderers([mermaid()]).mermaid

    await Promise.all([
      first({ key: "0:a", type: "mermaid", content: "graph TD; A-->B" } as ASTNode),
      second({ key: "0:b", type: "mermaid", content: "graph TD; C-->D" } as ASTNode),
      first({ key: "0:c", type: "mermaid", content: "graph TD; E-->F" } as ASTNode),
    ])

    const ids = mocks.render.mock.calls.map(([id]) => id)
    expect(new Set(ids).size).toBe(3)
  })

  it("re-initializes Mermaid only when the theme actually changes", async () => {
    const { mermaid } = await import("./index")
    const dark = collectNodeRenderers([mermaid({ theme: "dark" })]).mermaid
    const alsoDark = collectNodeRenderers([mermaid({ theme: "dark" })]).mermaid
    const forest = collectNodeRenderers([mermaid({ theme: "forest" })]).mermaid

    await Promise.all([
      dark({ key: "0:a", type: "mermaid", content: "graph TD; A-->B" } as ASTNode),
      alsoDark({ key: "0:b", type: "mermaid", content: "graph TD; C-->D" } as ASTNode),
    ])
    expect(mocks.initialize).toHaveBeenCalledOnce()
    expect(mocks.initialize).toHaveBeenCalledWith({ startOnLoad: false, theme: "dark", securityLevel: "strict" })

    // Mermaid holds one global configuration, so a diagram asking for another theme has to set it
    // again. Keeping the first one meant the earliest diagram on the page decided for the rest.
    await forest({ key: "0:c", type: "mermaid", content: "graph TD; E-->F" } as ASTNode)

    expect(mocks.initialize).toHaveBeenLastCalledWith({ startOnLoad: false, theme: "forest", securityLevel: "strict" })
  })

  it("does not hand Mermaid a colour scheme it has no theme for", async () => {
    const { mermaid } = await import("./index")
    const render = collectNodeRenderers([mermaid({ theme: "forest" })]).mermaid
    const node = { key: "0:a", type: "mermaid", content: "graph TD; A-->B" } as ASTNode

    // A host reports its appearance, and "light" is what most of them call the default one. Mermaid
    // has no "light" theme, so passing it through failed every diagram on the page.
    await render(node, { theme: "light" })

    expect(mocks.initialize).toHaveBeenLastCalledWith({ startOnLoad: false, theme: "forest", securityLevel: "strict" })
  })

  it("takes the theme from the host over the one it was built with", async () => {
    const { mermaid } = await import("./index")
    const render = collectNodeRenderers([mermaid({ theme: "dark" })]).mermaid
    const node = { key: "0:a", type: "mermaid", content: "graph TD; A-->B" } as ASTNode

    await render(node, { theme: "forest" })

    expect(mocks.initialize).toHaveBeenLastCalledWith({ startOnLoad: false, theme: "forest", securityLevel: "strict" })

    // The same node re-rendered for a different page theme is a different picture, so the memo
    // per node cannot answer for both.
    await render(node, { theme: "dark" })

    expect(mocks.initialize).toHaveBeenLastCalledWith({ startOnLoad: false, theme: "dark", securityLevel: "strict" })
  })

  it("rejects oversized diagrams without loading Mermaid", async () => {
    const { mermaid } = await import("./index")
    const render = collectNodeRenderers([mermaid({ maxSourceBytes: 8 })]).mermaid
    const out = await render({ key: "large", type: "mermaid", content: "flowchart TD; A-->B" } as ASTNode) as RenderOutput
    expect(out.kind).toBe("html")
    expect(mocks.render).not.toHaveBeenCalled()
  })

  it("serializes concurrent Mermaid renders because Mermaid owns global mutable state", async () => {
    let releaseFirst!: () => void
    const firstPending = new Promise<void>((resolve) => { releaseFirst = resolve })
    mocks.render
      .mockImplementationOnce(async (id: string) => {
        await firstPending
        return { svg: `<svg id="${id}"></svg>` }
      })
      .mockImplementation(async (id: string) => ({ svg: `<svg id="${id}"></svg>` }))
    const { mermaid } = await import("./index")
    const render = collectNodeRenderers([mermaid()]).mermaid

    const first = render({ key: "0:a", type: "mermaid", content: "graph TD; A-->B" } as ASTNode)
    const second = render({ key: "0:b", type: "mermaid", content: "graph TD; C-->D" } as ASTNode)
    await vi.waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(1))
    releaseFirst()
    await Promise.all([first, second])
    expect(mocks.render).toHaveBeenCalledTimes(2)
  })

  it("converts concurrent render failures to HTML without unhandled rejections", async () => {
    mocks.render.mockRejectedValue(new Error("render failed"))
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)
    try {
      const { mermaid } = await import("./index")
      const render = collectNodeRenderers([mermaid()]).mermaid
      const results = await Promise.all([
        render({ key: "0:a", type: "mermaid", content: "a" } as ASTNode),
        render({ key: "0:b", type: "mermaid", content: "b" } as ASTNode),
      ]) as RenderOutput[]
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(results.every((result) => result.kind === "html")).toBe(true)
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off("unhandledRejection", unhandled)
    }
  })
})

describe("plugin-mermaid cleanup", () => {
  it("leaves nothing behind in the document when a diagram fails to parse", async () => {
    const { mermaid } = await import("./index")
    const render = collectNodeRenderers([mermaid()]).mermaid
    // Mermaid renders into a container it appends to the document and tidies up itself only on
    // success; a parse error leaves that container holding its "Syntax error in text" graphic, and
    // it sits outside the renderer where nothing owning the answer can reach it.
    mocks.render.mockImplementationOnce((id: string) => {
      const host = document.createElement("div")
      host.id = `d${id}`
      host.textContent = "Syntax error in text"
      document.body.appendChild(host)
      throw new Error("Parse error")
    })

    const output = await render({ key: "0:a", type: "mermaid", content: "graph TD; ??" } as ASTNode)

    expect(output).toMatchObject({ kind: "html" })
    expect(document.body.textContent).not.toContain("Syntax error in text")
  })
})
