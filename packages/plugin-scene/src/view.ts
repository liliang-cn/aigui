import type * as THREE from "three"
import { DEFAULT_VIEW, centerOf, framingDistance } from "./bounds"
import { fitCamera, projectToScreen, type Margins } from "./frame"
import { COLUMN_GAP, LABEL_FONT_PX, type LabelRequest, type Rect } from "./labels"
import type { Bounds, LabelSide, SceneDefinition, SceneObject, Vec3 } from "./types"

/*
 * Everything about drawing a scene that needs three.js's maths but not a browser: the shapes, the
 * points labels hang from, what they must not cover, and where the camera stands. Kept apart from
 * the renderer so that the whole label layout can be checked in Node, on the scenes that broke it.
 */

export const DEG = Math.PI / 180

export function geometryFor(three: typeof THREE, object: SceneObject): THREE.BufferGeometry | undefined {
  switch (object.shape) {
    case "box":
      return new three.BoxGeometry(object.size[0], object.size[1], object.size[2])
    case "sphere":
      return new three.SphereGeometry(object.radius, 48, 32)
    case "cylinder":
      return new three.CylinderGeometry(object.radiusTop ?? object.radius, object.radius, object.height, object.sides ?? 48)
    case "cone":
      return new three.ConeGeometry(object.radius, object.height, object.sides ?? 48)
    case "torus":
      // Three's torus stands on edge like a wheel; laid flat its axis is y, the same as every
      // other round shape here, so a ring "on the table" needs no rotation from the model.
      return new three.TorusGeometry(object.radius, object.tube, 24, 64).rotateX(-Math.PI / 2)
    case "capsule":
      return new three.CapsuleGeometry(object.radius, object.height, 8, 24)
    case "plane":
      return new three.PlaneGeometry(object.size[0], object.size[1]).rotateX(-Math.PI / 2)
    case "model":
      return undefined
  }
}

export function placeAt(object3d: THREE.Object3D, object: SceneObject): void {
  const [x, y, z] = centerOf(object)
  object3d.position.set(x, y, z)
  const [rx, ry, rz] = object.rotation ?? [0, 0, 0]
  object3d.rotation.set(rx * DEG, ry * DEG, rz * DEG)
}

export const LABEL_HEIGHT = LABEL_FONT_PX + 6
export const LABEL_PADDING = 8
export const EDGE_MARGIN = 12

/** One object's label, and the thing on screen it is attached to. */
export interface LabelEntry {
  owner: number
  text: string
  side: LabelSide
  offset: Vec3
  node: THREE.Object3D
  width: number
}

/**
 * The point on an object a label is attached to, from what is actually drawn.
 *
 * Measured from the object's world-space box rather than its declared size, so a cylinder turned
 * on its side gets its label above where it now lies, not above where its length would have
 * reached standing up.
 */
export function labelAnchor(three: typeof THREE, entry: LabelEntry): THREE.Vector3 {
  const box = new three.Box3().setFromObject(entry.node)
  const centre = box.getCenter(new three.Vector3())
  const point =
    entry.side === "left" ? new three.Vector3(box.min.x, centre.y, centre.z)
    : entry.side === "right" ? new three.Vector3(box.max.x, centre.y, centre.z)
    : entry.side === "front" ? new three.Vector3(centre.x, centre.y, box.max.z)
    : new three.Vector3(centre.x, box.max.y, centre.z)
  return point.add(new three.Vector3(...entry.offset))
}

export function corners(three: typeof THREE, box: THREE.Box3): THREE.Vector3[] {
  const out: THREE.Vector3[] = []
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) out.push(new three.Vector3(x, y, z))
  return out
}

/**
 * An object's box cut into roughly cubic pieces along its longest side.
 *
 * What a label must not cover is the object's outline on screen, and one rectangle round a long
 * thin thing seen at an angle — a cable, a rail — is mostly empty space: the diagonal pipe across a
 * scene would claim half the canvas. A row of small boxes along it hugs the real shape.
 */
export function pieces(three: typeof THREE, box: THREE.Box3): THREE.Box3[] {
  const size = box.getSize(new three.Vector3())
  const axes = [size.x, size.y, size.z]
  const longest = axes.indexOf(Math.max(...axes))
  const second = Math.max(...axes.filter((_, i) => i !== longest), 1e-6)
  const count = Math.min(16, Math.max(1, Math.round(axes[longest] / Math.max(second, axes[longest] / 16))))
  const out: THREE.Box3[] = []
  for (let i = 0; i < count; i++) {
    const piece = box.clone()
    const from = box.min.getComponent(longest) + (axes[longest] * i) / count
    piece.min.setComponent(longest, from)
    piece.max.setComponent(longest, from + axes[longest] / count)
    out.push(piece)
  }
  return out
}

/** A drawn object, by its index in the definition. Flat ones — a floor — are not in labels' way. */
export interface Solid {
  owner: number
  node: THREE.Object3D
  flat: boolean
}

/** The room the labels need at the canvas edges, so the objects are fitted inside it. */
export function labelMargins(labels: readonly LabelEntry[]): Margins {
  const widest = (side: LabelSide) => Math.max(0, ...labels.filter((l) => l.side === side).map((l) => l.width))
  const column = (side: LabelSide) => (widest(side) > 0 ? widest(side) + COLUMN_GAP + 4 : EDGE_MARGIN)
  return {
    left: column("left"),
    right: column("right"),
    top: labels.some((l) => l.side === "top") ? LABEL_HEIGHT + 10 : EDGE_MARGIN,
    bottom: EDGE_MARGIN,
  }
}

/**
 * Stand the camera for a definition, and say where it looks and how far away it is.
 *
 * With no camera in the definition the view is fitted to what is drawn and to the labels' room,
 * rather than to a sphere round everything: a row of boxes is much wider than it is tall, and the
 * sphere left most of the frame empty. An author's camera stands — backed off only as far as the
 * label columns need, since a camera that fills the frame with objects leaves the columns nowhere
 * to go but on top of them.
 */
export function frameCamera(
  three: typeof THREE,
  camera: THREE.PerspectiveCamera,
  input: { definition: SceneDefinition; solids: readonly Solid[]; labels: readonly LabelEntry[]; fit: Bounds; width: number; height: number },
): { target: THREE.Vector3; distance: number } {
  const { definition, solids, labels, fit, width, height } = input
  const target = new three.Vector3(...(definition.camera?.target ?? fit.center))
  const points = () => solids.flatMap(({ node }) => corners(three, new three.Box3().setFromObject(node)))
  const sphereDistance = framingDistance(fit, camera.fov, camera.aspect)
  if (definition.camera?.position) {
    const chosen = new three.Vector3(...definition.camera.position)
    camera.position.copy(chosen)
    camera.lookAt(target)
    if (!labels.some((l) => l.side === "left" || l.side === "right")) return { target, distance: Math.max(sphereDistance, chosen.distanceTo(target)) }
    const fitted = fitCamera(three, camera, points(), {
      direction: chosen.clone().sub(target).toArray() as Vec3,
      width,
      height,
      margins: labelMargins(labels),
      fixed: { target, minDistance: chosen.distanceTo(target) },
    })
    camera.position.copy(fitted.position)
    return { target, distance: Math.max(sphereDistance, fitted.position.distanceTo(target)) }
  }
  if (definition.camera?.target) {
    camera.position.set(...DEFAULT_VIEW).normalize().multiplyScalar(sphereDistance).add(target)
    camera.lookAt(target)
    return { target, distance: sphereDistance }
  }
  const fitted = fitCamera(three, camera, points(), { direction: DEFAULT_VIEW, width, height, margins: labelMargins(labels) })
  camera.position.copy(fitted.position)
  return { target: fitted.target, distance: fitted.position.distanceTo(fitted.target) }
}

/** Each solid's outline on screen, in pieces that follow long thin shapes. */
export function screenObstacles(three: typeof THREE, camera: THREE.PerspectiveCamera, solids: readonly Solid[], width: number, height: number): Array<{ owner: number; rect: Rect }> {
  const obstacles: Array<{ owner: number; rect: Rect }> = []
  for (const { owner, node, flat } of solids) {
    if (flat) continue
    for (const piece of pieces(three, new three.Box3().setFromObject(node))) {
      const screen = projectToScreen(three, camera, corners(three, piece), width, height)
      if (!screen.every((p) => p.inFront)) continue
      const xs = screen.map((p) => p.x)
      const ys = screen.map((p) => p.y)
      obstacles.push({ owner, rect: { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) } })
    }
  }
  return obstacles
}

/** The labels whose anchors are in front of the camera, as layout requests. */
export function labelRequests(three: typeof THREE, camera: THREE.PerspectiveCamera, labels: readonly LabelEntry[], width: number, height: number): { requests: LabelRequest[]; shown: LabelEntry[] } {
  const requests: LabelRequest[] = []
  const shown: LabelEntry[] = []
  for (const entry of labels) {
    const [anchor] = projectToScreen(three, camera, [labelAnchor(three, entry)], width, height)
    if (!anchor.inFront) continue
    requests.push({ side: entry.side, anchor, width: entry.width, height: LABEL_HEIGHT, owner: entry.owner })
    shown.push(entry)
  }
  return { requests, shown }
}

/** A label entry for an object, measured by `measure` (text → width in CSS pixels, padding included). */
export function labelEntry(owner: number, object: SceneObject, node: THREE.Object3D, measure: (text: string) => number): LabelEntry | undefined {
  if (!object.label) return undefined
  return { owner, text: object.label, side: object.labelSide ?? "top", offset: object.labelOffset ?? [0, 0, 0], node, width: measure(object.label) }
}

/** Width of `text` at the label size without a canvas to measure it on: generous, for Node. */
export const estimateLabelWidth = (text: string): number => [...text].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? LABEL_FONT_PX : LABEL_FONT_PX * 0.62), 0) + LABEL_PADDING
