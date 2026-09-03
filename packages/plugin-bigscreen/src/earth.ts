import { globeTexture } from "./options"
import { withAlpha, type Palette } from "./palette"
import type { GlobeFeatureCollection, GlobeGeometry, GlobeSkin, ScreenTheme } from "./types"

/**
 * The planet a globe panel is drawn on.
 *
 * echarts-gl's globe samples one equirectangular image: 2:1, longitude -180..180 left to right,
 * latitude 90..-90 top to bottom. A host that has a satellite photograph hands it over as
 * `baseTexture` and this file does nothing; a host that has only country outlines hands over
 * GeoJSON and this file paints them, because a page must not fetch a map on a model's say-so and
 * because the same outlines have to come out in two palettes.
 *
 * The canvas is 2048x1024 rather than the graticule's 1024x512: a border is one pixel wide, and
 * at half this width the coastline of anywhere smaller than France stops being a shape.
 */

const WIDTH = 2048
const HEIGHT = 1024

/** The three colours a painted world is made of, defaulted from the screen's palette. */
export interface EarthColours {
  ocean: string
  land: string
  border: string
}

export function earthColours(c: Palette, theme: ScreenTheme, skin?: GlobeSkin): EarthColours {
  const dark = theme === "dark"
  return {
    // The dark ocean is the graticule's own background, so the two skins read as one globe in
    // two states rather than two different planets.
    ocean: skin?.ocean ?? (dark ? "#0b1a33" : "#dbe7f5"),
    land: skin?.land ?? (dark ? "#334155" : "#f8fafc"),
    border: skin?.border ?? withAlpha(c.accent, dark ? 0.55 : 0.75),
  }
}

/** The rings of a geometry, as a list of polygons; anything that is not a polygon is skipped. */
function polygonsOf(geometry: GlobeGeometry | null | undefined): number[][][][] {
  if (!geometry || !Array.isArray(geometry.coordinates)) return []
  if (geometry.type === "Polygon") return [geometry.coordinates as number[][][]]
  if (geometry.type === "MultiPolygon") return geometry.coordinates as number[][][][]
  return []
}

/**
 * One ring, in canvas pixels, shifted by whole worlds.
 *
 * Longitude is unwrapped as it goes: a step of more than half the world is the antimeridian, not
 * a country, and drawing it literally paints a bar all the way across the Pacific — which is how
 * Russia and Fiji ruin an otherwise correct map. Carrying an offset instead keeps the ring
 * continuous past ±180, and the caller draws it three times, one world left and one right, so the
 * part that has left the canvas comes back on the other side.
 */
function traceRing(ctx: CanvasRenderingContext2D, ring: number[][], shift: number): void {
  if (ring.length < 2) return
  let offset = 0
  let previous = ring[0][0]
  ring.forEach((point, index) => {
    const lon = point[0]
    const step = lon - previous
    if (step > 180) offset -= 360
    else if (step < -180) offset += 360
    previous = lon
    const x = ((lon + offset + 180) / 360) * WIDTH + shift
    const y = ((90 - point[1]) / 180) * HEIGHT
    if (index === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
}

/**
 * Rasterise a world onto a 2:1 canvas and hand it over as a data URL.
 *
 * A data URL rather than the canvas element: that is the path echarts-gl treats as an image to
 * decode, and it involves no request. A canvas element handed to `baseTexture` is a white ball.
 *
 * Rings are filled even-odd so that a country drawn as an outer ring plus holes — Lesotho inside
 * South Africa, the lakes inside Canada — comes out with the holes in it whichever way round the
 * source wound them.
 */
export function countriesTexture(countries: GlobeFeatureCollection, colours: EarthColours): string | undefined {
  if (typeof document === "undefined") return undefined
  const canvas = document.createElement("canvas")
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext("2d")
  if (!ctx) return undefined
  ctx.fillStyle = colours.ocean
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.fillStyle = colours.land
  ctx.strokeStyle = colours.border
  ctx.lineWidth = 1
  ctx.lineJoin = "round"
  for (const feature of countries.features ?? []) {
    for (const polygon of polygonsOf(feature?.geometry)) {
      for (const shift of [-WIDTH, 0, WIDTH]) {
        ctx.beginPath()
        for (const ring of polygon) traceRing(ctx, ring, shift)
        ctx.fill("evenodd")
        ctx.stroke()
      }
    }
  }
  return canvas.toDataURL("image/png")
}

/**
 * The texture a globe panel wears, by the host's precedence.
 *
 * `baseTexture` wins because a host that has a photograph has already decided; `countries` is
 * next because outlines a host bundled are still the host's map; and with neither there is the
 * graticule, which is what this plugin has always drawn and what every consumer that never heard
 * of a `globe` option keeps getting.
 */
export function earthTexture(c: Palette, theme: ScreenTheme, skin?: GlobeSkin): string | undefined {
  if (skin?.baseTexture) return skin.baseTexture
  if (skin?.countries) return countriesTexture(skin.countries, earthColours(c, theme, skin)) ?? globeTexture(c, theme)
  return globeTexture(c, theme)
}
