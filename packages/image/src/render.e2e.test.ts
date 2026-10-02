import { mkdtemp, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { acquirePage, closeBrowser, type PageLease } from "./browser"
import { renderMarkdownToImages, type InternalRenderOptions } from "./render"

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
    // The four WebGL-or-SVG additions. A scene's canvas is 0.6 × the inner width tall, a
    // gravity figure is drawn at 0.625 ×, a molecule in 3D at 0.6 ×; the big screen is a grid
    // of panels and a single row of it already clears 200px.
    ["scene", '```scene\n{"objects":[{"shape":"box","size":[2,1,1],"anchor":"bottom","color":"wheat","label":"crate"},{"shape":"sphere","radius":0.5,"position":[0,1,0],"anchor":"bottom","color":"blue"}],"caption":"a crate and a ball"}\n```', 380],
    ["gravity", '```gravity\n{"units":"astronomical","bodies":[{"id":"Sun","mass":1},{"id":"Earth","mass":3e-6,"orbit":{"around":"Sun","distance":1}}],"duration":1,"caption":"one year"}\n```', 400],
    ["bigscreen", '```bigscreen\n{"title":"Wall","panels":[{"kind":"kpi","title":"Revenue","value":12843000,"prefix":"¥","delta":0.12,"span":6},{"kind":"gauge","title":"Target","value":82,"unit":"%","span":6},{"kind":"chart3d","title":"3D","span":12,"type":"bar3D","xAxis":["a","b"],"yAxis":["x","y"],"data":[[0,0,1],[1,0,2],[0,1,3],[1,1,4]]}]}\n```', 500],
    ["molecule", '```molecule\n{"version":1,"format":"smiles","source":"Cn1cnc2c1c(=O)n(C)c(=O)n2C","view":"3d","style":"ball-and-stick"}\n```', 380],
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

  /**
   * A WebGL canvas that failed to get a context is still a canvas — the element is there, its
   * size is right, and it is blank. Size alone would pass it. A drawn scene has a grid, a crate
   * and a ball on it, and compresses to far more than a flat rectangle does.
   */
  it("actually paints WebGL rather than screenshotting an empty canvas", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-e2e-webgl-"))
    const source = '```scene\n{"objects":[{"shape":"box","size":[2,1,1],"anchor":"bottom","color":"wheat"},{"shape":"torus","radius":1,"tube":0.3,"position":[0,2,0],"color":"red"}]}\n```'
    const result = await renderMarkdownToImages(source, { outDir, timeoutMs: 30_000 })
    expect(result.images).toHaveLength(1)
    const info = await stat(result.images[0].path)
    expect(info.size).toBeGreaterThan(20_000)
  }, 60_000)

  it("draws a dark chart when asked for one", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-e2e-dark-"))
    const source = '```chart\n{"xAxis":{"type":"category","data":["A","B"]},"yAxis":{"type":"value"},"series":[{"type":"bar","data":[3,7]}]}\n```'
    const result = await renderMarkdownToImages(source, { outDir, theme: "dark", timeoutMs: 30_000 })
    expect(result.images).toHaveLength(1)
    expect(result.images[0].height).toBeGreaterThan(300)
  }, 60_000)

  /**
   * The scene that broke labels: two stacks of boxes and a pipe, every object labelled, the lower
   * box of each stack covered by the one above. With `labelSide` the labels must all be readable
   * and clear of the objects and of each other — which the scene reports on its label layer, read
   * here from the page the picture was actually taken of, before it is handed back.
   */
  it("lays out a stacked scene's labels without overlaps, with the author's camera and without", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-e2e-labels-"))
    const sided = readFileSync(join(__dirname, "../../plugin-scene/src/fixtures/regression/stacked-labels.json"), "utf8")
    const { camera: _camera, ...framed } = JSON.parse(sided)
    const layers: Array<{ labels: string | null; overlaps: string | null }> = []
    const acquire: InternalRenderOptions["acquire"] = async (options) => {
      const lease = (await acquirePage(options)) as PageLease & { page: { evaluate<T>(fn: () => T): Promise<T> } }
      return {
        page: lease.page,
        release: async () => {
          layers.push(await lease.page.evaluate(() => {
            const layer = document.querySelector("[data-aigui-scene-labels]")
            return { labels: layer?.getAttribute("data-labels") ?? null, overlaps: layer?.getAttribute("data-overlaps") ?? null }
          }))
          await lease.release()
        },
      }
    }
    for (const definition of [sided, JSON.stringify(framed)]) {
      const result = await renderMarkdownToImages("```scene\n" + definition + "\n```", { outDir, timeoutMs: 30_000, acquire })
      expect(result.images).toHaveLength(1)
    }
    expect(layers).toEqual([{ labels: "6", overlaps: "0" }, { labels: "6", overlaps: "0" }])
  }, 90_000)

  /**
   * The second look a picture gets. A clean block comes back with nothing to say — a checker that
   * cries wolf on every chart is one nobody reads — and a crowded one names what is wrong in terms
   * the model that wrote it can act on.
   */
  it("says what is wrong with a crowded picture, and nothing about a clean one", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-e2e-issues-"))
    const clean = await renderMarkdownToImages('```chart\n{"xAxis":{"type":"category","data":["A","B"]},"yAxis":{"type":"value"},"series":[{"type":"bar","data":[3,7]}]}\n```\n\n$$\n\\frac{a}{b}\n$$', { outDir, timeoutMs: 30_000 })
    expect(clean.images.flatMap((image) => image.issues)).toEqual([])
    const slices = JSON.stringify(Array.from({ length: 14 }, (_, i) => ({ name: `s${i}`, value: i + 1 })))
    const crowded = await renderMarkdownToImages(`\`\`\`bigscreen\n{"title":"W","panels":[{"kind":"chart","title":"Share","span":12,"option":{"series":[{"type":"pie","data":${slices}}]}}]}\n\`\`\``, { outDir, timeoutMs: 30_000 })
    expect(crowded.images[0].issues).toEqual([{ block: "bigscreen", kind: "plugin", message: expect.stringContaining("Share: a pie of 14 slices") }])
  }, 90_000)

  it("says when labels are drawn on top of each other, once per block", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-e2e-overlap-"))
    const names = Array.from({ length: 14 }, (_, i) => `第${i + 1}个很长很长的分类名字`)
    const option = { xAxis: { type: "category", data: names, axisLabel: { interval: 0 } }, yAxis: { type: "value" }, series: [{ type: "bar", data: names.map((_, i) => i + 1) }] }
    const result = await renderMarkdownToImages("```chart\n" + JSON.stringify(option) + "\n```", { outDir, timeoutMs: 30_000 })
    const overlaps = result.images[0].issues.filter((issue) => issue.kind === "overlap")
    expect(overlaps).toHaveLength(1)
    expect(overlaps[0].message).toMatch(/^\d+ pairs of labels are drawn on top of each other/)
  }, 60_000)

  it("draws a topology still, every step numbered and none of its text overlapping", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-e2e-topology-"))
    const { topologyPromptSpec } = await import("@ai-gui/plugin-topology")
    const block = topologyPromptSpec("zh-CN").split("```topology\n")[1]
    const result = await renderMarkdownToImages("```topology\n" + block.slice(0, block.indexOf("```")) + "```", { outDir, timeoutMs: 30_000 })
    expect(result.images.map((image) => image.kind)).toEqual(["topology"])
    expect(result.images[0].issues).toEqual([])
    expect(result.images[0].height).toBeGreaterThan(200)
  }, 60_000)

})
