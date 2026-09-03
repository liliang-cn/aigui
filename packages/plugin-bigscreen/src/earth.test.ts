import { afterEach, describe, expect, it, vi } from "vitest"
import { countriesTexture, earthColours, earthTexture } from "./earth"
import { palette } from "./palette"
import type { GlobeFeatureCollection } from "./types"

const dark = palette({ theme: "dark" })
const light = palette({ theme: "light", accent: "#0e7490" })

/**
 * A canvas that can be sampled.
 *
 * jsdom has no 2D context — `getContext("2d")` is null and every texture here would come back
 * undefined — so the drawing is recorded instead: each fill and stroke keeps the rings that were
 * open at the time and the colour they were drawn in. `colourAt` then answers the only question
 * this file is really making a claim about: what colour ended up at this pixel. It is a rasteriser
 * of about ten lines, but it is the difference between testing that some path was drawn and
 * testing that Africa is not in the sea.
 */
type Ring = Array<[number, number]>
interface Op {
  colour: string
  rings: Ring[]
}

class Recorder {
  fillStyle = "#000000"
  strokeStyle = "#000000"
  lineWidth = 1
  lineJoin = "miter"
  background = ""
  readonly ops: Op[] = []
  private rings: Ring[] = []
  private current: Ring = []

  fillRect(): void {
    this.background = this.fillStyle
  }
  beginPath(): void {
    this.rings = []
    this.current = []
  }
  moveTo(x: number, y: number): void {
    if (this.current.length) this.rings.push(this.current)
    this.current = [[x, y]]
  }
  lineTo(x: number, y: number): void {
    this.current.push([x, y])
  }
  closePath(): void {
    if (this.current.length) this.rings.push(this.current)
    this.current = []
  }
  fill(): void {
    this.ops.push({ colour: this.fillStyle, rings: this.paths() })
  }
  stroke(): void {
    // A stroke is a hairline: it never decides the colour of an interior pixel, so it is recorded
    // only so a test can assert borders were drawn at all.
    this.ops.push({ colour: this.strokeStyle, rings: [] })
  }
  private paths(): Ring[] {
    return this.current.length ? [...this.rings, this.current] : [...this.rings]
  }
}

/** Even-odd point in polygon, over every ring of the path. */
function inside(rings: Ring[], x: number, y: number): boolean {
  let hit = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
    }
  }
  return hit
}

function colourAt(canvas: FakeCanvas, x: number, y: number): string {
  let colour = canvas.ctx.background
  for (const op of canvas.ctx.ops) {
    if (op.rings.length && inside(op.rings, x, y)) colour = op.colour
  }
  return colour
}

interface FakeCanvas {
  width: number
  height: number
  ctx: Recorder
  getContext: (kind: string) => Recorder | null
  toDataURL: (type: string) => string
}

let drawn: FakeCanvas[] = []

function stubCanvas(): void {
  drawn = []
  vi.stubGlobal("document", {
    createElement(tag: string) {
      if (tag !== "canvas") throw new Error(`unexpected element ${tag}`)
      const ctx = new Recorder()
      const canvas: FakeCanvas = {
        width: 0,
        height: 0,
        ctx,
        getContext: (kind) => (kind === "2d" ? ctx : null),
        toDataURL: (type) => `data:${type};base64,ZmFrZQ==`,
      }
      drawn.push(canvas)
      return canvas
    },
  })
}

afterEach(() => vi.unstubAllGlobals())

/** A twenty-degree square with its corner on the origin: Gulf of Guinea, more or less. */
const SQUARE: GlobeFeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]] },
    },
  ],
}

/** A country straddling the antimeridian, which is how a naive projection paints the Pacific. */
const DATELINE: GlobeFeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[170, -10], [-170, -10], [-170, 10], [170, 10], [170, -10]]] },
    },
  ],
}

describe("earthColours", () => {
  it("gives each theme an ocean, a land and a border that differ from each other", () => {
    for (const [c, theme] of [[dark, "dark"], [light, "light"]] as const) {
      const colours = earthColours(c, theme)
      expect(new Set([colours.ocean, colours.land, colours.border]).size).toBe(3)
    }
    expect(earthColours(dark, "dark").ocean).not.toBe(earthColours(light, "light").ocean)
    expect(earthColours(dark, "dark").land).not.toBe(earthColours(light, "light").land)
  })
  it("lets the host name any of the three", () => {
    const colours = earthColours(dark, "dark", { land: "#123456", ocean: "#654321", border: "#abcdef" })
    expect(colours).toEqual({ land: "#123456", ocean: "#654321", border: "#abcdef" })
  })
})

describe("countriesTexture", () => {
  it("paints a 2:1 png with the land inside the polygon and the ocean outside it", () => {
    stubCanvas()
    const colours = earthColours(dark, "dark")
    const url = countriesTexture(SQUARE, colours)
    expect(url).toMatch(/^data:image\/png/)
    const canvas = drawn[0]
    expect([canvas.width, canvas.height]).toEqual([2048, 1024])
    expect(canvas.width / canvas.height).toBe(2)
    // (10E, 10N) is inside the square; (100W, 40S) is a long way outside it.
    expect(colourAt(canvas, (190 / 360) * 2048, (80 / 180) * 1024)).toBe(colours.land)
    expect(colourAt(canvas, (80 / 360) * 2048, (130 / 180) * 1024)).toBe(colours.ocean)
    expect(colourAt(canvas, (190 / 360) * 2048, (80 / 180) * 1024)).not.toBe(colours.ocean)
    // And the borders were stroked, in the border colour.
    expect(canvas.ctx.ops.some((op) => op.colour === colours.border)).toBe(true)
  })

  it("does not smear a country that crosses the antimeridian across the whole Pacific", () => {
    stubCanvas()
    const colours = earthColours(dark, "dark")
    countriesTexture(DATELINE, colours)
    const canvas = drawn[0]
    // Both ends of the country are land …
    expect(colourAt(canvas, (355 / 360) * 2048, 512)).toBe(colours.land)
    expect(colourAt(canvas, (5 / 360) * 2048, 512)).toBe(colours.land)
    // … and the prime meridian, half a world away, is still water.
    expect(colourAt(canvas, 1024, 512)).toBe(colours.ocean)
  })

  it("draws nothing for a geometry it does not know, rather than throwing", () => {
    stubCanvas()
    const url = countriesTexture(
      { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [0, 0] } }, { type: "Feature", geometry: null }] },
      earthColours(dark, "dark"),
    )
    expect(url).toMatch(/^data:image\/png/)
    expect(drawn[0].ctx.ops).toEqual([])
  })
})

describe("earthTexture", () => {
  it("hands back the host's own texture untouched", () => {
    stubCanvas()
    expect(earthTexture(dark, "dark", { baseTexture: "/earth/blue-marble.jpg", countries: SQUARE })).toBe("/earth/blue-marble.jpg")
    // Nothing was painted: a host with a photograph pays for no canvas.
    expect(drawn).toHaveLength(0)
  })

  it("rasterises the countries when there is no texture", () => {
    stubCanvas()
    expect(earthTexture(dark, "dark", { countries: SQUARE })).toMatch(/^data:image\/png/)
    expect(drawn[0].width).toBe(2048)
    expect(drawn[0].ctx.ops.some((op) => op.colour === earthColours(dark, "dark").land)).toBe(true)
  })

  it("falls back to the graticule when the host said nothing", () => {
    stubCanvas()
    expect(earthTexture(dark, "dark")).toMatch(/^data:image\/png/)
    // The graticule is the plugin's old 1024x512 canvas and fills no land.
    expect([drawn[0].width, drawn[0].height]).toEqual([1024, 512])
    expect(drawn[0].ctx.ops.some((op) => op.rings.length)).toBe(false)
  })

  it("paints the same world in the other palette", () => {
    stubCanvas()
    earthTexture(light, "light", { countries: SQUARE })
    const lightLand = colourAt(drawn[0], (190 / 360) * 2048, (80 / 180) * 1024)
    vi.unstubAllGlobals()
    stubCanvas()
    earthTexture(dark, "dark", { countries: SQUARE })
    const darkLand = colourAt(drawn[0], (190 / 360) * 2048, (80 / 180) * 1024)
    expect(lightLand).not.toBe(darkLand)
  })
})
