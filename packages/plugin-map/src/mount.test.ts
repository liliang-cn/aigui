// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { collectNodeRenderers, type ASTNode, type RenderOutput } from "@ai-gui/core"

const mocks = vi.hoisted(() => {
  const layer = () => ({ addTo: vi.fn().mockReturnThis(), bindTooltip: vi.fn().mockReturnThis(), getBounds: vi.fn(() => ({ isValid: () => true })) })
  return {
    map: vi.fn(), tileLayer: vi.fn(layer), circleMarker: vi.fn(layer), polyline: vi.fn(layer), geoJSON: vi.fn(layer), featureGroup: vi.fn(layer),
    zoomControl: vi.fn(() => ({ addTo: vi.fn() })), loaded: vi.fn(), remove: vi.fn(), fitBounds: vi.fn(), setView: vi.fn(), invalidateSize: vi.fn(), setMaxBounds: vi.fn(),
  }
})

vi.mock("leaflet", () => {
  mocks.loaded()
  return {
    map: mocks.map, tileLayer: mocks.tileLayer, circleMarker: mocks.circleMarker, polyline: mocks.polyline,
    geoJSON: mocks.geoJSON, featureGroup: mocks.featureGroup, control: { zoom: mocks.zoomControl },
  }
})

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = []
  callback: ResizeObserverCallback
  disconnect = vi.fn()
  observe = vi.fn()
  constructor(callback: ResizeObserverCallback) { this.callback = callback; ResizeObserverMock.instances.push(this) }
}

const content = JSON.stringify({ version: 1, ariaLabel: "Map example", layers: [
  { id: "geo", type: "geojson", labelProperty: "name", tooltipProperties: ["kind"], data: { type: "FeatureCollection", features: [{ type: "Feature", properties: { name: "Area", kind: "park" }, geometry: { type: "Point", coordinates: [1, 2] } }] } },
  { id: "markers", type: "markers", items: [{ id: "m1", position: [3, 4], label: "Marker", description: "Description" }] },
  { id: "route", type: "route", coordinates: [[1, 2], [3, 4]], label: "Route" },
] })

describe("Leaflet mount", () => {
  beforeEach(() => {
    vi.clearAllMocks(); ResizeObserverMock.instances = []
    vi.stubGlobal("ResizeObserver", ResizeObserverMock)
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    mocks.map.mockReturnValue({ remove: mocks.remove, fitBounds: mocks.fitBounds, setView: mocks.setView, invalidateSize: mocks.invalidateSize, setMaxBounds: mocks.setMaxBounds, getZoom: () => 4 })
    mocks.featureGroup.mockReturnValue({ getBounds: () => ({ isValid: () => true }) })
  })

  it("lazily mounts bounded vector layers, controls, resize and cleanup", async () => {
    const { map } = await import("./index")
    expect(mocks.loaded).not.toHaveBeenCalled()
    const plugin = map({ controls: { zoom: true, reset: true, fit: true } })
    const render = collectNodeRenderers([plugin]).map
    const out = render({ key: "m", type: "map", content, complete: true } as ASTNode) as RenderOutput
    const mount = mountOutput(out)
    const host = document.createElement("div")
    const cleanup = mount.mount(host, {})
    await vi.waitFor(() => expect(mocks.map).toHaveBeenCalledOnce())
    expect(mocks.geoJSON).toHaveBeenCalledOnce()
    expect(mocks.circleMarker).toHaveBeenCalled()
    expect(mocks.polyline).toHaveBeenCalledOnce()
    expect(mocks.tileLayer).not.toHaveBeenCalled()
    expect(mocks.zoomControl).toHaveBeenCalledOnce()
    expect(host.querySelector('button[aria-label="Reset map view"]')).toBeTruthy()
    expect(host.querySelector('button[aria-label="Fit map data"]')).toBeTruthy()
    expect(host.querySelector('[role="status"]')).toBeTruthy()
    expect(ResizeObserverMock.instances[0].observe).toHaveBeenCalled()
    ResizeObserverMock.instances[0].callback([], ResizeObserverMock.instances[0] as never)
    expect(mocks.invalidateSize).toHaveBeenCalled()
    host.querySelector<HTMLButtonElement>('button[aria-label="Fit map data"]')?.click()
    expect(mocks.fitBounds).toHaveBeenCalled()
    expect(typeof cleanup).toBe("function")
    cleanup?.(); cleanup?.()
    expect(mocks.remove).toHaveBeenCalledOnce()
    expect(ResizeObserverMock.instances[0].disconnect).toHaveBeenCalledOnce()
  })

  it("adds a validated optional basemap and honors explicit reset view", async () => {
    const { map } = await import("./index")
    const plugin = map({ basemap: { tileUrlTemplate: "https://tiles.example.com/{z}/{x}/{y}.png", attribution: { text: "Tiles" } }, networkPolicy: { allowedTileOrigins: ["https://tiles.example.com"] } })
    const document = JSON.stringify({ version: 1, view: { center: [10, 20], zoom: 7 }, layers: [{ id: "m", type: "markers", items: [] }] })
    const out = collectNodeRenderers([plugin]).map({ key: "m", type: "map", content: document, complete: true } as ASTNode) as RenderOutput
    mountOutput(out).mount(documentElement(), {})
    await vi.waitFor(() => expect(mocks.tileLayer).toHaveBeenCalledOnce())
    expect(mocks.setView).toHaveBeenCalledWith([20, 10], 7, expect.objectContaining({ animate: false }))
  })

  it("cleanup before the lazy import resolves cannot revive a map", async () => {
    vi.resetModules()
    let resolve!: (value: unknown) => void
    vi.doMock("leaflet", () => new Promise((done) => { resolve = done }))
    const { map } = await import("./index")
    const out = collectNodeRenderers([map()]).map({ key: "m", type: "map", content, complete: true } as ASTNode) as RenderOutput
    const cleanup = mountOutput(out).mount(documentElement(), {})
    await vi.waitFor(() => expect(typeof resolve).toBe("function"))
    cleanup?.()
    resolve({ map: mocks.map })
    await Promise.resolve(); await Promise.resolve()
    expect(mocks.map).not.toHaveBeenCalled()
  })
})

function documentElement(): HTMLElement { const element = document.createElement("div"); document.body.appendChild(element); return element }

function mountOutput(output: RenderOutput): Extract<RenderOutput, { kind: "mount" }> {
  if (output.kind !== "element") throw new Error("expected map section")
  const mount = output.children?.find((child): child is Extract<RenderOutput, { kind: "mount" }> => child.kind === "mount")
  if (!mount) throw new Error("expected mount child")
  return mount
}
