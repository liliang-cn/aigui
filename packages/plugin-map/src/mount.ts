import type * as Leaflet from "leaflet"
import type { MapDocument, MapFeature, MapGeoJSONLayer, MapLayer, MapOptions, MapVariant, Position, ResolvedMapOptions } from "./types"

const WORLD: [[number, number], [number, number]] = [[-85.05112878, -180], [85.05112878, 180]]
const PAINT: Record<MapVariant, { color: string; fillColor: string; fillOpacity: number; weight: number }> = {
  default: { color: "#334155", fillColor: "#64748b", fillOpacity: .25, weight: 3 }, accent: { color: "#1d4ed8", fillColor: "#3b82f6", fillOpacity: .28, weight: 3 },
  muted: { color: "#64748b", fillColor: "#94a3b8", fillOpacity: .2, weight: 2 }, positive: { color: "#15803d", fillColor: "#22c55e", fillOpacity: .25, weight: 3 },
  warning: { color: "#b45309", fillColor: "#f59e0b", fillOpacity: .28, weight: 3 }, critical: { color: "#b91c1c", fillColor: "#ef4444", fillOpacity: .28, weight: 3 },
}

export function mountMapDocument(host: HTMLElement, document: MapDocument, options: ResolvedMapOptions): () => void {
  if (!host || typeof host.replaceChildren !== "function") throw new TypeError("mountMapDocument requires an HTMLElement host.")
  const canvas = globalThis.document.createElement("div")
  canvas.setAttribute("data-aigui-map-canvas", "")
  canvas.setAttribute("role", "region")
  canvas.setAttribute("aria-label", document.ariaLabel ?? "Interactive map")
  canvas.tabIndex = 0
  canvas.style.setProperty("--aigui-map-height", `${options.height}px`)
  const controls = globalThis.document.createElement("div")
  controls.setAttribute("data-aigui-map-controls", "")
  const status = globalThis.document.createElement("div")
  status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); status.hidden = true
  canvas.append(controls, status)
  host.replaceChildren(canvas)

  let disposed = false
  let map: Leaflet.Map | undefined
  let resize: ResizeObserver | undefined
  const listeners: Array<() => void> = []
  void import("leaflet").then((module) => {
    if (disposed) return
    const L = ("default" in module ? module.default : module) as typeof Leaflet
    map = L.map(canvas, {
      zoomControl: false, attributionControl: false, minZoom: options.minZoom, maxZoom: options.maxZoom, maxBounds: WORLD,
      dragging: options.dragging, touchZoom: options.touchZoom, doubleClickZoom: options.doubleClickZoom,
      scrollWheelZoom: options.scrollWheelZoom, keyboard: options.keyboard,
    })
    map.setMaxBounds(WORLD)
    if (options.basemap) {
      L.tileLayer(options.basemap.tileUrlTemplate, {
        attribution: "", minZoom: options.basemap.minZoom, maxZoom: options.basemap.maxZoom,
        maxNativeZoom: options.basemap.maxNativeZoom, tileSize: options.basemap.tileSize,
      }).addTo(map)
      canvas.appendChild(attribution(options.basemap.attribution))
    }
    const layers: Leaflet.Layer[] = []
    for (const layer of document.layers) addLayer(L, map, layer, layers)
    const bounds = layers.length ? L.featureGroup(layers).getBounds() : undefined
    const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    const reset = () => {
      if (!map) return
      if (document.view) map.setView(toLatLng(document.view.center), clamp(document.view.zoom, options.minZoom, options.maxZoom), { animate: !reduced })
      else fit(map, bounds, options.maxFitZoom, reduced)
      announce(status, "Map view reset.")
    }
    const fitData = () => { if (map) { fit(map, bounds, options.maxFitZoom, reduced); announce(status, "Map fitted to data.") } }
    if (document.view) reset(); else fitData()
    if (options.controls.zoom) L.control.zoom({ position: "topleft" }).addTo(map)
    if (options.controls.reset) listeners.push(button(controls, "Reset map view", reset))
    if (options.controls.fit) listeners.push(button(controls, "Fit map data", fitData))
    if (typeof ResizeObserver !== "undefined") { resize = new ResizeObserver(() => map?.invalidateSize({ pan: false })); resize.observe(canvas) }
  }).catch(() => { if (!disposed) announce(status, "Map unavailable.") })
  return () => {
    if (disposed) return
    disposed = true
    listeners.splice(0).forEach((remove) => remove())
    resize?.disconnect()
    map?.remove()
    map = undefined
    host.replaceChildren()
  }
}

function addLayer(L: typeof Leaflet, map: Leaflet.Map, layer: MapLayer, layers: Leaflet.Layer[]): void {
  if (layer.type === "markers") {
    for (const item of layer.items) {
      const marker = L.circleMarker(toLatLng(item.position), { ...paint(item.variant), radius: 7 }).addTo(map)
      marker.bindTooltip(tooltip([item.label, item.description]))
      layers.push(marker)
    }
  } else if (layer.type === "route") {
    const route = L.polyline(layer.coordinates.map(toLatLng), paint(layer.variant)).addTo(map)
    if (layer.label || layer.description) route.bindTooltip(tooltip([layer.label, layer.description]))
    layers.push(route)
  } else {
    const geo = L.geoJSON(swapFeatureCollection(layer), {
      style: paint(layer.variant),
      pointToLayer: (_feature, latlng) => L.circleMarker(latlng, { ...paint(layer.variant), radius: 7 }),
      onEachFeature: (feature, featureLayer) => {
        const lines = geoTooltip(layer, feature as unknown as MapFeature)
        if (lines.length) featureLayer.bindTooltip(tooltip(lines))
      },
    }).addTo(map)
    layers.push(geo)
  }
}

function geoTooltip(layer: MapGeoJSONLayer, feature: MapFeature): string[] { const result: string[] = []; const label = featureLabel(layer, feature); if (label) result.push(label); for (const key of layer.tooltipProperties ?? []) { const value = feature.properties?.[key]; if (value !== undefined && value !== null) result.push(`${key}: ${String(value)}`) } return result }
function featureLabel(layer: MapGeoJSONLayer, feature: MapFeature): string | undefined { const value = layer.labelProperty ? feature.properties?.[layer.labelProperty] : undefined; return value === undefined || value === null ? undefined : String(value) }
function tooltip(lines: Array<string | undefined>): HTMLElement { const node = globalThis.document.createElement("span"); node.textContent = lines.filter(Boolean).join("\n"); return node }
function paint(variant: MapVariant | undefined) { return PAINT[variant ?? "default"] }
function toLatLng(position: Position): [number, number] { return [position[1], position[0]] }
function fit(map: Leaflet.Map, bounds: Leaflet.LatLngBounds | undefined, maxZoom: number, reduced: boolean): void { if (bounds?.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom, animate: !reduced }); else map.setView([0, 0], 2, { animate: !reduced }) }
function button(host: HTMLElement, label: string, action: () => void): () => void { const element = globalThis.document.createElement("button"); element.type = "button"; element.textContent = label; element.setAttribute("aria-label", label); element.addEventListener("click", action); host.appendChild(element); return () => element.removeEventListener("click", action) }
function announce(status: HTMLElement, text: string): void { status.hidden = false; status.textContent = text }
function attribution(value: { text: string; url?: string }): HTMLElement { const node = globalThis.document.createElement("div"); node.setAttribute("data-aigui-map-attribution", ""); if (value.url) { const link = globalThis.document.createElement("a"); link.href = value.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = value.text; node.appendChild(link) } else node.textContent = value.text; return node }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)) }
function swapFeatureCollection(layer: MapGeoJSONLayer): GeoJSON.FeatureCollection { return { type: "FeatureCollection", features: layer.data.features.map((feature) => ({ ...feature, geometry: swapGeometry(feature.geometry) })) } as GeoJSON.FeatureCollection }
function swapGeometry(geometry: MapFeature["geometry"]): GeoJSON.Geometry { const swap = (value: unknown): unknown => Array.isArray(value) && value.length === 2 && typeof value[0] === "number" ? [value[0], value[1]] : Array.isArray(value) ? value.map(swap) : value; return { type: geometry.type, coordinates: swap(geometry.coordinates) } as GeoJSON.Geometry }
void (undefined as unknown as MapOptions)
