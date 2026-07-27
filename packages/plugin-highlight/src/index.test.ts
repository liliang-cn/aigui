import { beforeEach, describe, expect, it, vi } from "vitest"
import { collectNodeRenderers, type ASTNode, type RenderOutput } from "@ai-gui/core"

const mocks = vi.hoisted(() => ({
  codeToHtml: vi.fn((code: string) => `<pre>${code}</pre>`),
  createHighlighter: vi.fn(),
}))

vi.mock("shiki", () => ({ createHighlighter: mocks.createHighlighter }))

describe("plugin-highlight", () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.codeToHtml.mockClear()
    mocks.createHighlighter.mockReset()
    mocks.createHighlighter.mockResolvedValue({ codeToHtml: mocks.codeToHtml })
  })

  it("renders a code node to highlighted html (async)", async () => {
    const { highlight } = await import("./index")
    const r = collectNodeRenderers([highlight({ themes: ["github-light"], langs: ["ts"] })]).code
    const out = (await r({ key: "0:c", type: "code", content: "const a = 1", attrs: { lang: "ts" } } as ASTNode)) as RenderOutput
    expect(out.kind).toBe("html")
    if (out.kind === "html") { expect(out.html).toContain("<pre"); expect(out.html).toContain("a") }
  })
  it("falls back gracefully for an unknown language", async () => {
    const { highlight } = await import("./index")
    const r = collectNodeRenderers([highlight({ themes: ["github-light"], langs: ["ts"] })]).code
    const out = (await r({ key: "0:c", type: "code", content: "x", attrs: { lang: "unknownlang" } } as ASTNode)) as RenderOutput
    expect(out.kind).toBe("html")
    expect(mocks.codeToHtml).toHaveBeenCalledWith("x", { lang: "text", theme: "github-light" })
  })

  it("does not load Shiki until the first code node is rendered", async () => {
    const { highlight } = await import("./index")
    const r = collectNodeRenderers([highlight()]).code

    expect(mocks.createHighlighter).not.toHaveBeenCalled()
    await r({ key: "0:c", type: "code", content: "x" } as ASTNode)
    expect(mocks.createHighlighter).toHaveBeenCalledOnce()
  })

  it("shares one in-flight highlighter creation across concurrent renders", async () => {
    let resolve!: (value: { codeToHtml: typeof mocks.codeToHtml }) => void
    mocks.createHighlighter.mockReturnValue(new Promise((r) => { resolve = r }))
    const { highlight } = await import("./index")
    const render = collectNodeRenderers([highlight()]).code

    const first = render({ key: "0:a", type: "code", content: "a" } as ASTNode)
    const second = render({ key: "0:b", type: "code", content: "b" } as ASTNode)
    await vi.waitFor(() => expect(mocks.createHighlighter).toHaveBeenCalledOnce())
    resolve({ codeToHtml: mocks.codeToHtml })
    await Promise.all([first, second])
  })

  it("converts a rejected Shiki load into fallback HTML without an unhandled rejection", async () => {
    mocks.createHighlighter.mockRejectedValue(new Error("load failed"))
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)
    try {
      const { highlight } = await import("./index")
      const render = collectNodeRenderers([highlight()]).code
      const results = await Promise.all([
        render({ key: "0:a", type: "code", content: "<a>" } as ASTNode),
        render({ key: "0:b", type: "code", content: "&b" } as ASTNode),
      ]) as RenderOutput[]
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(results[0]).toEqual({ kind: "html", html: "<pre><code>&lt;a&gt;</code></pre>" })
      expect(results[1]).toEqual({ kind: "html", html: "<pre><code>&amp;b</code></pre>" })
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off("unhandledRejection", unhandled)
    }
  })
})

describe("highlight themes", () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.codeToHtml.mockClear()
    mocks.createHighlighter.mockReset()
    mocks.createHighlighter.mockResolvedValue({ codeToHtml: mocks.codeToHtml })
  })

  const node = { key: "0:c", type: "code", content: "const a = 1", attrs: { lang: "ts" } } as ASTNode

  it("sets code in the host's colour scheme rather than one fixed at construction", async () => {
    // The same fault a chart has when it picks its own palette: correct markup, wrong ink. A theme
    // pinned at construction gave a dark page code set for a light one.
    const { highlight } = await import("./index")
    const render = collectNodeRenderers([highlight({ langs: ["ts"] })]).code

    await render(node, { theme: "light" })
    expect(mocks.codeToHtml).toHaveBeenLastCalledWith("const a = 1", { lang: "ts", theme: "github-light" })
    await render(node, { theme: "dark" })
    expect(mocks.codeToHtml).toHaveBeenLastCalledWith("const a = 1", { lang: "ts", theme: "github-dark" })
    // Both themes have to be loaded up front, or asking Shiki for the other one throws.
    expect(mocks.createHighlighter).toHaveBeenCalledWith(
      expect.objectContaining({ themes: ["github-light", "github-dark"] }),
    )
  })

  it("honours a pinned theme against the host's scheme", async () => {
    const { highlight } = await import("./index")
    const render = collectNodeRenderers([highlight({ theme: "github-dark", langs: ["ts"] })]).code

    await render(node, { theme: "light" })
    expect(mocks.codeToHtml).toHaveBeenLastCalledWith("const a = 1", { lang: "ts", theme: "github-dark" })
  })

  it("falls back to a loaded theme rather than asking for one that is not", async () => {
    const { highlight } = await import("./index")
    const render = collectNodeRenderers([highlight({ themes: ["github-light"], darkTheme: "nord", langs: ["ts"] })]).code

    // `nord` was never loaded, so asking Shiki for it would throw at render time.
    await render(node, { theme: "dark" })
    expect(mocks.codeToHtml).toHaveBeenLastCalledWith("const a = 1", { lang: "ts", theme: "github-light" })
  })

  it("with no context, renders as a light page", async () => {
    const { highlight } = await import("./index")
    const render = collectNodeRenderers([highlight({ langs: ["ts"] })]).code

    await render(node)
    expect(mocks.codeToHtml).toHaveBeenLastCalledWith("const a = 1", { lang: "ts", theme: "github-light" })
  })
})
