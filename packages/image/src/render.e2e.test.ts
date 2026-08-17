import { mkdtemp, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { closeBrowser } from "./browser"
import { renderMarkdownToImages } from "./render"

const enabled = process.env.AIGUI_IMAGE_E2E === "1"

afterAll(async () => {
  await closeBrowser()
})

describe.skipIf(!enabled)("renderMarkdownToImages (real Chromium)", () => {
  /**
   * `minHeight` is the assertion that earns its keep. `#root` carries 16px of padding on each
   * side, so an *empty* root still measures 32px tall — a blank render sails past any threshold
   * below that. Each case therefore names a height only a genuinely drawn block can reach.
   */
  const cases: Array<[string, string, number]> = [
    ["chart", '```chart\n{"xAxis":{"type":"category","data":["A","B"]},"yAxis":{"type":"value"},"series":[{"type":"bar","data":[3,7]}]}\n```', 300],
    ["mermaid", "```mermaid\ngraph TD;\nA-->B;\nB-->C;\n```", 120],
    // Measured, not guessed: a properly typeset fraction plus the root's 32px padding comes to
    // ~99px. Unstyled — the KaTeX-CSS bug — it collapsed to 29px, and an empty root is 32px. 80
    // sits above both failure modes and comfortably below the real thing.
    ["math", "$$\n\\frac{a}{b} = c\n$$", 80],
    ["table", "| 城市 | 温度 |\n| --- | --- |\n| 东京 | 24 |\n| 上海 | 31 |", 80],
  ]

  it.each(cases)("draws a %s to a non-trivial PNG", async (kind, source, minHeight) => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-e2e-"))
    const result = await renderMarkdownToImages(source, { outDir, timeoutMs: 30_000 })
    expect(result.images.map((image) => image.kind)).toEqual([kind])
    expect(result.text).toBe("")
    const info = await stat(result.images[0].path)
    // A blank 720px PNG compresses to roughly a kilobyte. Anything real is far larger.
    expect(info.size).toBeGreaterThan(2000)
    expect(result.images[0].width).toBeGreaterThan(50)
    expect(result.images[0].height).toBeGreaterThan(minHeight)
  }, 60_000)

  /**
   * Mermaid is the case that catches a regression of the quiescence race. Its plugin resolves
   * asynchronously, so if the page ever again declares a block finished merely because the DOM
   * went quiet, this screenshots an empty `data-aigui-async-pending` div and the height collapses
   * to the padding. Repeated because the failure was intermittent by nature.
   */
  it("waits for Mermaid every time, not just when it happens to be fast", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-e2e-mermaid-"))
    const source = "```mermaid\ngraph TD;\nA[Start]-->B[Middle];\nB-->C[End];\n```"
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await renderMarkdownToImages(source, { outDir, timeoutMs: 30_000 })
      expect(result.images).toHaveLength(1)
      expect(result.images[0].height).toBeGreaterThan(120)
    }
  }, 120_000)

  it("typesets symbols a fallback font does not have", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-e2e-symbols-"))
    const source = "$$\n\\sum_{i=1}^{n} \\sqrt{\\frac{x_i}{\\alpha}} \\in \\mathbb{R}\n$$"
    const result = await renderMarkdownToImages(source, { outDir, timeoutMs: 30_000 })
    expect(result.images).toHaveLength(1)
    // Blackboard bold and the big operators only exist in KaTeX's own faces. If the fonts failed
    // to load this still renders, just wrong — so lean on the height a real radical forces.
    expect(result.images[0].height).toBeGreaterThan(90)
  }, 60_000)

  it("renders CJK text without tofu", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-e2e-cjk-"))
    const result = await renderMarkdownToImages("| 项目 | 数值 |\n| --- | --- |\n| 营业额 | 一万 |", {
      outDir,
      timeoutMs: 30_000,
    })
    const info = await stat(result.images[0].path)
    expect(info.size).toBeGreaterThan(2000)
  }, 60_000)

  it("keeps the prose and drops only the fence", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-e2e-mixed-"))
    const source = 'Here is the breakdown.\n\n```chart\n{"series":[{"type":"pie","data":[{"value":5,"name":"A"},{"value":3,"name":"B"}]}]}\n```\n\nLet me know if you want it by month.'
    const result = await renderMarkdownToImages(source, { outDir, timeoutMs: 30_000 })
    expect(result.text).toBe("Here is the breakdown.\n\nLet me know if you want it by month.")
    expect(result.images).toHaveLength(1)
  }, 60_000)
})
