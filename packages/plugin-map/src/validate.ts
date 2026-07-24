import { MapDocumentError, MapLimitError } from "./errors"
import { DEFAULT_MAP_LIMITS } from "./limits"
import type { MapDocument, MapGeometry, MapLimits, MapScalar, Position } from "./types"

const SAFE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"])
const VARIANTS = new Set(["default", "accent", "muted", "positive", "warning", "critical"])
const DOCUMENT_KEYS = set("version", "ariaLabel", "view", "layers")
const VIEW_KEYS = set("center", "zoom")
const LAYER_KEYS: Record<string, Set<string>> = {
  geojson: set("id", "type", "data", "labelProperty", "tooltipProperties", "variant"),
  markers: set("id", "type", "items"),
  route: set("id", "type", "coordinates", "label", "description", "variant"),
}
const FEATURE_COLLECTION_KEYS = set("type", "features")
const FEATURE_KEYS = set("type", "id", "properties", "geometry")
const GEOMETRY_KEYS = set("type", "coordinates")
const MARKER_KEYS = set("id", "position", "label", "description", "variant")

interface Context {
  limits: MapLimits
  issues: string[]
  ids: Set<string>
  features: number
  markers: number
  positions: number
  strings: number
}

export function parseMapDocument(source: string): MapDocument {
  if (typeof source !== "string") throw new MapDocumentError(["Map source must be a string."])
  if (new TextEncoder().encode(source).byteLength > DEFAULT_MAP_LIMITS.sourceBytes) throw new MapLimitError("Map source exceeds 256 KiB.")
  let value: unknown
  try { value = JSON.parse(source) } catch { throw new MapDocumentError(["Map source must be valid JSON."]) }
  return validateMapDocument(value)
}

export function validateMapDocument(value: unknown): MapDocument {
  assertSafeGraph(value)
  const issues: string[] = []
  if (!isPlainObject(value)) throw new MapDocumentError(["Map document must be a plain object."])
  rejectKeys(value, DOCUMENT_KEYS, "$", issues)
  if (value.version !== 1) issues.push("$.version must be 1.")
  const ctx: Context = { limits: DEFAULT_MAP_LIMITS, issues, ids: new Set(), features: 0, markers: 0, positions: 0, strings: 0 }
  optionalString(value.ariaLabel, "$.ariaLabel", ctx)
  validateView(value.view, ctx)
  if (!Array.isArray(value.layers)) issues.push("$.layers must be an array.")
  else {
    if (value.layers.length > ctx.limits.layers) throw new MapLimitError(`Map exceeds ${ctx.limits.layers} layers.`)
    value.layers.forEach((layer, index) => validateLayer(layer, `$.layers[${index}]`, ctx))
  }
  if (issues.length) throw new MapDocumentError(issues)
  return value as unknown as MapDocument
}

function validateView(value: unknown, ctx: Context): void {
  if (value === undefined) return
  if (!isPlainObject(value)) { ctx.issues.push("$.view must be a plain object."); return }
  rejectKeys(value, VIEW_KEYS, "$.view", ctx.issues)
  position(value.center, "$.view.center", ctx)
  if (!Number.isInteger(value.zoom) || (value.zoom as number) < 0 || (value.zoom as number) > 22) ctx.issues.push("$.view.zoom must be an integer from 0 to 22.")
}

function validateLayer(value: unknown, path: string, ctx: Context): void {
  if (!isPlainObject(value)) { ctx.issues.push(`${path} must be a plain object.`); return }
  const type = typeof value.type === "string" ? value.type : ""
  const keys = LAYER_KEYS[type]
  if (!keys) { ctx.issues.push(`${path}.type is unsupported.`); return }
  rejectKeys(value, keys, path, ctx.issues)
  id(value.id, `${path}.id`, ctx)
  if (type === "geojson") validateGeoJSONLayer(value, path, ctx)
  else if (type === "markers") validateMarkersLayer(value, path, ctx)
  else validateRouteLayer(value, path, ctx)
}

function validateGeoJSONLayer(value: Record<string, unknown>, path: string, ctx: Context): void {
  variant(value.variant, `${path}.variant`, ctx)
  const labelProperty = optionalString(value.labelProperty, `${path}.labelProperty`, ctx)
  if (labelProperty !== undefined && DANGEROUS_KEYS.has(labelProperty)) ctx.issues.push(`${path}.labelProperty is dangerous.`)
  if (value.tooltipProperties !== undefined) {
    if (!Array.isArray(value.tooltipProperties) || value.tooltipProperties.length > ctx.limits.tooltipProperties) ctx.issues.push(`${path}.tooltipProperties must contain at most ${ctx.limits.tooltipProperties} strings.`)
    else {
      const seen = new Set<string>()
      value.tooltipProperties.forEach((item, index) => { const key = requiredString(item, `${path}.tooltipProperties[${index}]`, ctx); if (key && (DANGEROUS_KEYS.has(key) || seen.has(key))) ctx.issues.push(`${path}.tooltipProperties[${index}] must be safe and unique.`); if (key) seen.add(key) })
    }
  }
  const data = value.data
  if (!isPlainObject(data)) { ctx.issues.push(`${path}.data must be a FeatureCollection.`); return }
  rejectKeys(data, FEATURE_COLLECTION_KEYS, `${path}.data`, ctx.issues)
  if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) { ctx.issues.push(`${path}.data must be an exact FeatureCollection.`); return }
  if (ctx.features + data.features.length > ctx.limits.features) throw new MapLimitError(`Map exceeds ${ctx.limits.features} features.`)
  ctx.features += data.features.length
  data.features.forEach((feature, index) => validateFeature(feature, `${path}.data.features[${index}]`, ctx))
}

function validateFeature(value: unknown, path: string, ctx: Context): void {
  if (!isPlainObject(value)) { ctx.issues.push(`${path} must be a plain object.`); return }
  rejectKeys(value, FEATURE_KEYS, path, ctx.issues)
  if (value.type !== "Feature") ctx.issues.push(`${path}.type must be Feature.`)
  if (typeof value.id === "string") id(value.id, `${path}.id`, ctx)
  else if (typeof value.id === "number" && Number.isFinite(value.id)) {
    const key = `#${value.id}`
    if (ctx.ids.has(key)) ctx.issues.push(`${path}.id must be unique.`)
    ctx.ids.add(key)
  } else if (value.id !== undefined) ctx.issues.push(`${path}.id must be a safe string or finite number.`)
  if (value.properties !== undefined) validateProperties(value.properties, `${path}.properties`, ctx)
  validateGeometry(value.geometry, `${path}.geometry`, 1, ctx)
}

function validateProperties(value: unknown, path: string, ctx: Context): void {
  if (!isPlainObject(value)) { ctx.issues.push(`${path} must be a plain object.`); return }
  const entries = Object.entries(value)
  if (entries.length > ctx.limits.properties) ctx.issues.push(`${path} exceeds ${ctx.limits.properties} properties.`)
  for (const [key, item] of entries) {
    if (DANGEROUS_KEYS.has(key) || key.length > ctx.limits.string) ctx.issues.push(`${path}.${key} is not a safe property.`)
    countString(key, path, ctx)
    if (!isScalar(item)) ctx.issues.push(`${path}.${key} must be a scalar.`)
    else if (typeof item === "string") countString(item, `${path}.${key}`, ctx)
  }
}

function validateGeometry(value: unknown, path: string, depth: number, ctx: Context): void {
  if (depth > ctx.limits.geometryDepth) { ctx.issues.push(`${path} exceeds geometry depth.`); return }
  if (!isPlainObject(value)) { ctx.issues.push(`${path} must be a supported geometry.`); return }
  rejectKeys(value, GEOMETRY_KEYS, path, ctx.issues)
  const geometry = value as unknown as MapGeometry
  switch (geometry.type) {
    case "Point": position(geometry.coordinates, `${path}.coordinates`, ctx); break
    case "MultiPoint": positions(geometry.coordinates, `${path}.coordinates`, 0, ctx); break
    case "LineString": positions(geometry.coordinates, `${path}.coordinates`, 2, ctx); break
    case "MultiLineString": nestedLines(geometry.coordinates, `${path}.coordinates`, ctx); break
    case "Polygon": polygon(geometry.coordinates, `${path}.coordinates`, ctx); break
    case "MultiPolygon": {
      if (!Array.isArray(geometry.coordinates)) ctx.issues.push(`${path}.coordinates must be an array.`)
      else geometry.coordinates.forEach((item, index) => polygon(item, `${path}.coordinates[${index}]`, ctx))
      break
    }
    default: ctx.issues.push(`${path}.type is unsupported.`)
  }
}

function validateMarkersLayer(value: Record<string, unknown>, path: string, ctx: Context): void {
  if (!Array.isArray(value.items)) { ctx.issues.push(`${path}.items must be an array.`); return }
  if (ctx.markers + value.items.length > ctx.limits.markers) throw new MapLimitError(`Map exceeds ${ctx.limits.markers} markers.`)
  ctx.markers += value.items.length
  value.items.forEach((item, index) => {
    const itemPath = `${path}.items[${index}]`
    if (!isPlainObject(item)) { ctx.issues.push(`${itemPath} must be a plain object.`); return }
    rejectKeys(item, MARKER_KEYS, itemPath, ctx.issues)
    id(item.id, `${itemPath}.id`, ctx)
    position(item.position, `${itemPath}.position`, ctx)
    requiredString(item.label, `${itemPath}.label`, ctx)
    optionalString(item.description, `${itemPath}.description`, ctx)
    variant(item.variant, `${itemPath}.variant`, ctx)
  })
}

function validateRouteLayer(value: Record<string, unknown>, path: string, ctx: Context): void {
  if (Array.isArray(value.coordinates) && value.coordinates.length > ctx.limits.routePositions) throw new MapLimitError(`Route exceeds ${ctx.limits.routePositions} positions.`)
  positions(value.coordinates, `${path}.coordinates`, 2, ctx)
  optionalString(value.label, `${path}.label`, ctx)
  optionalString(value.description, `${path}.description`, ctx)
  variant(value.variant, `${path}.variant`, ctx)
}

function polygon(value: unknown, path: string, ctx: Context): void {
  if (!Array.isArray(value) || value.length === 0) { ctx.issues.push(`${path} must contain polygon rings.`); return }
  value.forEach((ring, index) => {
    positions(ring, `${path}[${index}]`, 4, ctx)
    if (Array.isArray(ring) && ring.length >= 2 && (!samePosition(ring[0], ring[ring.length - 1]))) ctx.issues.push(`${path}[${index}] must be closed.`)
  })
}
function nestedLines(value: unknown, path: string, ctx: Context): void { if (!Array.isArray(value)) ctx.issues.push(`${path} must be an array.`); else value.forEach((line, index) => positions(line, `${path}[${index}]`, 2, ctx)) }
function positions(value: unknown, path: string, min: number, ctx: Context): void { if (!Array.isArray(value) || value.length < min) { ctx.issues.push(`${path} must contain at least ${min} positions.`); return } value.forEach((item, index) => position(item, `${path}[${index}]`, ctx)) }
function position(value: unknown, path: string, ctx: Context): value is Position {
  if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== "number" || typeof value[1] !== "number" || !Number.isFinite(value[0]) || !Number.isFinite(value[1])) { ctx.issues.push(`${path} must be [longitude, latitude].`); return false }
  if (value[0] < -180 || value[0] > 180) ctx.issues.push(`${path}[0] must be from -180 to 180.`)
  if (value[1] < -85.05112878 || value[1] > 85.05112878) ctx.issues.push(`${path}[1] must be within Web Mercator latitude bounds.`)
  if (++ctx.positions > ctx.limits.coordinatePositions) throw new MapLimitError(`Map exceeds ${ctx.limits.coordinatePositions} coordinate positions.`)
  return true
}
function id(value: unknown, path: string, ctx: Context): void { const text = requiredString(value, path, ctx, ctx.limits.id); if (!text) return; if (!SAFE_ID.test(text)) ctx.issues.push(`${path} is not a safe id.`); if (ctx.ids.has(text)) ctx.issues.push(`${path} must be unique.`); ctx.ids.add(text) }
function variant(value: unknown, path: string, ctx: Context): void { if (value !== undefined && !VARIANTS.has(value as string)) ctx.issues.push(`${path} is invalid.`) }
function optionalString(value: unknown, path: string, ctx: Context): string | undefined { if (value === undefined) return undefined; return requiredString(value, path, ctx) }
function requiredString(value: unknown, path: string, ctx: Context, max = ctx.limits.string): string | undefined { if (typeof value !== "string" || value.trim() === "" || value.length > max) { ctx.issues.push(`${path} must be a non-empty bounded string.`); return undefined } countString(value, path, ctx); return value }
function countString(value: string, path: string, ctx: Context): void { if (value.length > ctx.limits.string && !path.endsWith(".id")) ctx.issues.push(`${path} exceeds string limit.`); ctx.strings += value.length; if (ctx.strings > ctx.limits.totalStrings) throw new MapLimitError(`Map exceeds ${ctx.limits.totalStrings} total string characters.`) }
function rejectKeys(value: Record<string, unknown>, allowed: Set<string>, path: string, issues: string[]): void { for (const key of Object.keys(value)) if (DANGEROUS_KEYS.has(key) || !allowed.has(key)) issues.push(`${path}.${key} is not allowed.`) }
function samePosition(a: unknown, b: unknown): boolean { return Array.isArray(a) && Array.isArray(b) && a.length === 2 && b.length === 2 && a[0] === b[0] && a[1] === b[1] }
function isScalar(value: unknown): value is MapScalar { return value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) }
function isPlainObject(value: unknown): value is Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) return false; const prototype = Object.getPrototypeOf(value); return prototype === Object.prototype || prototype === null }
function set(...values: string[]): Set<string> { return new Set(values) }

function assertSafeGraph(value: unknown): void {
  const active = new Set<object>(), visited = new Set<object>()
  const walk = (current: unknown): void => {
    if (typeof current === "number" && !Number.isFinite(current)) throw new MapDocumentError(["Map values must be finite."])
    if (typeof current !== "object" || current === null) return
    if (active.has(current)) throw new MapDocumentError(["Map values must not contain cycles."])
    if (visited.has(current)) return
    if (!Array.isArray(current) && !isPlainObject(current)) throw new MapDocumentError(["Map values must use plain objects."])
    if (Array.isArray(current)) for (let i = 0; i < current.length; i++) if (!Object.hasOwn(current, i)) throw new MapDocumentError(["Map arrays must not be sparse."])
    active.add(current); visited.add(current)
    for (const key of Object.keys(current)) {
      if (DANGEROUS_KEYS.has(key)) throw new MapDocumentError([`Dangerous key "${key}" is not allowed.`])
      const descriptor = Object.getOwnPropertyDescriptor(current, key)
      if (!descriptor || descriptor.get || descriptor.set) throw new MapDocumentError(["Map values must not contain accessors."])
      walk(descriptor.value)
    }
    active.delete(current)
  }
  walk(value)
}
