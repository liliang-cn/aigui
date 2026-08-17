import { describe, expect, it } from "vitest"
import { pageHtml } from "./html"

describe("pageHtml", () => {
  it("defaults to a light background", () => {
    expect(pageHtml()).toContain("background:#ffffff")
  })

  it("switches to the dark palette on request", () => {
    const html = pageHtml({ theme: "dark" })
    expect(html).toContain("background:#161616")
    expect(html).not.toContain("background:#ffffff")
  })

  it("kills animation, so nothing is captured mid-frame", () => {
    expect(pageHtml()).toContain("animation:none!important")
    expect(pageHtml()).toContain("transition:none!important")
  })

  it("names CJK faces, because a screenshot cannot fall back later", () => {
    expect(pageHtml()).toContain("PingFang SC")
    expect(pageHtml()).toContain("Noto Sans CJK SC")
  })

  it("constrains the root to the requested width", () => {
    expect(pageHtml({ width: 500 })).toContain("max-width:500px")
  })

  it("carries the plugin stylesheets, or every picture renders unstyled", () => {
    const html = pageHtml()
    expect(html).toContain("data-aigui-renderer")
    expect(html.length).toBeGreaterThan(2000)
  })

  it("gives the renderer the root the screenshot targets", () => {
    expect(pageHtml()).toContain('<div id="root"></div>')
  })
})
