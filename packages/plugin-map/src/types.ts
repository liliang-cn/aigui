export type MapVariant = "default" | "accent" | "muted" | "positive" | "warning" | "critical"
export type Position = [longitude: number, latitude: number]
export type MapScalar = string | number | boolean | null

export interface PointGeometry { type: "Point"; coordinates: Position }
export interface MultiPointGeometry { type: "MultiPoint"; coordinates: Position[] }
export interface LineStringGeometry { type: "LineString"; coordinates: Position[] }
export interface MultiLineStringGeometry { type: "MultiLineString"; coordinates: Position[][] }
export interface PolygonGeometry { type: "Polygon"; coordinates: Position[][] }
export interface MultiPolygonGeometry { type: "MultiPolygon"; coordinates: Position[][][] }
export type MapGeometry = PointGeometry | MultiPointGeometry | LineStringGeometry | MultiLineStringGeometry | PolygonGeometry | MultiPolygonGeometry

export interface MapFeature {
  type: "Feature"
  id?: string | number
  properties?: Record<string, MapScalar>
  geometry: MapGeometry
}
export interface MapFeatureCollection { type: "FeatureCollection"; features: MapFeature[] }

export interface MapGeoJSONLayer {
  id: string
  type: "geojson"
  data: MapFeatureCollection
  labelProperty?: string
  tooltipProperties?: string[]
  variant?: MapVariant
}
export interface MapMarker { id: string; position: Position; label: string; description?: string; variant?: MapVariant }
export interface MapMarkersLayer { id: string; type: "markers"; items: MapMarker[] }
export interface MapRouteLayer { id: string; type: "route"; coordinates: Position[]; label?: string; description?: string; variant?: MapVariant }
export type MapLayer = MapGeoJSONLayer | MapMarkersLayer | MapRouteLayer

export interface MapDocument {
  version: 1
  ariaLabel?: string
  view?: { center: Position; zoom: number }
  layers: MapLayer[]
}

export interface MapLimits {
  sourceBytes: number
  layers: number
  features: number
  markers: number
  coordinatePositions: number
  routePositions: number
  geometryDepth: number
  properties: number
  tooltipProperties: number
  string: number
  totalStrings: number
  id: number
}

export interface MapControlsOptions { zoom?: boolean; reset?: boolean; fit?: boolean }
export interface MapAttribution { text: string; url?: string }
export interface MapBasemapOptions {
  tileUrlTemplate: string
  attribution: MapAttribution
  minZoom?: number
  maxZoom?: number
  maxNativeZoom?: number
  tileSize?: number
}
export interface MapNetworkPolicy { allowedTileOrigins: string[] }
export interface MapOptions {
  height?: number
  minZoom?: number
  maxZoom?: number
  maxFitZoom?: number
  dragging?: boolean
  touchZoom?: boolean
  doubleClickZoom?: boolean
  scrollWheelZoom?: boolean
  keyboard?: boolean
  controls?: MapControlsOptions
  basemap?: false | MapBasemapOptions
  networkPolicy?: MapNetworkPolicy
}

export interface ResolvedMapOptions {
  height: number
  minZoom: number
  maxZoom: number
  maxFitZoom: number
  dragging: boolean
  touchZoom: boolean
  doubleClickZoom: boolean
  scrollWheelZoom: boolean
  keyboard: boolean
  controls: Required<MapControlsOptions>
  basemap: false | MapBasemapOptions
  networkPolicy?: MapNetworkPolicy
}
