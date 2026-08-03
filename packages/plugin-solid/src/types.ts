/** A point in the figure's own space. y is up. */
export interface Vec3 {
  x: number
  y: number
  z: number
}

export type SolidKind = "cube" | "cuboid" | "prism" | "pyramid" | "cylinder" | "cone" | "sphere"

/** A point the model introduced, always defined against something already named. */
export type PointDef =
  /** On the segment joining two named points, `at` measured from the first. */
  | { id: string; on: string; at: number }
  /** The centre of a named face, e.g. `"ABCD"`. */
  | { id: string; center: string }
  /** The foot of the perpendicular from a point to a named face's plane. */
  | { id: string; foot: { from: string; to: string } }
  /** On the base or top circle of a cone or cylinder, at `angle` degrees. */
  | { id: string; onCircle: "base" | "top"; angle: number }

export interface SegmentDef {
  from: string
  to: string
  style?: "solid" | "dashed"
  note?: string
}

export type HighlightDef =
  | { line: [string, string] }
  | { plane: string[] }
  | { angle: { at: string; rays: [string, string] } }

export type ShowFlag = "labels" | "hiddenEdges" | "views"

/**
 * One figure, as the model writes it.
 *
 * Everything here is a *condition* — which solid, which points, which plane. What the section
 * actually looks like is computed from these, never stated: a model that reports "the section is a
 * pentagon" is sometimes wrong, and a picture drawn from its answer would be wrong with it.
 */
export interface SolidDefinition {
  solid: SolidKind
  label?: string
  edge?: number
  size?: [number, number, number]
  base?: number
  height?: number
  radius?: number
  /** Put the apex directly above this vertex instead of above the centre. */
  apexOver?: string
  points?: PointDef[]
  segments?: SegmentDef[]
  section?: { through: string[] }
  highlight?: HighlightDef[]
  show?: ShowFlag[]
  caption?: string
}

export interface SolidOptions {
  /** Height of the figure in CSS pixels. */
  height?: number
  /** Refuse a definition asking for more than this many named points. */
  maxPoints?: number
  /** Refuse a fence larger than this, before parsing it. */
  maxSourceBytes?: number
}

export interface SolidError {
  code: "invalid-json" | "invalid-definition" | "too-large"
  message: string
}

export type SolidResult<T> = { ok: true; value: T } | { ok: false; error: SolidError }

/** A solid resolved to concrete geometry: named points, edges, and faces to draw. */
export interface Figure {
  kind: SolidKind
  /** Every point the figure can refer to, by name. */
  points: Map<string, Vec3>
  /** Straight edges of the solid itself. */
  edges: Array<[string, string]>
  /** Faces as loops of point names. Curved solids contribute none. */
  faces: string[][]
  /** Radius and height for the curved solids, which are drawn from a surface rather than faces. */
  radius?: number
  height?: number
  /** How far the figure extends from the origin, for framing the camera. */
  extent: number
}
