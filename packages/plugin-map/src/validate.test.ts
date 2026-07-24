import { describe, expect, it } from "vitest"
import { DEFAULT_MAP_LIMITS, MapDocumentError, MapLimitError, parseMapDocument, validateMapDocument } from "./index"

const markerDocument = () => ({ version: 1 as const, ariaLabel: "Places", layers: [{ id: "places", type: "markers" as const, items: [{ id: "one", position: [12, 34] as [number, number], label: "One", description: "Safe <b>text</b>" }] }] })
const feature = (geometry: unknown, properties: Record<string, string | number | boolean | null> = { name: "A" }) => ({ type: "Feature", properties, geometry })
const geo = (geometry: unknown, properties?: Record<string, string | number | boolean | null>) => ({ version: 1, layers: [{ id: "geo", type: "geojson", data: { type: "FeatureCollection", features: [feature(geometry, properties)] } }] })

describe("map document validation", () => {
  it("parses the exact document and preserves identity for programmatic validation", () => {
    const value = markerDocument()
    expect(validateMapDocument(value)).toBe(value)
    expect(parseMapDocument(JSON.stringify(value))).toEqual(value)
  })

  it.each([
    ["unknown keys", { ...markerDocument(), style: {} }],
    ["network fields", { version: 1, layers: [{ id: "x", type: "markers", tileUrl: "https://x/{z}" , items: [] }] }],
    ["duplicate ids", { version: 1, layers: [{ id: "same", type: "markers", items: [{ id: "same", position: [0, 0], label: "x" }] }] }],
    ["duplicate feature ids", { version: 1, layers: [{ id: "geo", type: "geojson", data: { type: "FeatureCollection", features: [{ ...feature({ type: "Point", coordinates: [0, 0] }), id: "feature" }, { ...feature({ type: "Point", coordinates: [1, 1] }), id: "feature" }] } }] }],
    ["unsafe ids", { version: 1, layers: [{ id: "../x", type: "markers", items: [] }] }],
    ["altitude", geo({ type: "Point", coordinates: [0, 0, 1] })],
    ["null geometry", geo(null)],
    ["geometry collection", geo({ type: "GeometryCollection", geometries: [] })],
    ["unclosed polygon", geo({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] })],
    ["short line", geo({ type: "LineString", coordinates: [[0, 0]] })],
    ["invalid latitude", geo({ type: "Point", coordinates: [0, 86] })],
    ["nested properties", geo({ type: "Point", coordinates: [0, 0] }, { bad: {} as never })],
    ["foreign geojson keys", { version: 1, layers: [{ id: "geo", type: "geojson", data: { type: "FeatureCollection", features: [], crs: {} } }] }],
  ])("rejects %s", (_name, value) => expect(() => validateMapDocument(value)).toThrow(MapDocumentError))

  it("accepts every geometry and fixed variant", () => {
    const geometries = [
      { type: "Point", coordinates: [0, 0] },
      { type: "MultiPoint", coordinates: [[0, 0], [1, 1]] },
      { type: "LineString", coordinates: [[0, 0], [1, 1]] },
      { type: "MultiLineString", coordinates: [[[0, 0], [1, 1]]] },
      { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      { type: "MultiPolygon", coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]] },
    ]
    expect(() => validateMapDocument({ version: 1, layers: geometries.map((geometry, index) => ({ id: `g${index}`, type: "geojson", variant: ["default", "accent", "muted", "positive", "warning", "critical"][index], data: { type: "FeatureCollection", features: [feature(geometry)] } })) })).not.toThrow()
  })

  it("rejects malformed JSON with detailed public issues", () => {
    try { parseMapDocument("{") } catch (error) {
      expect(error).toBeInstanceOf(MapDocumentError)
      expect((error as MapDocumentError).issues[0]).toContain("valid JSON")
    }
  })

  it("enforces source, collection and aggregate limits", () => {
    expect(DEFAULT_MAP_LIMITS.sourceBytes).toBe(256 * 1024)
    expect(() => parseMapDocument(" ".repeat(DEFAULT_MAP_LIMITS.sourceBytes + 1))).toThrow(MapLimitError)
    expect(() => validateMapDocument({ version: 1, layers: Array.from({ length: 17 }, (_, i) => ({ id: `l${i}`, type: "markers", items: [] })) })).toThrow(MapLimitError)
    expect(() => validateMapDocument({ version: 1, layers: [{ id: "m", type: "markers", items: Array.from({ length: 501 }, (_, i) => ({ id: `m${i}`, position: [0, 0], label: "x" })) }] })).toThrow(MapLimitError)
    expect(() => validateMapDocument({ version: 1, layers: [{ id: "r", type: "route", coordinates: Array.from({ length: 5001 }, () => [0, 0]) }] })).toThrow(MapLimitError)
  })

  it.each([
    ["cycles", () => { const x: any = markerDocument(); x.self = x; return x }],
    ["class instances", () => new (class X { version = 1; layers = [] })()],
    ["accessors", () => { const x = markerDocument() as any; Object.defineProperty(x, "ariaLabel", { enumerable: true, get() { return "x" } }); return x }],
    ["sparse arrays", () => { const x = markerDocument() as any; x.layers[0].items = Array(1); return x }],
    ["nonfinite", () => { const x = markerDocument() as any; x.layers[0].items[0].position[0] = Infinity; return x }],
  ])("rejects unsafe programmatic %s", (_name, make) => expect(() => validateMapDocument(make())).toThrow(MapDocumentError))
})
