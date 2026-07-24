import { describe, expect, it } from "vitest"
import { map } from "./index"

describe("map host options", () => {
  it("accepts vector-only defaults and valid host basemap policy", () => {
    expect(() => map()).not.toThrow()
    expect(() => map({ height: 480, minZoom: 1, maxZoom: 18, maxFitZoom: 15, controls: { zoom: true, reset: true, fit: true }, basemap: { tileUrlTemplate: "https://tiles.example.com/{z}/{x}/{y}{r}.png", attribution: { text: "Tiles", url: "https://example.com/terms" }, minZoom: 1, maxZoom: 18, maxNativeZoom: 16, tileSize: 256 }, networkPolicy: { allowedTileOrigins: ["https://tiles.example.com"] } })).not.toThrow()
  })

  it.each([
    { height: 200 }, { height: 360.5 }, { minZoom: 10, maxZoom: 5 }, { maxFitZoom: 23 },
    { unknown: true },
    { basemap: { tileUrlTemplate: "https://tiles.example.com/{z}/{x}/{y}.png", attribution: { text: "x" } } },
    { basemap: { tileUrlTemplate: "https://user:pass@tiles.example.com/{z}/{x}/{y}.png", attribution: { text: "x" } }, networkPolicy: { allowedTileOrigins: ["https://tiles.example.com"] } },
    { basemap: { tileUrlTemplate: "https://tiles.example.com/{q}/{x}/{y}.png", attribution: { text: "x" } }, networkPolicy: { allowedTileOrigins: ["https://tiles.example.com"] } },
    { basemap: { tileUrlTemplate: "https://tiles.example.com/{z}/{x}/{y}.png", attribution: { text: "x" } }, networkPolicy: { allowedTileOrigins: ["https://other.example.com"] } },
    { basemap: { tileUrlTemplate: "https://tiles.example.com/{z}/{x}/{y}.png#x", attribution: { text: "x" } }, networkPolicy: { allowedTileOrigins: ["https://tiles.example.com"] } },
    { basemap: { tileUrlTemplate: "https://tiles.example.com/{z/{x}/{y}.png", attribution: { text: "x" } }, networkPolicy: { allowedTileOrigins: ["https://tiles.example.com"] } },
    Object.defineProperty({}, "height", { enumerable: true, get: () => 360 }),
    { networkPolicy: { allowedTileOrigins: Array(1) } },
  ])("rejects invalid strict/network configuration %#", (options) => expect(() => map(options as never)).toThrow(TypeError))
})
