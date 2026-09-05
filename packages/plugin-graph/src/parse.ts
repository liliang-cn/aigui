import type { ClassDef, EntityDef, GraphDefinition, GraphLayer, GraphResult, GraphView, PropertyDef, RelationDef } from "./types"

/**
 * Strict on shape, lenient on references.
 *
 * Every key is checked against a whitelist and every string against a length, because a model
 * that invents a field has usually misremembered the protocol and the error names the field it
 * meant. But a class or property that is *named* without being *declared* is added rather than
 * refused: an entity of type "Person" in a block with no `classes` is a perfectly good graph, and
 * a streaming model that declared four classes and used five has not written nonsense.
 */

const TOP_FIELDS = new Set(["classes", "properties", "entities", "relations", "view", "layer", "focus", "caption", "rotate"])
const CLASS_FIELDS = new Set(["id", "name", "subClassOf", "color", "description"])
const PROPERTY_FIELDS = new Set(["id", "name", "domain", "range", "color", "description"])
const ENTITY_FIELDS = new Set(["id", "name", "type", "value", "attrs", "description"])
const RELATION_FIELDS = new Set(["from", "to", "type", "name"])
const VIEWS = new Set<GraphView>(["2d", "3d"])
const LAYERS = new Set<GraphLayer>(["instances", "ontology"])
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export const ID_LENGTH = 64
export const NAME_LENGTH = 80
export const DESCRIPTION_LENGTH = 400
export const ATTR_LENGTH = 200
export const ATTR_COUNT = 32

const bad = (message: string): GraphResult<never> => ({ ok: false, error: { code: "invalid-definition", message } })
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)

function unknownField(raw: Record<string, unknown>, allowed: Set<string>, at: string): GraphResult<never> | undefined {
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) return bad(`${at}${at ? "." : ""}${key} is not a field of ${at ? describe(at) : "a graph definition"}`)
  }
  return undefined
}

function describe(at: string): string {
  if (at.startsWith("classes")) return "a class"
  if (at.startsWith("properties")) return "a property"
  if (at.startsWith("entities")) return "an entity"
  return "a relation"
}

/** A short id, or an error naming the place. */
function readId(raw: Record<string, unknown>, at: string, seen: Set<string>): GraphResult<string> {
  const id = raw.id
  if (typeof id !== "string" || id.trim() === "" || id.length > ID_LENGTH) return bad(`${at}.id must be a short name`)
  if (seen.has(id)) return bad(`${at}.id ${id} is used twice`)
  return { ok: true, value: id }
}

function readText(raw: Record<string, unknown>, key: string, at: string, max: number): GraphResult<string | undefined> {
  const value = raw[key]
  if (value === undefined) return { ok: true, value: undefined }
  if (typeof value !== "string" || value.length > max) return bad(`${at}.${key} must be a string of at most ${max} characters`)
  return { ok: true, value }
}

function readRef(raw: Record<string, unknown>, key: string, at: string): GraphResult<string | undefined> {
  const value = raw[key]
  if (value === undefined) return { ok: true, value: undefined }
  if (typeof value !== "string" || value.trim() === "" || value.length > ID_LENGTH) return bad(`${at}.${key} must name a ${key === "type" ? "class or property" : "class"}`)
  return { ok: true, value }
}

function readColour(raw: Record<string, unknown>, at: string): GraphResult<string | undefined> {
  const value = raw.color
  if (value === undefined) return { ok: true, value: undefined }
  if (typeof value !== "string" || !HEX.test(value)) return bad(`${at}.color must be a hex colour`)
  return { ok: true, value: value.toLowerCase() }
}

function parseClass(raw: unknown, index: number, seen: Set<string>): GraphResult<ClassDef> {
  const at = `classes[${index}]`
  if (!isRecord(raw)) return bad(`${at} must be an object`)
  const unknown = unknownField(raw, CLASS_FIELDS, at)
  if (unknown) return unknown
  const id = readId(raw, at, seen)
  if (!id.ok) return id
  const name = readText(raw, "name", at, NAME_LENGTH)
  if (!name.ok) return name
  const parent = readRef(raw, "subClassOf", at)
  if (!parent.ok) return parent
  const colour = readColour(raw, at)
  if (!colour.ok) return colour
  const description = readText(raw, "description", at, DESCRIPTION_LENGTH)
  if (!description.ok) return description
  const cls: ClassDef = { id: id.value, name: name.value ?? id.value }
  if (parent.value !== undefined) cls.subClassOf = parent.value
  if (colour.value !== undefined) cls.color = colour.value
  if (description.value !== undefined) cls.description = description.value
  return { ok: true, value: cls }
}

function parseProperty(raw: unknown, index: number, seen: Set<string>): GraphResult<PropertyDef> {
  const at = `properties[${index}]`
  if (!isRecord(raw)) return bad(`${at} must be an object`)
  const unknown = unknownField(raw, PROPERTY_FIELDS, at)
  if (unknown) return unknown
  const id = readId(raw, at, seen)
  if (!id.ok) return id
  const name = readText(raw, "name", at, NAME_LENGTH)
  if (!name.ok) return name
  const domain = readRef(raw, "domain", at)
  if (!domain.ok) return domain
  const range = readRef(raw, "range", at)
  if (!range.ok) return range
  const colour = readColour(raw, at)
  if (!colour.ok) return colour
  const description = readText(raw, "description", at, DESCRIPTION_LENGTH)
  if (!description.ok) return description
  const property: PropertyDef = { id: id.value, name: name.value ?? id.value }
  if (domain.value !== undefined) property.domain = domain.value
  if (range.value !== undefined) property.range = range.value
  if (colour.value !== undefined) property.color = colour.value
  if (description.value !== undefined) property.description = description.value
  return { ok: true, value: property }
}

function parseAttrs(raw: unknown, at: string): GraphResult<Record<string, string | number | boolean> | undefined> {
  if (raw === undefined) return { ok: true, value: undefined }
  if (!isRecord(raw)) return bad(`${at}.attrs must be an object of strings, numbers and booleans`)
  const keys = Object.keys(raw)
  if (keys.length > ATTR_COUNT) return bad(`${at}.attrs has more than ${ATTR_COUNT} entries`)
  const attrs: Record<string, string | number | boolean> = {}
  for (const key of keys) {
    const value = raw[key]
    if (key.length > NAME_LENGTH) return bad(`${at}.attrs has a key longer than ${NAME_LENGTH} characters`)
    if (typeof value === "boolean" || finite(value)) attrs[key] = value
    else if (typeof value === "string" && value.length <= ATTR_LENGTH) attrs[key] = value
    else return bad(`${at}.attrs.${key} must be a string of at most ${ATTR_LENGTH} characters, a number or a boolean`)
  }
  return { ok: true, value: attrs }
}

function parseEntity(raw: unknown, index: number, seen: Set<string>): GraphResult<EntityDef> {
  const at = `entities[${index}]`
  if (!isRecord(raw)) return bad(`${at} must be an object`)
  const unknown = unknownField(raw, ENTITY_FIELDS, at)
  if (unknown) return unknown
  const id = readId(raw, at, seen)
  if (!id.ok) return id
  const name = readText(raw, "name", at, NAME_LENGTH)
  if (!name.ok) return name
  const type = readRef(raw, "type", at)
  if (!type.ok) return type
  const attrs = parseAttrs(raw.attrs, at)
  if (!attrs.ok) return attrs
  const description = readText(raw, "description", at, DESCRIPTION_LENGTH)
  if (!description.ok) return description
  const entity: EntityDef = { id: id.value, name: name.value ?? id.value }
  if (type.value !== undefined) entity.type = type.value
  if (raw.value !== undefined) {
    if (!finite(raw.value) || raw.value < 0) return bad(`${at}.value must be zero or a positive number`)
    entity.value = raw.value
  }
  if (attrs.value !== undefined) entity.attrs = attrs.value
  if (description.value !== undefined) entity.description = description.value
  return { ok: true, value: entity }
}

function parseRelation(raw: unknown, index: number, entities: Set<string>): GraphResult<RelationDef> {
  const at = `relations[${index}]`
  if (!isRecord(raw)) return bad(`${at} must be an object`)
  const unknown = unknownField(raw, RELATION_FIELDS, at)
  if (unknown) return unknown
  for (const end of ["from", "to"] as const) {
    const value = raw[end]
    if (typeof value !== "string") return bad(`${at}.${end} must be an entity id`)
    // An edge to nothing cannot be drawn, so this one reference is not forgiven.
    if (!entities.has(value)) return bad(`${at}.${end} refers to ${value}, which is not an entity`)
  }
  const type = readRef(raw, "type", at)
  if (!type.ok) return type
  const name = readText(raw, "name", at, NAME_LENGTH)
  if (!name.ok) return name
  const relation: RelationDef = { from: raw.from as string, to: raw.to as string }
  if (type.value !== undefined) relation.type = type.value
  if (name.value !== undefined) relation.name = name.value
  return { ok: true, value: relation }
}

function parseList<T>(raw: unknown, key: string, max: number, one: (entry: unknown, index: number) => GraphResult<T>): GraphResult<T[]> {
  if (raw === undefined) return { ok: true, value: [] }
  if (!Array.isArray(raw)) return bad(`${key} must be an array`)
  if (raw.length > max) return bad(`${key} has more than ${max} entries`)
  const out: T[] = []
  for (const [index, entry] of raw.entries()) {
    const parsed = one(entry, index)
    if (!parsed.ok) return parsed
    out.push(parsed.value)
  }
  return { ok: true, value: out }
}

/** Refuse a `subClassOf` chain that comes back to where it started; the hierarchy needs a forest. */
function findCycle(classes: readonly ClassDef[]): string | undefined {
  const parent = new Map(classes.map((cls) => [cls.id, cls.subClassOf]))
  for (const cls of classes) {
    const seen = new Set<string>([cls.id])
    let current = cls.subClassOf
    while (current !== undefined) {
      if (seen.has(current)) return current
      seen.add(current)
      current = parent.get(current)
    }
  }
  return undefined
}

export interface ParseLimits {
  maxEntities?: number
  maxRelations?: number
  maxClasses?: number
  maxProperties?: number
  maxSourceBytes?: number
}

/** Validate one `graph` fence, or explain why it cannot be drawn. */
export function parseGraph(source: string, options: ParseLimits = {}): GraphResult<GraphDefinition> {
  const maxSourceBytes = options.maxSourceBytes ?? 256 * 1024
  if (new TextEncoder().encode(source).byteLength > maxSourceBytes) {
    return { ok: false, error: { code: "too-large", message: "Graph definition is too large." } }
  }
  let raw: unknown
  try {
    raw = JSON.parse(source)
  } catch {
    return { ok: false, error: { code: "invalid-json", message: "Graph definition is not valid JSON." } }
  }
  if (!isRecord(raw)) return bad("A graph definition must be a JSON object")
  const unknown = unknownField(raw, TOP_FIELDS, "")
  if (unknown) return unknown

  const classIds = new Set<string>()
  const classes = parseList(raw.classes, "classes", options.maxClasses ?? 64, (entry, index) => {
    const parsed = parseClass(entry, index, classIds)
    if (parsed.ok) classIds.add(parsed.value.id)
    return parsed
  })
  if (!classes.ok) return classes
  const propertyIds = new Set<string>()
  const properties = parseList(raw.properties, "properties", options.maxProperties ?? 64, (entry, index) => {
    const parsed = parseProperty(entry, index, propertyIds)
    if (parsed.ok) propertyIds.add(parsed.value.id)
    return parsed
  })
  if (!properties.ok) return properties
  const entityIds = new Set<string>()
  const entities = parseList(raw.entities, "entities", options.maxEntities ?? 500, (entry, index) => {
    const parsed = parseEntity(entry, index, entityIds)
    if (parsed.ok) entityIds.add(parsed.value.id)
    return parsed
  })
  if (!entities.ok) return entities
  const relations = parseList(raw.relations, "relations", options.maxRelations ?? 2000, (entry, index) => parseRelation(entry, index, entityIds))
  if (!relations.ok) return relations

  if (classes.value.length === 0 && entities.value.length === 0) return bad("A graph needs classes or entities to draw")

  // Names without declarations become declarations, in the order they are first met: the classes
  // the schema itself points at, then the ones the data uses, then the properties.
  const declareClass = (id: string | undefined): void => {
    if (id === undefined || classIds.has(id)) return
    classIds.add(id)
    classes.value.push({ id, name: id, implicit: true })
  }
  for (const cls of [...classes.value]) declareClass(cls.subClassOf)
  for (const property of properties.value) {
    declareClass(property.domain)
    declareClass(property.range)
  }
  for (const entity of entities.value) declareClass(entity.type)
  for (const relation of relations.value) {
    if (relation.type === undefined || propertyIds.has(relation.type)) continue
    propertyIds.add(relation.type)
    properties.value.push({ id: relation.type, name: relation.type, implicit: true })
  }

  const cyclic = findCycle(classes.value)
  if (cyclic !== undefined) return bad(`subClassOf forms a cycle through ${cyclic}`)

  const definition: GraphDefinition = {
    classes: classes.value,
    properties: properties.value,
    entities: entities.value,
    relations: relations.value,
    view: "2d",
    layer: entities.value.length === 0 ? "ontology" : "instances",
    rotate: true,
  }
  if (raw.view !== undefined) {
    if (typeof raw.view !== "string" || !VIEWS.has(raw.view as GraphView)) return bad(`view must be one of ${[...VIEWS].join(", ")}`)
    definition.view = raw.view as GraphView
  }
  if (raw.layer !== undefined) {
    if (typeof raw.layer !== "string" || !LAYERS.has(raw.layer as GraphLayer)) return bad(`layer must be one of ${[...LAYERS].join(", ")}`)
    definition.layer = raw.layer as GraphLayer
  }
  if (raw.rotate !== undefined) {
    if (typeof raw.rotate !== "boolean") return bad("rotate must be true or false")
    definition.rotate = raw.rotate
  }
  if (raw.focus !== undefined) {
    if (typeof raw.focus !== "string") return bad("focus must be an entity or class id")
    // A focus on nothing is not worth refusing the graph for; it is simply not highlighted.
    if (entityIds.has(raw.focus) || classIds.has(raw.focus)) definition.focus = raw.focus
  }
  if (raw.caption !== undefined) {
    if (typeof raw.caption !== "string" || raw.caption.length > DESCRIPTION_LENGTH) return bad(`caption must be a string of at most ${DESCRIPTION_LENGTH} characters`)
    definition.caption = raw.caption
  }
  return { ok: true, value: definition }
}
