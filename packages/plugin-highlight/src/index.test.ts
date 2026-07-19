import { describe, expect, it } from "vitest"
import { collectNodeRenderers, type ASTNode, type RenderOutput } from "@aigui/core"
import { highlight } from "./index"

describe("plugin-highlight", () => {
  it("renders a code node to highlighted html (async)", async () => {
    const r = collectNodeRenderers([highlight({ themes: ["github-light"], langs: ["ts"] })]).code
    const out = (await r({ key: "0:c", type: "code", content: "const a = 1", attrs: { lang: "ts" } } as ASTNode)) as RenderOutput
    expect(out.kind).toBe("html")
    if (out.kind === "html") { expect(out.html).toContain("<pre"); expect(out.html).toContain("a") }
  })
  it("falls back gracefully for an unknown language", async () => {
    const r = collectNodeRenderers([highlight({ themes: ["github-light"], langs: ["ts"] })]).code
    const out = (await r({ key: "0:c", type: "code", content: "x", attrs: { lang: "unknownlang" } } as ASTNode)) as RenderOutput
    expect(out.kind).toBe("html")
  })
})
