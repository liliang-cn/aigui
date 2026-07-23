// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { sanitizeHtml } from "./sanitizer"

describe("sanitizeHtml", () => {
  it("removes script", () => {
    expect(sanitizeHtml("<p>hi</p><script>alert(1)</script>")).toBe("<p>hi</p>")
  })
  it("removes inline event attributes", () => {
    expect(sanitizeHtml('<img src=x onerror="alert(1)">')).not.toContain("onerror")
  })
  it("keeps safe tags", () => {
    expect(sanitizeHtml("<strong>bold</strong>")).toBe("<strong>bold</strong>")
  })
  it("supports an injected sanitization strategy", () => {
    expect(sanitizeHtml("<b>x</b>", { sanitizer: (html) => `safe:${html}` })).toBe("safe:<b>x</b>")
  })
})
