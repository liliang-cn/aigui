/**
 * Turn what a plugin drew into a PNG the reader can keep.
 *
 * Charts and diagrams are the point of rendering a model's answer, and the first thing anyone
 * wants to do with one is save it. There is no browser API for "download this SVG as an image":
 * it has to be serialized, loaded through an `Image`, and painted onto a canvas. Every host that
 * needs it rewrites those twenty lines, and gets the same details wrong — a transparent
 * background that turns black in a viewer, a blurry export on a retina screen, or a light
 * background hardcoded into a page that has since gone dark.
 */

export interface ExportImageOptions {
  /**
   * Device pixels per CSS pixel. Defaults to the screen's own ratio, so an export looks as sharp
   * as what it was copied from rather than half the resolution on a retina display.
   */
  scale?: number
  /**
   * What to paint behind the drawing. An SVG is usually transparent, which reads as black in most
   * image viewers. Pass the page's own background — or "transparent" to keep the alpha channel.
   */
  background?: string
  /** Overrides for the drawing's own size, in CSS pixels. */
  width?: number
  height?: number
  type?: "image/png" | "image/jpeg" | "image/webp"
  quality?: number
}

export interface ExportedImage {
  dataUrl: string
  width: number
  height: number
}

/** The intrinsic size of an SVG element, falling back to its attributes and then to a default. */
function measure(svg: SVGElement, options: ExportImageOptions): { width: number; height: number } {
  const box = typeof svg.getBoundingClientRect === "function" ? svg.getBoundingClientRect() : undefined
  const attribute = (name: string) => Number.parseFloat(svg.getAttribute(name) ?? "")
  const fromViewBox = (index: number) => {
    const parts = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number)
    return parts.length === 4 && Number.isFinite(parts[index]) ? parts[index] : Number.NaN
  }
  const pick = (...candidates: number[]) => candidates.find((value) => Number.isFinite(value) && value > 0)
  return {
    width: Math.round(pick(options.width ?? Number.NaN, box?.width ?? Number.NaN, attribute("width"), fromViewBox(2), 720)!),
    height: Math.round(pick(options.height ?? Number.NaN, box?.height ?? Number.NaN, attribute("height"), fromViewBox(3), 400)!),
  }
}

/**
 * Render an SVG element to a raster data URL.
 *
 * The element is serialized as it stands, so whatever a plugin drew — including the theme it drew
 * it in — is what gets exported.
 */
export async function exportSVGToImage(svg: SVGElement, options: ExportImageOptions = {}): Promise<ExportedImage> {
  const { width, height } = measure(svg, options)
  const scale = options.scale && options.scale > 0 ? options.scale : (globalThis.devicePixelRatio || 1)
  const source = new XMLSerializer().serializeToString(svg)
  // A serialized fragment carries no namespace of its own, and an `Image` refuses to decode SVG
  // without one.
  const namespaced = /\sxmlns=/.test(source) ? source : source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"')
  const url = URL.createObjectURL(new Blob([namespaced], { type: "image/svg+xml;charset=utf-8" }))
  try {
    const image = await loadImage(url)
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("This browser cannot rasterize images")
    const background = options.background ?? "#ffffff"
    if (background !== "transparent") {
      context.fillStyle = background
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
    context.scale(scale, scale)
    context.drawImage(image, 0, 0, width, height)
    return { dataUrl: canvas.toDataURL(options.type ?? "image/png", options.quality), width: canvas.width, height: canvas.height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Export every drawing inside a rendered answer.
 *
 * A host holds the element it handed to the renderer, not the individual charts, and the plugins
 * decide what lands in it.
 */
export async function exportRenderedImages(root: ParentNode, options: ExportImageOptions = {}): Promise<ExportedImage[]> {
  const drawings = Array.from(root.querySelectorAll("svg"))
  const exported: ExportedImage[] = []
  for (const drawing of drawings) exported.push(await exportSVGToImage(drawing, options))
  return exported
}

/** Save an exported image under the given file name. */
export function downloadImage(image: ExportedImage, filename: string): void {
  const link = document.createElement("a")
  link.download = filename
  link.href = image.dataUrl
  link.click()
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("The drawing could not be decoded"))
    image.src = url
  })
}
