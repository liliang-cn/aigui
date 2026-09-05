/**
 * A class in the ontology: a kind of thing an entity can be.
 *
 * `subClassOf` is RDFS's word and the model knows it. A class that was never declared but is
 * named by an entity's `type`, another class's `subClassOf`, or a property's `domain`/`range` is
 * added with `implicit: true` — a streaming model forgets declarations, and refusing the whole
 * graph for that is worse than a class with no description.
 */
export interface ClassDef {
  id: string
  name: string
  subClassOf?: string
  /** A hex colour; inherited by subclasses that give none. */
  color?: string
  description?: string
  implicit?: boolean
}

/**
 * A property in the ontology: a kind of relation, with the classes it may join.
 *
 * `domain` constrains the `from` end, `range` the `to` end. Either may be absent, in which case
 * that end is unconstrained. An implicit property (named by a relation but never declared) has
 * no constraints and can never be violated.
 */
export interface PropertyDef {
  id: string
  name: string
  domain?: string
  range?: string
  color?: string
  description?: string
  implicit?: boolean
}

export interface EntityDef {
  id: string
  name: string
  /** A class id. An entity without one is drawn in the muted colour. */
  type?: string
  /** Drawn size, when it is not the degree. Zero or positive. */
  value?: number
  /** Flat key–value facts shown in the tooltip. */
  attrs?: Record<string, string | number | boolean>
  description?: string
}

/** A directed, typed edge between two entities. `type` is a property id. */
export interface RelationDef {
  from: string
  to: string
  type?: string
  /** A label on this edge alone, when the property name is not it. */
  name?: string
}

export type GraphView = "2d" | "3d"
export type GraphLayer = "instances" | "ontology"

export interface GraphDefinition {
  classes: ClassDef[]
  properties: PropertyDef[]
  entities: EntityDef[]
  relations: RelationDef[]
  /** How it opens. Default "2d". */
  view: GraphView
  /** Which layer it opens on. Default "instances", or "ontology" when there are no entities. */
  layer: GraphLayer
  /** An entity or class id to highlight and always label. */
  focus?: string
  caption?: string
  /** Whether the 3D view turns on its own. Default true. */
  rotate: boolean
}

/** One relation that breaks its property's domain or range. */
export interface Violation {
  /** Index into `relations`. */
  relation: number
  side: "domain" | "range"
  /** The class the property asked for. */
  expected: string
  /** The class the entity has, or undefined when it has none. */
  actual?: string
}

export interface GraphOptions {
  /** Figure height in CSS pixels. Default 420. */
  height?: number
  /** Refuse a graph with more entities than this. Default 500. */
  maxEntities?: number
  /** Refuse a graph with more relations than this. Default 2000. */
  maxRelations?: number
  /** Refuse a graph with more classes than this. Default 64. */
  maxClasses?: number
  /** Refuse a graph with more properties than this. Default 64. */
  maxProperties?: number
  /** Refuse a fence larger than this, before parsing it. Default 256 KiB. */
  maxSourceBytes?: number
  /** `false` renders the 2D figure as static HTML with no hover, zoom or toggles. Default true. */
  interactive?: boolean
  /** `false` hides the 3D view and never loads three.js. Default true. */
  three?: boolean
  /** How many entities carry a written label; the rest are one hover away. Default 20. */
  labelBudget?: number
  /** Called when the reader clicks an entity. */
  onEntityClick?: (entity: EntityDef) => void
}

export interface GraphError {
  code: "invalid-json" | "invalid-definition" | "too-large"
  message: string
}

export type GraphResult<T> = { ok: true; value: T } | { ok: false; error: GraphError }
