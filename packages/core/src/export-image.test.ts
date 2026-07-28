// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { exportRenderedImages, exportSVGToImage } from "./export-image"

function stubCanvas() {
  const context = { fillStyle: "", fillRect: vi.fn(), scale: vi.fn(), drawImage: vi.fn() }
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,stub")
  return context
}

function svg(markup: string): SVGElement {
  const host = document.createElement("div")
  host.innerHTML = markup
  return host.querySelector("svg")!
}

beforeEach(() => {
  vi.restoreAllMocks()
  // jsdom neither decodes images nor mints object URLs.
  URL.createObjectURL = vi.fn(() => "blob:stub")
  URL.revokeObjectURL = vi.fn()
  Object.defineProperty(Image.prototype, "src", {
    configurable: true,
    set() { setTimeout(() => this.onload?.(new Event("load"))) },
  })
})

describe("exportSVGToImage", () => {
  it("sizes the export from the drawing and the device pixel ratio", async () => {
    const context = stubCanvas()
    const canvases: HTMLCanvasElement[] = []
    const create = document.createElement.bind(document)
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const element = create(tag)
      if (tag === "canvas") canvases.push(element as HTMLCanvasElement)
      return element
    })

    const result = await exportSVGToImage(svg('<svg width="300" height="150"></svg>'), { scale: 2 })

    expect(result).toMatchObject({ dataUrl: "data:image/png;base64,stub", width: 600, height: 300 })
    expect(canvases[0]!.width).toBe(600)
    expect(context.scale).toHaveBeenCalledWith(2, 2)
    expect(context.drawImage).toHaveBeenCalledWith(expect.any(Image), 0, 0, 300, 150)
  })

  it("falls back to the viewBox when the drawing carries no width", async () => {
    stubCanvas()

    const result = await exportSVGToImage(svg('<svg viewBox="0 0 800 600"></svg>'), { scale: 1 })

    expect(result).toMatchObject({ width: 800, height: 600 })
  })

  it("paints a background so the export does not read as black, unless asked not to", async () => {
    const opaque = stubCanvas()
    await exportSVGToImage(svg('<svg width="10" height="10"></svg>'), { scale: 1, background: "#101014" })
    expect(opaque.fillStyle).toBe("#101014")
    expect(opaque.fillRect).toHaveBeenCalledWith(0, 0, 10, 10)

    const transparent = stubCanvas()
    await exportSVGToImage(svg('<svg width="10" height="10"></svg>'), { scale: 1, background: "transparent" })
    expect(transparent.fillRect).not.toHaveBeenCalled()
  })

  it("adds the SVG namespace a serialized fragment loses", async () => {
    stubCanvas()
    const blobs: Blob[] = []
    URL.createObjectURL = vi.fn((blob: Blob) => { blobs.push(blob); return "blob:stub" })

    await exportSVGToImage(svg("<svg width='10' height='10'></svg>"), { scale: 1 })

    // An Image refuses to decode SVG without it, so the export would silently fail.
    expect(await blobs[0]!.text()).toContain('xmlns="http://www.w3.org/2000/svg"')
  })
})

describe("exportRenderedImages", () => {
  it("exports every drawing an answer produced", async () => {
    stubCanvas()
    const answer = document.createElement("div")
    answer.innerHTML = '<p>text</p><svg width="10" height="10"></svg><svg width="20" height="20"></svg>'

    const images = await exportRenderedImages(answer, { scale: 1 })

    expect(images.map((image) => image.width)).toEqual([10, 20])
  })
})

describe("what a canvas will not take", () => {
  it("turns a Mermaid label into plain SVG text, so the diagram exports at all", async () => {
    // A browser taints the canvas the moment an image containing a `<foreignObject>` is drawn on it, and
    // `toDataURL` then throws SecurityError. Mermaid puts every node label in one, so a mind map could
    // not be exported at all — the button was there and it took the page down.
    stubCanvas()
    const serialise = vi.spyOn(XMLSerializer.prototype, "serializeToString")
    const diagram = svg(
      `<svg width="200" height="100"><g><foreignObject x="10" y="20" width="80" height="40">` +
        `<div xmlns="http://www.w3.org/1999/xhtml">复习到期词汇</div></foreignObject></g></svg>`,
    )

    await exportSVGToImage(diagram)

    const written = serialise.mock.results[0].value as string
    expect(written).not.toContain("foreignObject")
    expect(written).toContain("复习到期词汇")
    // Centred where the label's box was, so the diagram still reads.
    expect(written).toContain('x="50"')
    expect(written).toContain('y="40"')
    // And the drawing on the page is untouched: it is still being displayed.
    expect(diagram.querySelectorAll("foreignObject")).toHaveLength(1)
  })

  it("skips a drawing it cannot rasterise instead of losing the whole export", async () => {
    // One diagram a browser refuses must not cost the others, and the caller has to be told which —
    // an export that quietly returns one of two images has lost one without saying so.
    stubCanvas()
    let attempt = 0
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => {
      attempt += 1
      if (attempt === 1) throw new DOMException("Tainted canvases may not be exported.", "SecurityError")
      return "data:image/png;base64,stub"
    })
    const root = document.createElement("div")
    root.innerHTML = `<svg width="100" height="100"></svg><svg width="120" height="90"></svg>`
    const skipped: unknown[] = []

    const images = await exportRenderedImages(root, { onSkip: (_, reason) => skipped.push(reason) })

    expect(images).toHaveLength(1)
    expect(skipped).toHaveLength(1)
    expect(String(skipped[0])).toContain("Tainted")
  })

  it("does not export a square-root sign as its own image", async () => {
    // KaTeX draws every radical as an inline SVG. Without this, a page with maths on it exports dozens
    // of 20-pixel files with the actual diagram somewhere among them.
    stubCanvas()
    const root = document.createElement("div")
    root.innerHTML =
      `<span class="katex"><span class="mord sqrt"><svg width="12" height="8"></svg></span></span>` +
      `<div data-aigui-mermaid="1"><svg width="300" height="200"></svg></div>`

    const images = await exportRenderedImages(root)

    expect(images).toHaveLength(1)
    expect(images[0].width).toBeGreaterThan(100)
  })
})
