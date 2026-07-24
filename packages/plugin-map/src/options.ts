import type { MapBasemapOptions, MapOptions, ResolvedMapOptions } from "./types"

const OPTION_KEYS = set("height", "minZoom", "maxZoom", "maxFitZoom", "dragging", "touchZoom", "doubleClickZoom", "scrollWheelZoom", "keyboard", "controls", "basemap", "networkPolicy")
const CONTROL_KEYS = set("zoom", "reset", "fit")
const BASEMAP_KEYS = set("tileUrlTemplate", "attribution", "minZoom", "maxZoom", "maxNativeZoom", "tileSize")
const ATTRIBUTION_KEYS = set("text", "url")
const POLICY_KEYS = set("allowedTileOrigins")

export function resolveMapOptions(options: MapOptions = {}): ResolvedMapOptions {
  assertSafeOptions(options)
  plain(options, "map options"); exact(options, OPTION_KEYS, "map options")
  const height = integer(options.height, 240, 720, 360, "height")
  const minZoom = integer(options.minZoom, 0, 22, 0, "minZoom")
  const maxZoom = integer(options.maxZoom, 0, 22, 22, "maxZoom")
  if (minZoom > maxZoom) fail("minZoom cannot exceed maxZoom.")
  const maxFitZoom = integer(options.maxFitZoom, minZoom, maxZoom, maxZoom, "maxFitZoom")
  const controls = options.controls ?? {}
  plain(controls, "controls"); exact(controls, CONTROL_KEYS, "controls")
  const basemap = options.basemap ?? false
  let validatedBasemap: false | MapBasemapOptions = false
  if (basemap !== false) {
    plain(basemap, "basemap"); exact(basemap, BASEMAP_KEYS, "basemap")
    plain(basemap.attribution, "basemap.attribution"); exact(basemap.attribution, ATTRIBUTION_KEYS, "basemap.attribution")
    boundedText(basemap.attribution.text, "basemap.attribution.text")
    if (basemap.attribution.url !== undefined) safeUrl(basemap.attribution.url, "basemap.attribution.url", false)
    const tileURL = safeUrl(basemap.tileUrlTemplate, "basemap.tileUrlTemplate", true)
    const tileMin = integer(basemap.minZoom, 0, 22, minZoom, "basemap.minZoom")
    const tileMax = integer(basemap.maxZoom, 0, 22, maxZoom, "basemap.maxZoom")
    if (tileMin > tileMax || tileMin < minZoom || tileMax > maxZoom) fail("Basemap zoom range must fit map zoom range.")
    const maxNativeZoom = integer(basemap.maxNativeZoom, tileMin, tileMax, tileMax, "basemap.maxNativeZoom")
    const tileSize = integer(basemap.tileSize, 128, 512, 256, "basemap.tileSize")
    if (!options.networkPolicy) fail("networkPolicy.allowedTileOrigins is required for a basemap.")
    plain(options.networkPolicy, "networkPolicy"); exact(options.networkPolicy, POLICY_KEYS, "networkPolicy")
    if (!Array.isArray(options.networkPolicy.allowedTileOrigins) || options.networkPolicy.allowedTileOrigins.length === 0) fail("allowedTileOrigins must be a non-empty array.")
    const origins = options.networkPolicy.allowedTileOrigins.map((origin) => normalizedOrigin(origin))
    if (!origins.includes(tileURL.origin)) fail("Tile URL origin is not allowed by networkPolicy.")
    validatedBasemap = {
      tileUrlTemplate: basemap.tileUrlTemplate as string,
      attribution: basemap.attribution as unknown as MapBasemapOptions["attribution"],
      minZoom: tileMin, maxZoom: tileMax, maxNativeZoom, tileSize,
    }
  } else if (options.networkPolicy !== undefined) {
    plain(options.networkPolicy, "networkPolicy"); exact(options.networkPolicy, POLICY_KEYS, "networkPolicy")
    if (!Array.isArray(options.networkPolicy.allowedTileOrigins)) fail("allowedTileOrigins must be an array.")
    options.networkPolicy.allowedTileOrigins.forEach(normalizedOrigin)
  }
  return {
    height, minZoom, maxZoom, maxFitZoom,
    dragging: bool(options.dragging, true, "dragging"), touchZoom: bool(options.touchZoom, true, "touchZoom"),
    doubleClickZoom: bool(options.doubleClickZoom, true, "doubleClickZoom"), scrollWheelZoom: bool(options.scrollWheelZoom, false, "scrollWheelZoom"),
    keyboard: bool(options.keyboard, true, "keyboard"),
    controls: { zoom: bool(controls.zoom, true, "controls.zoom"), reset: bool(controls.reset, true, "controls.reset"), fit: bool(controls.fit, true, "controls.fit") },
    basemap: validatedBasemap,
    networkPolicy: options.networkPolicy as MapOptions["networkPolicy"],
  }
}

function safeUrl(value: unknown, name: string, template: boolean): URL {
  if (typeof value !== "string" || value.length > 2048) fail(`${name} must be a bounded URL string.`)
  let parsed: URL
  try { parsed = new URL(value) } catch { fail(`${name} must be an absolute URL.`) }
  if ((parsed!.protocol !== "https:" && parsed!.protocol !== "http:") || parsed!.username || parsed!.password || parsed!.hash) fail(`${name} must be a safe HTTP(S) URL.`)
  const placeholders = [...value.matchAll(/\{([^}]+)\}/g)]
  if (value.replace(/\{[^}]+\}/g, "").includes("{") || value.replace(/\{[^}]+\}/g, "").includes("}")) fail(`${name} contains malformed placeholders.`)
  const authorityEnd = value.indexOf("/", value.indexOf("//") + 2)
  for (const match of placeholders) if (!["z", "x", "y", "r"].includes(match[1]) || (match.index ?? 0) < authorityEnd) fail(`${name} contains an unsupported placeholder.`)
  if (template && !["z", "x", "y"].every((key) => placeholders.some((match) => match[1] === key))) fail(`${name} must contain z, x, and y placeholders.`)
  if (!template && placeholders.length) fail(`${name} cannot contain placeholders.`)
  return parsed!
}
function normalizedOrigin(value: unknown): string {
  if (typeof value !== "string") fail("Allowed tile origins must be strings.")
  let url: URL
  try { url = new URL(value) } catch { fail("Allowed tile origins must be absolute origins.") }
  if (!['http:', 'https:'].includes(url!.protocol) || url!.username || url!.password || url!.hash || url!.pathname !== "/" || url!.search || value !== url!.origin) fail("Allowed tile origins must be exact normalized HTTP(S) origins.")
  return url!.origin
}
function integer(value: unknown, min: number, max: number, fallback: number, name: string): number { if (value === undefined) return fallback; if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) fail(`${name} must be an integer from ${min} to ${max}.`); return value as number }
function bool(value: unknown, fallback: boolean, name: string): boolean { if (value === undefined) return fallback; if (typeof value !== "boolean") fail(`${name} must be boolean.`); return value }
function boundedText(value: unknown, name: string): void { if (typeof value !== "string" || value.trim() === "" || value.length > 512) fail(`${name} must be a non-empty bounded string.`) }
function plain(value: unknown, name: string): asserts value is Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(`${name} must be a plain object.`) }
function exact(value: object, allowed: Set<string>, name: string): void { for (const key of Object.keys(value)) if (!allowed.has(key) || ["__proto__", "prototype", "constructor"].includes(key)) fail(`${name}.${key} is not allowed.`) }
function set(...keys: string[]): Set<string> { return new Set(keys) }
function fail(message: string): never { throw new TypeError(message) }

function assertSafeOptions(value: unknown): void {
  const active = new Set<object>(), visited = new Set<object>()
  const walk = (current: unknown): void => {
    if (typeof current === "number" && !Number.isFinite(current)) fail("Map options must contain finite numbers.")
    if (typeof current !== "object" || current === null) return
    if (active.has(current)) fail("Map options must not contain cycles.")
    if (visited.has(current)) return
    if (!Array.isArray(current) && Object.getPrototypeOf(current) !== Object.prototype) fail("Map options must use plain objects.")
    if (Array.isArray(current)) for (let index = 0; index < current.length; index++) if (!Object.hasOwn(current, index)) fail("Map option arrays must not be sparse.")
    active.add(current); visited.add(current)
    for (const key of Object.keys(current)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) fail(`Dangerous option key "${key}" is not allowed.`)
      const descriptor = Object.getOwnPropertyDescriptor(current, key)
      if (!descriptor || descriptor.get || descriptor.set) fail("Map options must not contain accessors.")
      walk(descriptor.value)
    }
    active.delete(current)
  }
  walk(value)
}
