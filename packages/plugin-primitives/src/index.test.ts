import { describe, expect, it } from "vitest"
import { collectNodeRenderers, type RenderOutput } from "@ai-gui/core"
import { primitives, primitivesPromptSpec } from "./index"

const rendererFor = (type: string) => collectNodeRenderers([primitives()])[type]

describe("plugin-primitives", () => {
  it("renders a list primitive to an element RenderOutput", () => {
    const out = rendererFor("list")({ key: "0:list", type: "list", content: '{"items":["a","b"]}' }) as RenderOutput
    expect(out.kind).toBe("element")
    if (out.kind === "element") {
      expect(out.tag).toBe("ul")
      expect(out.children?.length).toBe(2)
    }
  })
  it("renders a key-value primitive", () => {
    const out = rendererFor("key-value")({ key: "0:kv", type: "key-value", content: '{"pairs":{"a":"1"}}' }) as RenderOutput
    expect(out.kind).toBe("element")
  })
  it("renders a table primitive", () => {
    const out = rendererFor("table")({ key: "0:t", type: "table", content: '{"headers":["h"],"rows":[["x"]]}' }) as RenderOutput
    expect(out.kind).toBe("element")
    if (out.kind === "element") expect(out.tag).toBe("table")
  })
  it("tolerates incomplete JSON (streaming) without throwing", () => {
    const out = rendererFor("list")({ key: "0:list", type: "list", content: '{"items":["a"' }) as RenderOutput
    expect(out.kind).toBe("element")
  })
  it("exposes a prompt spec mentioning the primitive fence types", () => {
    const spec = primitivesPromptSpec()
    expect(String(spec)).toContain("list")
  })
  it("sets a non-empty promptSpec on the returned plugin", () => {
    const spec = primitives().promptSpec
    expect(typeof spec).toBe("function")
    expect((spec as (locale?: string) => string)()).toContain("list")
  })
})

describe("primitives promptSpec locale", () => {
  it("is English by default", () => {
    expect(primitivesPromptSpec()).toContain("```")
    expect(primitivesPromptSpec()).not.toContain("基础 UI 块")
  })

  it("is Chinese for zh-CN", () => {
    expect(primitivesPromptSpec("zh-CN")).toContain("基础 UI 块")
  })

  it("falls back to English for a locale nobody translated", () => {
    expect(primitivesPromptSpec("ja")).toBe(primitivesPromptSpec())
  })

  it("is what the plugin hands buildSystemPrompt", () => {
    const spec = primitives().promptSpec as (locale?: string) => string
    expect(spec("zh-CN")).toBe(primitivesPromptSpec("zh-CN"))
  })
})
