import type * as THREE from "three"
import { add, centroid, cross, dot, length, names, scale, sectionPolygon, sub, vec } from "./geometry"
import type { Figure, SolidDefinition, Vec3 } from "./types"

/**
 * Three.js is imported when a figure is actually drawn, never when the plugin is installed.
 *
 * A page whose answer contains no geometry should not carry a 3D engine, and an answer that does
 * carry one is already waiting on the render.
 */
let threePromise: Promise<typeof THREE> | null = null
const loadThree = () => (threePromise ??= import("three"))

export interface Palette {
  edge: string
  hidden: string
  face: string
  label: string
  accent: string
  section: string
}

/** A figure has to read against the page it is on; drawn for a light page it vanishes on a dark one. */
export function palette(theme?: string): Palette {
  return theme === "dark"
    ? { edge: "#d4d4d8", hidden: "#71717a", face: "#a1a1aa", label: "#fafafa", accent: "#f59e0b", section: "#38bdf8" }
    : { edge: "#27272a", hidden: "#a1a1aa", face: "#71717a", label: "#18181b", accent: "#b45309", section: "#0369a1" }
}

const v3 = (three: typeof THREE, p: Vec3) => new three.Vector3(p.x, p.y, p.z)

/** A letter drawn beside a point, as a sprite so it always faces the reader. */
function labelSprite(three: typeof THREE, text: string, colour: string, scaleBy: number): THREE.Sprite {
  const size = 128
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext("2d")
  if (context) {
    context.fillStyle = colour
    context.font = "600 72px ui-sans-serif, system-ui, sans-serif"
    context.textAlign = "center"
    context.textBaseline = "middle"
    context.fillText(text, size / 2, size / 2)
  }
  const texture = new three.CanvasTexture(canvas)
  const sprite = new three.Sprite(new three.SpriteMaterial({ map: texture, depthTest: false, transparent: true }))
  sprite.scale.setScalar(scaleBy)
  sprite.renderOrder = 10
  return sprite
}

function lineBetween(three: typeof THREE, a: Vec3, b: Vec3, colour: string, dashed: boolean, width = 1): THREE.Line {
  const geometry = new three.BufferGeometry().setFromPoints([v3(three, a), v3(three, b)])
  const material = dashed
    ? new three.LineDashedMaterial({ color: colour, dashSize: 0.12, gapSize: 0.08, linewidth: width })
    : new three.LineBasicMaterial({ color: colour, linewidth: width })
  const line = new three.Line(geometry, material)
  // Without this a dashed material draws a solid line, silently.
  if (dashed) line.computeLineDistances()
  return line
}

/** Fill a planar loop of points, for a section or a highlighted plane. */
function polygonMesh(three: typeof THREE, loop: Vec3[], colour: string, opacity: number): THREE.Mesh | undefined {
  if (loop.length < 3) return undefined
  const middle = centroid(loop)
  const positions: number[] = []
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    positions.push(middle.x, middle.y, middle.z, a.x, a.y, a.z, b.x, b.y, b.z)
  }
  const geometry = new three.BufferGeometry()
  geometry.setAttribute("position", new three.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return new three.Mesh(geometry, new three.MeshBasicMaterial({ color: colour, transparent: true, opacity, side: three.DoubleSide, depthWrite: false }))
}

/** The arc marking an angle, so ∠MBO reads as an angle rather than two more lines. */
function angleArc(three: typeof THREE, at: Vec3, from: Vec3, to: Vec3, colour: string, radius: number): THREE.Line | undefined {
  const u = sub(from, at)
  const w = sub(to, at)
  const lu = length(u)
  const lw = length(w)
  if (lu < 1e-9 || lw < 1e-9) return undefined
  const a = scale(u, 1 / lu)
  const b = scale(w, 1 / lw)
  const normal = cross(a, b)
  if (length(normal) < 1e-9) return undefined
  const total = Math.acos(Math.max(-1, Math.min(1, dot(a, b))))
  const axis = scale(normal, 1 / length(normal))
  const points: THREE.Vector3[] = []
  const steps = 24
  for (let i = 0; i <= steps; i++) {
    const angle = (total * i) / steps
    const rotated = v3(three, a).applyAxisAngle(v3(three, axis), angle).multiplyScalar(radius)
    points.push(rotated.add(v3(three, at)))
  }
  const line = new three.Line(new three.BufferGeometry().setFromPoints(points), new three.LineBasicMaterial({ color: colour }))
  return line
}

/**
 * The rim of a circle, as a closed line.
 *
 * `CircleGeometry` is a triangle fan whose first vertex is the centre, so drawing it as a
 * `LineLoop` joins that centre to every point on the rim — a cone comes out wearing a bicycle
 * wheel instead of a base.
 */
function circleRim(three: typeof THREE, radius: number, segments = 64): THREE.BufferGeometry {
  const points: THREE.Vector3[] = []
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments
    points.push(new three.Vector3(radius * Math.cos(angle), 0, radius * Math.sin(angle)))
  }
  return new three.BufferGeometry().setFromPoints(points)
}

function curvedSurface(three: typeof THREE, figure: Figure, colours: Palette): THREE.Object3D | undefined {
  const radius = figure.radius ?? 1
  const height = figure.height ?? 1
  const material = new three.MeshBasicMaterial({ color: colours.face, transparent: true, opacity: 0.16, side: three.DoubleSide, depthWrite: false })
  const wire = new three.LineBasicMaterial({ color: colours.edge })
  const group = new three.Group()
  if (figure.kind === "cone") {
    const geometry = new three.ConeGeometry(radius, height, 48, 1, true)
    const mesh = new three.Mesh(geometry, material)
    mesh.position.y = height / 2
    group.add(mesh)
    group.add(new three.LineLoop(circleRim(three, radius), wire))
  } else if (figure.kind === "cylinder") {
    const geometry = new three.CylinderGeometry(radius, radius, height, 48, 1, true)
    const mesh = new three.Mesh(geometry, material)
    mesh.position.y = height / 2
    group.add(mesh)
    for (const y of [0, height]) {
      const ring = new three.LineLoop(circleRim(three, radius), wire)
      ring.position.y = y
      group.add(ring)
    }
  } else if (figure.kind === "sphere") {
    group.add(new three.Mesh(new three.SphereGeometry(radius, 48, 32), material))
    // Equator plus two meridians, so a sphere reads as a sphere rather than a flat disc.
    for (const rotation of [undefined, "x", "z"] as const) {
      const ring = new three.LineLoop(circleRim(three, radius), wire)
      if (rotation) ring.rotation[rotation] = Math.PI / 2
      group.add(ring)
    }
  } else {
    return undefined
  }
  return group
}

/** Build the whole scene for one figure. */
function buildScene(three: typeof THREE, definition: SolidDefinition, figure: Figure, colours: Palette): { group: THREE.Group; radius: number } {
  const group = new three.Group()
  // Bounds first: labels and camera are both derived from the figure's own size, so a tall prism
  // and a small cube get letters that look the same size on screen.
  const positions = [...figure.points.values()]
  const bounds = positions.length > 0 ? positions : [vec(0, 0, 0)]
  const low = bounds.reduce((a, p) => vec(Math.min(a.x, p.x), Math.min(a.y, p.y), Math.min(a.z, p.z)), bounds[0])
  const high = bounds.reduce((a, p) => vec(Math.max(a.x, p.x), Math.max(a.y, p.y), Math.max(a.z, p.z)), bounds[0])
  const middle = scale(add(low, high), 0.5)
  const radius = Math.max(bounds.reduce((max, p) => Math.max(max, length(sub(p, middle))), 0), figure.radius ?? 0, 0.5)
  const labelScale = radius * 0.2

  for (const face of figure.faces) {
    const loop = face.map((name) => figure.points.get(name)).filter(Boolean) as Vec3[]
    const mesh = polygonMesh(three, loop, colours.face, 0.1)
    if (mesh) group.add(mesh)
  }
  const curved = curvedSurface(three, figure, colours)
  if (curved) group.add(curved)

  for (const [from, to] of figure.edges) {
    const a = figure.points.get(from)
    const b = figure.points.get(to)
    if (a && b) group.add(lineBetween(three, a, b, colours.edge, false))
  }

  for (const segment of definition.segments ?? []) {
    const a = figure.points.get(segment.from)
    const b = figure.points.get(segment.to)
    if (a && b) group.add(lineBetween(three, a, b, colours.accent, segment.style === "dashed", 2))
  }

  if (definition.section) {
    const loop = sectionPolygon(figure, definition.section.through)
    const mesh = polygonMesh(three, loop, colours.section, 0.28)
    if (mesh) group.add(mesh)
    for (let i = 0; i < loop.length; i++) {
      group.add(lineBetween(three, loop[i], loop[(i + 1) % loop.length], colours.section, false, 2))
    }
  }

  for (const mark of definition.highlight ?? []) {
    if ("line" in mark) {
      const [a, b] = mark.line.map((name) => figure.points.get(name))
      if (a && b) group.add(lineBetween(three, a, b, colours.accent, false, 3))
    } else if ("plane" in mark) {
      const loop = mark.plane.length === 3 ? sectionPolygon(figure, mark.plane) : []
      const points = loop.length >= 3 ? loop : (mark.plane.map((name) => figure.points.get(name)).filter(Boolean) as Vec3[])
      const mesh = polygonMesh(three, points, colours.section, 0.22)
      if (mesh) group.add(mesh)
    } else {
      const at = figure.points.get(mark.angle.at)
      const [from, to] = mark.angle.rays.map((name) => figure.points.get(name))
      if (at && from && to) {
        const arc = angleArc(three, at, from, to, colours.accent, figure.extent * 0.18)
        if (arc) group.add(arc)
      }
    }
  }

  if (!definition.show || definition.show.includes("labels")) {
    for (const [name, point] of figure.points) {
      const sprite = labelSprite(three, name, colours.label, labelScale)
      // Nudged away from the centre so the letter clears the vertex it names.
      const from = sub(point, middle)
      const push = radius * 0.14
      const outward = length(from) > 1e-6 ? scale(from, push / length(from)) : vec(0, push, 0)
      sprite.position.set(point.x + outward.x, point.y + outward.y, point.z + outward.z)
      group.add(sprite)
    }
  }

  group.position.set(-middle.x, -middle.y, -middle.z)
  return { group, radius }
}

export interface MountedFigure {
  destroy(): void
}

/** Draw one figure into `host`, returning the teardown the reconciler will call. */
export async function mountFigure(
  host: HTMLElement,
  definition: SolidDefinition,
  figure: Figure,
  options: { height: number; theme?: string },
): Promise<MountedFigure> {
  const three = await loadThree()
  const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js")
  const colours = palette(options.theme)

  const width = host.clientWidth || 480
  const height = options.height
  const scene = new three.Scene()
  const { group, radius } = buildScene(three, definition, figure, colours)
  scene.add(group)

  const fov = 45
  const camera = new three.PerspectiveCamera(fov, width / height, 0.1, 1000)
  // Framed from the figure rather than from a guessed multiple of its size: the figure should fill
  // the canvas, and a wide canvas must not shrink it to a stamp in the middle. The margin leaves
  // room for the labels, which sit outside the solid.
  const vertical = radius / Math.sin((fov * Math.PI) / 360)
  const horizontal = vertical / Math.max(1e-6, camera.aspect)
  const distance = Math.max(vertical, horizontal) * 1.45
  // The three-quarter view a textbook draws: slightly above, well to one side.
  camera.position.copy(new three.Vector3(0.62, 0.5, 0.75).normalize().multiplyScalar(distance))
  camera.lookAt(0, 0, 0)

  const renderer = new three.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2))
  renderer.setSize(width, height)
  host.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.enablePan = false
  // Turning the solid is how a reader understands it; moving or building geometry is not something
  // this plugin offers, and zoom past the figure only loses it.
  controls.minDistance = radius * 1.2
  controls.maxDistance = distance * 3

  let frame = 0
  const tick = () => {
    frame = requestAnimationFrame(tick)
    controls.update()
    renderer.render(scene, camera)
  }
  tick()

  const resize = () => {
    const next = host.clientWidth || width
    camera.aspect = next / height
    camera.updateProjectionMatrix()
    renderer.setSize(next, height)
  }
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(resize)
  observer?.observe(host)

  return {
    destroy() {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      controls.dispose()
      renderer.dispose()
      // A WebGL context is not garbage collected on its own, and a page of answers can build a lot
      // of them; without this the browser starts dropping the oldest canvas on screen.
      renderer.forceContextLoss?.()
      renderer.domElement.remove()
    },
  }
}

/** The names a figure knows, for tests and for hosts that want to label their own UI. */
export function figurePointNames(figure: Figure): string[] {
  return [...figure.points.keys()]
}

export { names }
