import { describe, expect, it } from "vitest"
import { sanitizeHtml } from "./sanitizer"

describe("sanitizeHtml SSR behavior", () => {
  it("escapes markup by default when no DOM exists", () => {
    expect(sanitizeHtml("<b>x</b>")).toBe("&lt;b&gt;x&lt;/b&gt;")
  })
  it("can explicitly reject sanitization without a DOM", () => {
    expect(() => sanitizeHtml("<b>x</b>", { ssr: "throw" })).toThrow(/DOM/)
  })
})
