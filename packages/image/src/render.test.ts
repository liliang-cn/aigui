import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderMarkdownToImages } from "./render"

const CHART = '```chart\n{"series":[{"type":"bar","data":[1,2]}]}\n```'
const MERMAID = "```mermaid\ngraph TD;\nA-->B;\n```"

function fakePage(overrides: Record<string, unknown> = {}) {
  return {
    setViewportSize: vi.fn(async () => {}),
    setContent: vi.fn(async () => {}),
    addScriptTag: vi.fn(async () => {}),
    evaluate: vi.fn(async () => ({ width: 400, height: 300, failed: false })),
    locator: vi.fn(() => ({ screenshot: vi.fn(async () => {}) })),
    close: vi.fn(async () => {}),
    ...overrides,
  }
}

let outDir: string
beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), "aigui-image-"))
})

describe("renderMarkdownToImages", () => {
  it("returns the source untouched when there is nothing to draw", async () => {
    const acquire = vi.fn()
    const result = await renderMarkdownToImages("Just prose.", { outDir, acquire })
    expect(result).toEqual({ text: "Just prose.", images: [] })
    expect(acquire).not.toHaveBeenCalled()
  })

  it("renders a chart, writes a PNG and strips the fence", async () => {
    const page = fakePage()
    const acquire = vi.fn(async () => ({ page, release: vi.fn(async () => {}) }))
    const result = await renderMarkdownToImages(`Intro.\n\n${CHART}\n\nOutro.`, { outDir, acquire })
    expect(result.text).toBe("Intro.\n\nOutro.")
    expect(result.images).toHaveLength(1)
    expect(result.images[0].kind).toBe("chart")
    expect(result.images[0].path.endsWith(".png")).toBe(true)
    expect(page.locator).toHaveBeenCalledWith("#root")
  })

  it("releases the page even when a block throws", async () => {
    const release = vi.fn(async () => {})
    const page = fakePage({
      evaluate: vi.fn(async () => {
        throw new Error("boom")
      }),
    })
    const acquire = vi.fn(async () => ({ page, release }))
    const result = await renderMarkdownToImages(CHART, { outDir, acquire })
    expect(result.text).toBe(CHART)
    expect(result.images).toEqual([])
    expect(release).toHaveBeenCalled()
  })

  it("leaves a block as text when its plugin threw inside the page", async () => {
    const page = fakePage({ evaluate: vi.fn(async () => ({ width: 400, height: 300, failed: true })) })
    const acquire = vi.fn(async () => ({ page, release: vi.fn(async () => {}) }))
    const result = await renderMarkdownToImages(CHART, { outDir, acquire })
    expect(result.images).toEqual([])
    expect(result.text).toBe(CHART)
    expect(page.locator).not.toHaveBeenCalled()
  })

  it("keeps the blocks that worked when one of them fails", async () => {
    let call = 0
    const page = fakePage({
      evaluate: vi.fn(async () => {
        call++
        if (call === 2) throw new Error("mermaid exploded")
        return { width: 400, height: 300, failed: false }
      }),
    })
    const acquire = vi.fn(async () => ({ page, release: vi.fn(async () => {}) }))
    const source = `${CHART}\n\n${MERMAID}`
    const result = await renderMarkdownToImages(source, { outDir, acquire })
    expect(result.images.map((i) => i.kind)).toEqual(["chart"])
    expect(result.text).toBe(MERMAID)
  })

  it("propagates a browser that cannot start, having drawn nothing", async () => {
    const acquire = vi.fn(async () => {
      throw new Error("no chromium")
    })
    await expect(renderMarkdownToImages(CHART, { outDir, acquire })).rejects.toThrow("no chromium")
  })

  it("writes one file per rendered block", async () => {
    const page = fakePage({ locator: vi.fn(() => ({ screenshot: vi.fn(async () => {}) })) })
    const acquire = vi.fn(async () => ({ page, release: vi.fn(async () => {}) }))
    const result = await renderMarkdownToImages(`${CHART}\n\n${MERMAID}`, { outDir, acquire })
    expect(new Set(result.images.map((i) => i.path)).size).toBe(2)
  })

  it("respects the max cap and leaves the rest as text", async () => {
    const page = fakePage()
    const acquire = vi.fn(async () => ({ page, release: vi.fn(async () => {}) }))
    const result = await renderMarkdownToImages(`${CHART}\n\n${MERMAID}`, { outDir, acquire, max: 1 })
    expect(result.images).toHaveLength(1)
    expect(result.text).toBe(MERMAID)
  })

  /**
   * Playwright evaluates a *string* as an expression, so passing the page function as a string
   * produces the function object and never calls it — every render silently returns undefined.
   * That bug shipped once and the fake page could not see it, because a fake `evaluate` returns
   * its canned answer whatever it is handed. Asserting the argument's type is what closes the gap.
   */
  it("hands page.evaluate a function, not a string", async () => {
    const page = fakePage()
    const acquire = vi.fn(async () => ({ page, release: vi.fn(async () => {}) }))
    await renderMarkdownToImages(CHART, { outDir, acquire })
    expect(page.evaluate).toHaveBeenCalledTimes(1)
    expect(typeof page.evaluate.mock.calls[0][0]).toBe("function")
    expect(page.evaluate.mock.calls[0][1]).toMatchObject({ source: expect.stringContaining("```chart") })
  })
})
