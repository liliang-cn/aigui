import type { MapLimits } from "./types"

export const DEFAULT_MAP_LIMITS: Readonly<MapLimits> = Object.freeze({
  sourceBytes: 256 * 1024,
  layers: 16,
  features: 500,
  markers: 500,
  coordinatePositions: 20_000,
  routePositions: 5_000,
  geometryDepth: 8,
  properties: 16,
  tooltipProperties: 8,
  string: 512,
  totalStrings: 64 * 1024,
  id: 128,
})
