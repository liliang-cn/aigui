import { hash } from "./layout"
import type { Palette } from "./palette"
import type { GraphDefinition, Violation } from "./types"

/**
 * What the ontology means, as pure functions over the definition.
 *
 * Only two RDFS ideas are honoured: `subClassOf` is transitive, and a property's `domain` and
 * `range` are satisfied by any subclass of the class they name. That is enough to catch the
 * mistake a model actually makes — an organisation "working at" a person, a city "eating" a dog —
 * without teaching it OWL.
 */

/** The `subClassOf` chain above a class, nearest first. Stops at a class that is not declared. */
export function ancestors(def: GraphDefinition, id: string): string[] {
  const parent = new Map(def.classes.map((cls) => [cls.id, cls.subClassOf]))
  const out: string[] = []
  let current = parent.get(id)
  // The parser has refused cycles, but a bound keeps a hand-built definition from spinning.
  while (current !== undefined && out.length <= def.classes.length) {
    out.push(current)
    current = parent.get(current)
  }
  return out
}

/** Whether `a` is `b` or below it. */
export function isSubClassOf(def: GraphDefinition, a: string, b: string): boolean {
  return a === b || ancestors(def, a).includes(b)
}

/**
 * The colour of a class: the first explicit `color` walking up the chain, else a hash of its id.
 *
 * Hashed rather than handed out in order of appearance so that two graphs on one page colour
 * `Person` the same way, whatever order the classes happen to appear in. A hash means two classes
 * can share a colour, which is what the legend is for.
 */
export function classColour(def: GraphDefinition, id: string | undefined, c: Palette): string {
  if (id === undefined) return c.muted
  const byId = new Map(def.classes.map((cls) => [cls.id, cls]))
  for (const step of [id, ...ancestors(def, id)]) {
    const colour = byId.get(step)?.color
    if (colour) return colour
  }
  return c.series[hash(id) % c.series.length]
}

/** The colour of a property: its own, or a hash of its id. An untyped relation is drawn plain. */
export function propertyColour(def: GraphDefinition, id: string | undefined, c: Palette): string {
  if (id === undefined) return c.edge
  const colour = def.properties.find((property) => property.id === id)?.color
  return colour ?? c.series[hash(`property:${id}`) % c.series.length]
}

/**
 * Every relation that breaks its property's domain or range.
 *
 * An entity with no type fails a constrained side — the property asked for a class and got
 * nothing — while a property with no constraint on a side, an implicit property, or a relation
 * with no type, cannot fail at all.
 */
export function checkRelations(def: GraphDefinition): Violation[] {
  const properties = new Map(def.properties.map((property) => [property.id, property]))
  const types = new Map(def.entities.map((entity) => [entity.id, entity.type]))
  const out: Violation[] = []
  for (const [index, relation] of def.relations.entries()) {
    if (relation.type === undefined) continue
    const property = properties.get(relation.type)
    if (!property) continue
    const check = (side: "domain" | "range", expected: string | undefined, entity: string): void => {
      if (expected === undefined) return
      const actual = types.get(entity)
      if (actual !== undefined && isSubClassOf(def, actual, expected)) return
      out.push({ relation: index, side, expected, actual })
    }
    check("domain", property.domain, relation.from)
    check("range", property.range, relation.to)
  }
  return out
}

/** A node as the layout and the renderers see it, whichever layer it came from. */
export interface LayoutNode {
  id: string
}

export interface LayoutLink {
  from: string
  to: string
  type: string | undefined
}

export interface LayerGraph {
  nodes: LayoutNode[]
  links: LayoutLink[]
}

/**
 * The ontology as a graph: classes are the nodes, `subClassOf` and every constrained property
 * are the edges. A property with only one of domain and range has nothing to join and is left
 * to the legend.
 */
export function ontologyGraph(def: GraphDefinition): LayerGraph {
  const links: LayoutLink[] = []
  for (const cls of def.classes) {
    if (cls.subClassOf !== undefined) links.push({ from: cls.id, to: cls.subClassOf, type: "subClassOf" })
  }
  for (const property of def.properties) {
    if (property.domain !== undefined && property.range !== undefined) links.push({ from: property.domain, to: property.range, type: property.id })
  }
  return { nodes: def.classes.map((cls) => ({ id: cls.id })), links }
}

/** The data as a graph: entities and relations, as written. */
export function instanceGraph(def: GraphDefinition): LayerGraph {
  return {
    nodes: def.entities.map((entity) => ({ id: entity.id })),
    links: def.relations.map((relation) => ({ from: relation.from, to: relation.to, type: relation.type })),
  }
}
