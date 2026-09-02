/** A point or size in scene space: metres, y up, the ground at y = 0. */
export type Vec3 = [number, number, number]

export type ShapeKind = "box" | "sphere" | "cylinder" | "cone" | "torus" | "capsule" | "plane" | "model"

export type Material = "matte" | "metal" | "glass"

/** Whether `position` names the object's centre or the middle of its underside. */
export type Anchor = "center" | "bottom"

interface ObjectBase {
  /** Text drawn beside the object, always facing the reader. */
  label?: string
  /** Where the object is, per `anchor`. Default `[0, 0, 0]`. */
  position?: Vec3
  /** Euler rotation in degrees about x, y, z. Default `[0, 0, 0]`. */
  rotation?: Vec3
  anchor?: Anchor
  /** A CSS hex colour or one of a short list of names. */
  color?: string
  /** 0–1. Anything under 1 draws the object see-through. */
  opacity?: number
  material?: Material
  wireframe?: boolean
}

export type SceneObject =
  | (ObjectBase & { shape: "box"; size: Vec3 })
  | (ObjectBase & { shape: "sphere"; radius: number })
  /**
   * `sides` makes the round shapes faceted: 4 turns a cone into a pyramid roof and a cylinder
   * into a square post, 6 makes a hex nut. Omitted, they are round.
   */
  | (ObjectBase & { shape: "cylinder"; radius: number; height: number; radiusTop?: number; sides?: number })
  | (ObjectBase & { shape: "cone"; radius: number; height: number; sides?: number })
  | (ObjectBase & { shape: "torus"; radius: number; tube: number })
  | (ObjectBase & { shape: "capsule"; radius: number; height: number })
  /** A flat rectangle lying in the ground plane: width along x, depth along z. */
  | (ObjectBase & { shape: "plane"; size: [number, number] })
  /**
   * A glTF/GLB file the host allowed this page to fetch.
   *
   * `size` is the longest side the model should be scaled to. It is what makes a file authored in
   * centimetres sit sensibly beside a box authored in metres — and a model that has never seen
   * the file cannot know its units.
   */
  | (ObjectBase & { shape: "model"; src: string; size?: number })

export interface SceneCamera {
  position?: Vec3
  target?: Vec3
}

/**
 * One scene, as the model writes it.
 *
 * Everything is placed explicitly: this block exists for the model to *build* something, so unlike
 * `solid` there is no textbook vocabulary to hide the coordinates behind. What the protocol does
 * instead is keep the arithmetic small — `anchor: "bottom"` puts a thing on the ground without
 * the model halving its height, and a `model` file's `size` replaces a scale factor it would have
 * had to guess.
 */
export interface SceneDefinition {
  objects: SceneObject[]
  camera?: SceneCamera
  /** Draw a ground grid at y = 0. Default true. */
  grid?: boolean
  /** Turn the scene slowly on its own until the reader takes hold of it. Default false. */
  autoRotate?: boolean
  caption?: string
}

export interface SceneOptions {
  /** Height of the canvas in CSS pixels. Default 360. */
  height?: number
  /**
   * Exact HTTPS origins a `model` object may load a file from, e.g. `["https://assets.example.com"]`.
   *
   * Absent or empty, every `model` object is refused: a URL in a fence is a URL the model wrote,
   * and a page should not fetch whatever a model names.
   */
  allowedModelOrigins?: string[]
  /** Refuse a scene with more objects than this. Default 64. */
  maxObjects?: number
  /** Refuse a fence larger than this, before parsing it. Default 32 KiB. */
  maxSourceBytes?: number
}

export interface SceneError {
  code: "invalid-json" | "invalid-definition" | "too-large" | "origin-not-allowed"
  message: string
}

export type SceneResult<T> = { ok: true; value: T } | { ok: false; error: SceneError }

/** A `model` object the host's origin policy kept out of the scene. */
export interface RefusedModel {
  index: number
  src: string
  message: string
}

/**
 * A scene that passed validation, with the model files it had to leave out.
 *
 * A disallowed origin drops that one object rather than the whole scene: the table the model
 * built is still worth showing, and the note under it says what is missing and why.
 */
export interface ParsedScene {
  definition: SceneDefinition
  refused: RefusedModel[]
}

/** The sphere that encloses every placed object, for framing the camera. */
export interface Bounds {
  center: Vec3
  radius: number
}
