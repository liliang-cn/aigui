// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { collectNodeRenderers, type ASTNode, type RenderOutput } from "@aigui/core"
import { mermaid } from "./index"

describe("plugin-mermaid", () => {
  it("exposes an async node renderer for the mermaid fence", () => {
    const r = collectNodeRenderers([mermaid()]).mermaid
    expect(typeof r).toBe("function")
    const out = r({ key: "0:m", type: "mermaid", content: "graph TD; A-->B" } as ASTNode)
    expect(typeof (out as Promise<RenderOutput>).then).toBe("function")
  })
  it("resolves to an html RenderOutput and never throws (error → fallback html)", async () => {
    const r = collectNodeRenderers([mermaid()]).mermaid
    const out = (await r({ key: "0:m", type: "mermaid", content: "not a valid diagram !!!" } as ASTNode)) as RenderOutput
    expect(out.kind).toBe("html")
  })
})
