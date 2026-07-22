import { describe, expect, it } from "vitest"
import { collectNodeRenderers, type RenderOutput } from "@aigui/core"
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
    expect(primitives().promptSpec).toContain("list")
  })
})
