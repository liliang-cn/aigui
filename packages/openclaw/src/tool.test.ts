import { describe, expect, it, vi } from "vitest"
import { createRenderTool } from "./tool"

describe("aigui_render", () => {
  it("is named and described for the model", () => {
    const tool = createRenderTool({ outDir: "/tmp/aigui", render: vi.fn(), warn: vi.fn() })
    expect(tool.name).toBe("aigui_render")
    expect(tool.description.length).toBeGreaterThan(20)
    expect(tool.parameters).toBeTypeOf("object")
  })

  it("returns the path of every picture it drew", async () => {
    const render = vi.fn(async () => ({
      text: "",
      images: [
        { kind: "chart", path: "/tmp/a.png", width: 1, height: 1 },
        { kind: "table", path: "/tmp/b.png", width: 1, height: 1 },
      ],
    }))
    const tool = createRenderTool({ outDir: "/tmp/aigui", render, warn: vi.fn() })
    const result = await tool.execute("id", { markdown: "```chart\n{}\n```" })
    expect(result.content[0].text).toContain("/tmp/a.png")
    expect(result.content[0].text).toContain("/tmp/b.png")
  })

  it("tells the model plainly when there was nothing to draw", async () => {
    const render = vi.fn(async () => ({ text: "prose", images: [] }))
    const tool = createRenderTool({ outDir: "/tmp/aigui", render, warn: vi.fn() })
    const result = await tool.execute("id", { markdown: "prose" })
    expect(result.content[0].text).toMatch(/no renderable/i)
  })

  it("reports a render failure as a tool result rather than throwing", async () => {
    const render = vi.fn(async () => {
      throw new Error("chromium missing")
    })
    const tool = createRenderTool({ outDir: "/tmp/aigui", render, warn: vi.fn() })
    const result = await tool.execute("id", { markdown: "```chart\n{}\n```" })
    expect(result.content[0].text).toContain("chromium missing")
  })

  it("passes theme and width through", async () => {
    const render = vi.fn(async () => ({ text: "", images: [{ kind: "chart", path: "/tmp/a.png", width: 1, height: 1 }] }))
    const tool = createRenderTool({ outDir: "/tmp/aigui", render, warn: vi.fn() })
    await tool.execute("id", { markdown: "x", theme: "dark", width: 1000 })
    expect(render).toHaveBeenCalledWith("x", expect.objectContaining({ theme: "dark", width: 1000 }))
  })

  it("clamps a width the model made up", async () => {
    const render = vi.fn(async () => ({ text: "", images: [{ kind: "chart", path: "/tmp/a.png", width: 1, height: 1 }] }))
    const tool = createRenderTool({ outDir: "/tmp/aigui", render, warn: vi.fn() })
    await tool.execute("id", { markdown: "x", width: 99999 })
    expect(render).toHaveBeenCalledWith("x", expect.objectContaining({ width: 2000 }))
  })

  it("refuses a width that is not a number at all", async () => {
    const render = vi.fn(async () => ({ text: "", images: [{ kind: "chart", path: "/tmp/a.png", width: 1, height: 1 }] }))
    const tool = createRenderTool({ outDir: "/tmp/aigui", render, warn: vi.fn() })
    await tool.execute("id", { markdown: "x", width: "</style><script>alert(1)</script>" as never })
    expect(render).toHaveBeenCalledWith("x", expect.objectContaining({ width: undefined }))
  })

  it("falls back to the light theme for an unknown one", async () => {
    const render = vi.fn(async () => ({ text: "", images: [{ kind: "chart", path: "/tmp/a.png", width: 1, height: 1 }] }))
    const tool = createRenderTool({ outDir: "/tmp/aigui", render, warn: vi.fn() })
    await tool.execute("id", { markdown: "x", theme: "chartreuse" as never })
    expect(render).toHaveBeenCalledWith("x", expect.objectContaining({ theme: "light" }))
  })
})
