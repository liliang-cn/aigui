import { collectNodeRenderers, createParser, type RenderOutput } from "@ai-gui/core"
import { describe, expect, it } from "vitest"
import {
  citation,
  citationCss,
  citationPromptSpec,
  parseSourcesDefinition,
  serializeSourcesFence,
  type SourcesDefinition,
} from "./index"

const validDefinition: SourcesDefinition = {
  sources: [
    {
      id: "spec-1",
      title: "AIGUI specification",
      url: "https://example.com/spec",
      citedText: "Framework-neutral streaming UI.",
    },
  ],
}

function render(content: string, complete = true, options = {}) {
  return collectNodeRenderers([citation(options)]).sources({
    key: "sources",
    type: "sources",
    content,
    complete,
  }) as RenderOutput
}

describe("parseSourcesDefinition", () => {
  it("accepts and normalizes the exact supported schema", () => {
    expect(parseSourcesDefinition(JSON.stringify(validDefinition))).toEqual({
      valid: true,
      data: validDefinition,
    })
  })

  it("rejects invalid JSON, non-object roots, and unknown keys", () => {
    expect(parseSourcesDefinition("not json").valid).toBe(false)
    expect(parseSourcesDefinition("[]").valid).toBe(false)
    expect(parseSourcesDefinition('{"sources":[],"html":"<b>x</b>"}').valid).toBe(false)
    expect(parseSourcesDefinition('{"sources":[{"id":"a","title":"A","url":"https://example.com","action":"open"}]}').valid).toBe(false)
  })

  it("requires between 1 and 100 sources with unique safe IDs", () => {
    expect(parseSourcesDefinition('{"sources":[]}').valid).toBe(false)
    const tooMany = { sources: Array.from({ length: 101 }, (_, index) => ({ id: `s-${index}`, title: "T", url: "https://example.com" })) }
    expect(parseSourcesDefinition(JSON.stringify(tooMany)).valid).toBe(false)
    expect(parseSourcesDefinition(JSON.stringify({ sources: [
      { id: "same", title: "A", url: "https://example.com/a" },
      { id: "same", title: "B", url: "https://example.com/b" },
    ] })).valid).toBe(false)
    expect(parseSourcesDefinition(JSON.stringify({ sources: [{ id: "../unsafe", title: "A", url: "https://example.com" }] })).valid).toBe(false)
    expect(parseSourcesDefinition(JSON.stringify({ sources: [{ id: "__proto__", title: "A", url: "https://example.com" }] })).valid).toBe(false)
  })

  it("enforces source, title, URL, and citedText limits", () => {
    expect(parseSourcesDefinition(" ".repeat(64 * 1024 + 1)).valid).toBe(false)
    expect(parseSourcesDefinition(JSON.stringify({ sources: [{ id: "a", title: "x".repeat(257), url: "https://example.com" }] })).valid).toBe(false)
    expect(parseSourcesDefinition(JSON.stringify({ sources: [{ id: "a", title: "A", url: `https://example.com/${"x".repeat(2048)}` }] })).valid).toBe(false)
    expect(parseSourcesDefinition(JSON.stringify({ sources: [{ id: "a", title: "A", url: "https://example.com", citedText: "x".repeat(4097) }] })).valid).toBe(false)
    expect(parseSourcesDefinition(JSON.stringify({ sources: [{ id: "a", title: "", url: "https://example.com" }] })).valid).toBe(false)
  })

  it("allows only HTTPS by default and rejects credentials and malformed URLs", () => {
    for (const url of ["http://example.com", "javascript:alert(1)", "//example.com", "https://user:pass@example.com", "https://exa mple.com"]) {
      expect(parseSourcesDefinition(JSON.stringify({ sources: [{ id: "a", title: "A", url }] })).valid).toBe(false)
    }
    expect(parseSourcesDefinition(JSON.stringify({ sources: [{ id: "a", title: "A", url: "HTTPS://EXAMPLE.COM/path" }] }))).toEqual({
      valid: true,
      data: { sources: [{ id: "a", title: "A", url: "https://example.com/path" }] },
    })
  })

  it("permits HTTP only for exact allowlisted hosts", () => {
    const options = { allowedHttpHosts: ["localhost", "dev.example.test:4317", "default.example.test:80"] }
    expect(parseSourcesDefinition(JSON.stringify({ sources: [{ id: "a", title: "A", url: "http://localhost:3001/a" }] }), options).valid).toBe(true)
    expect(parseSourcesDefinition(JSON.stringify({ sources: [{ id: "a", title: "A", url: "http://dev.example.test:4317/a" }] }), options).valid).toBe(true)
    expect(parseSourcesDefinition(JSON.stringify({ sources: [{ id: "a", title: "A", url: "http://dev.example.test:4318/a" }] }), options).valid).toBe(false)
    expect(parseSourcesDefinition(JSON.stringify({ sources: [{ id: "a", title: "A", url: "http://default.example.test/a" }] }), options).valid).toBe(true)
    expect(parseSourcesDefinition(JSON.stringify({ sources: [{ id: "a", title: "A", url: "http://default.example.test:81/a" }] }), options).valid).toBe(false)
    expect(parseSourcesDefinition(JSON.stringify({ sources: [{ id: "a", title: "A", url: "http://sub.localhost/a" }] }), options).valid).toBe(false)
    expect(() => citation({ allowedHttpHosts: ["https://example.com", "evil.test/path", "user@host"] })).toThrow(TypeError)
  })
})

describe("citation plugin", () => {
  it("claims only sources fences and complete-gates in both parser and renderer", () => {
    const plugin = citation()
    expect(Object.keys(plugin.nodeRenderers ?? {})).toEqual(["sources"])
    const parse = createParser({ plugins: [plugin] })
    const incomplete = parse(`\`\`\`sources\n${JSON.stringify(validDefinition)}`).at(0)!
    expect(incomplete.complete).toBe(false)
    const output = collectNodeRenderers([plugin]).sources(incomplete) as RenderOutput
    expect(output).toEqual({
      kind: "element",
      tag: "div",
      props: { "data-aigui-block-loading": "", "data-block-type": "sources" },
      children: [],
    })
    expect(render(JSON.stringify(validDefinition), false)).toEqual(output)
  })

  it("returns synchronous framework-neutral element output with safe link props", () => {
    const output = render(JSON.stringify(validDefinition))
    expect(output).not.toBeInstanceOf(Promise)
    expect(output.kind).toBe("element")
    if (output.kind !== "element") return
    expect(output.tag).toBe("section")
    expect(output.props).toMatchObject({ "data-aigui-citations": "", "aria-label": "Sources" })
    const link = output.children?.[1]?.children?.[0]?.children?.[0]
    expect(link).toMatchObject({
      kind: "element",
      tag: "a",
      props: { href: "https://example.com/spec", target: "_blank", rel: "noopener noreferrer nofollow" },
    })
  })

  it("escapes all model text and never emits model HTML or actions", () => {
    const source = {
      sources: [{
        id: "safe",
        title: '<img src=x onerror="alert(1)">',
        url: "https://example.com/?q=%3Cscript%3E",
        citedText: "<script>alert(1)</script> & text",
      }],
    }
    const output = render(JSON.stringify(source))
    const serialized = JSON.stringify(output)
    expect(serialized).not.toContain("<img")
    expect(serialized).not.toContain("<script")
    expect(serialized).not.toContain('"onerror":')
    expect(serialized).not.toContain('"onclick":')
    expect(serialized).toContain("&lt;img")
    expect(serialized).toContain("&lt;script")
    expect(serialized).toContain("&amp; text")
  })

  it("uses one generic invalid fallback that does not reflect source or issues", () => {
    const secret = "PRIVATE_SOURCE_PAYLOAD"
    const output = render(`{${secret}`)
    expect(output).toEqual({
      kind: "element",
      tag: "div",
      props: { "data-aigui-citations-invalid": "", role: "status" },
      children: [{ kind: "html", html: "Sources unavailable." }],
    })
    expect(JSON.stringify(output)).not.toContain(secret)
  })

  it("exposes stable CSS and a prompt that prohibits HTML and actions", () => {
    expect(citation().css).toBe(citationCss)
    expect(citationCss).toContain("[data-aigui-citations]")
    expect(citationPromptSpec()).toContain("```sources")
    expect(citationPromptSpec()).toContain("HTTPS")
    expect(citationPromptSpec()).toContain("Never emit HTML")
    expect(citation().promptSpec).toBe(citationPromptSpec())
  })
})

describe("serializeSourcesFence", () => {
  it("validates, canonicalizes, and round-trips a sources fence", () => {
    const fence = serializeSourcesFence(validDefinition)
    expect(fence).toBe(`\`\`\`sources\n${JSON.stringify(validDefinition, null, 2)}\n\`\`\``)
    const body = fence.slice("```sources\n".length, -"\n```".length)
    expect(parseSourcesDefinition(body)).toEqual({ valid: true, data: validDefinition })
  })

  it("uses the same HTTP policy and throws for invalid definitions", () => {
    const definition = { sources: [{ id: "local", title: "Local", url: "http://localhost:4317" }] }
    expect(() => serializeSourcesFence(definition)).toThrow(TypeError)
    expect(serializeSourcesFence(definition, { allowedHttpHosts: ["localhost"] })).toContain("http://localhost:4317/")
    expect(() => serializeSourcesFence({ sources: [], extra: true } as never)).toThrow(TypeError)
  })
})
