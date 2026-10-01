import type * as THREE from "three"
import { centerOf, sceneBounds } from "./bounds"
import { LABEL_FONT_PX, countOverlaps, layoutLabels } from "./labels"
import { sceneStateAt, type ObjectState } from "./steps"
import type { Bounds, SceneDefinition, SceneObject, Vec3 } from "./types"
import { DEG, LABEL_PADDING, estimateLabelWidth, frameCamera, geometryFor, labelEntry, labelRequests, placeAt, screenObstacles, type LabelEntry, type Solid } from "./view"


/**
 * Three.js is imported when a scene is actually drawn, never when the plugin is installed.
 *
 * A page whose answer contains no scene should not carry a 3D engine, and an answer that does
 * carry one is already waiting on the render.
 */
let threePromise: Promise<typeof THREE> | null = null
const loadThree = () => (threePromise ??= import("three"))

export interface Palette {
  object: string
  grid: string
  gridCenter: string
  label: string
  /** The outline drawn round label text so it reads over an object as well as over the page. */
  halo: string
  /** The glow on an object a step is pointing at. */
  highlight: string
  sky: string
  ground: string
}

/** A scene has to read against the page it is on; lit for a light page it glares on a dark one. */
export function palette(theme?: string): Palette {
  return theme === "dark"
    ? { object: "#94a3b8", grid: "#3f3f46", gridCenter: "#71717a", label: "#fafafa", halo: "rgba(24,24,27,0.85)", highlight: "#38bdf8", sky: "#e2e8f0", ground: "#1e293b" }
    : { object: "#64748b", grid: "#d4d4d8", gridCenter: "#a1a1aa", label: "#18181b", halo: "rgba(255,255,255,0.9)", highlight: "#0ea5e9", sky: "#ffffff", ground: "#94a3b8" }
}


function materialFor(three: typeof THREE, object: SceneObject, colours: Palette): THREE.Material {
  const color = object.color ?? colours.object
  const opacity = object.opacity ?? 1
  const transparent = opacity < 1 || object.material === "glass"
  const common = { color, transparent, opacity: object.material === "glass" ? Math.min(opacity, 0.45) : opacity, wireframe: object.wireframe ?? false, side: three.DoubleSide }
  switch (object.material) {
    case "metal":
      return new three.MeshStandardMaterial({ ...common, roughness: 0.3, metalness: 0.9 })
    case "glass":
      return new three.MeshPhysicalMaterial({ ...common, roughness: 0.1, metalness: 0, depthWrite: false })
    default:
      return new three.MeshStandardMaterial({ ...common, roughness: 0.85, metalness: 0 })
  }
}

const LABEL_FONT = `600 ${LABEL_FONT_PX}px ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`

/**
 * Fit a loaded model to the box the definition promised for it.
 *
 * The file's own units are whatever its author chose; `size` is the longest side the scene wants,
 * and the anchor is applied to the model's real bounding box, not the guess `halfExtents` made
 * before the file arrived.
 */
function fitModel(three: typeof THREE, root: THREE.Object3D, object: Extract<SceneObject, { shape: "model" }>): THREE.Group {
  const holder = new three.Group()
  const box = new three.Box3().setFromObject(root)
  const size = new three.Vector3()
  box.getSize(size)
  const longest = Math.max(size.x, size.y, size.z)
  const scale = object.size && longest > 1e-9 ? object.size / longest : 1
  root.scale.setScalar(scale)
  box.setFromObject(root)
  const centre = new three.Vector3()
  box.getCenter(centre)
  // Recentre the file on its own bounding box, then treat that box exactly like a primitive.
  root.position.sub(centre)
  if (object.anchor === "bottom") root.position.y += (box.max.y - box.min.y) / 2
  holder.add(root)
  const [x, y, z] = object.position ?? [0, 0, 0]
  holder.position.set(x, y, z)
  const [rx, ry, rz] = object.rotation ?? [0, 0, 0]
  holder.rotation.set(rx * DEG, ry * DEG, rz * DEG)
  return holder
}

export interface MountedScene {
  destroy(): void
  /** Show the scene as step `index` leaves it (−1: before any step), easing there unless `instant`. */
  goTo(index: number, instant?: boolean): void
}

/** Build and draw one scene into `host`, returning the teardown the reconciler will call. */
export async function mountScene(
  host: HTMLElement,
  definition: SceneDefinition,
  options: { height: number; theme?: string; onModelError?: (object: Extract<SceneObject, { shape: "model" }>, error: unknown) => void },
): Promise<MountedScene> {
  const three = await loadThree()
  const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js")
  const colours = palette(options.theme)
  const disposables: Array<{ dispose(): void }> = []

  const width = host.clientWidth || 480
  const height = options.height
  const scene = new three.Scene()
  const world = new three.Group()
  scene.add(world)

  const bounds = sceneBounds(definition.objects)

  // Labels are drawn on a flat canvas over the 3D one, in screen pixels: text that is part of the
  // 3D scene grows and shrinks with the camera, and cannot be moved out of another label's way.
  host.style.position = "relative"
  const overlay = document.createElement("canvas")
  overlay.setAttribute("data-aigui-scene-labels", "")
  overlay.style.cssText = "position:absolute;left:0;top:0;pointer-events:none"
  const pen = overlay.getContext("2d")
  const measure = (text: string) => {
    if (!pen) return estimateLabelWidth(text)
    pen.font = LABEL_FONT
    return Math.ceil(pen.measureText(text).width) + LABEL_PADDING
  }

  const labels: LabelEntry[] = []
  /** The drawn thing for each object, by its index in the definition. */
  const nodes: Array<THREE.Object3D | undefined> = definition.objects.map(() => undefined)
  /** Every drawn object, by its index in the definition: what labels must not cover. */
  const solids: Solid[] = []
  const addLabel = (owner: number, object: SceneObject, node: THREE.Object3D) => {
    const entry = labelEntry(owner, object, node, measure)
    if (entry) labels.push(entry)
  }

  for (const [index, object] of definition.objects.entries()) {
    if (object.shape === "model") continue
    const geometry = geometryFor(three, object)
    if (!geometry) continue
    const material = materialFor(three, object, colours)
    disposables.push(geometry, material)
    const mesh = new three.Mesh(geometry, material)
    placeAt(mesh, object)
    world.add(mesh)
    mesh.updateMatrixWorld()
    nodes[index] = mesh
    solids.push({ owner: index, node: mesh, flat: object.shape === "plane" })
    addLabel(index, object, mesh)
  }

  scene.add(new three.HemisphereLight(colours.sky, colours.ground, 1.1))
  const key = new three.DirectionalLight("#ffffff", 1.6)
  key.position.set(bounds.radius * 2, bounds.radius * 4, bounds.radius * 3).add(new three.Vector3(...bounds.center))
  scene.add(key)
  const fill = new three.DirectionalLight("#ffffff", 0.5)
  fill.position.set(-bounds.radius * 3, bounds.radius, -bounds.radius * 2).add(new three.Vector3(...bounds.center))
  scene.add(fill)

  if (definition.grid !== false) {
    const span = Math.max(2, Math.ceil(bounds.radius * 2.5))
    const grid = new three.GridHelper(span * 2, span * 2, colours.gridCenter, colours.grid)
    grid.position.set(bounds.center[0], 0, bounds.center[2])
    const gridMaterial = grid.material as THREE.Material
    gridMaterial.transparent = true
    gridMaterial.opacity = 0.6
    disposables.push(grid.geometry, gridMaterial)
    scene.add(grid)
  }

  const fov = 40
  const camera = new three.PerspectiveCamera(fov, width / height, 0.01, Math.max(1000, bounds.radius * 50))
  const renderer = new three.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2))
  renderer.setSize(width, height)
  host.appendChild(renderer.domElement)
  host.appendChild(overlay)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.autoRotate = definition.autoRotate === true
  controls.autoRotateSpeed = 1.2

  const frame = (fit: Bounds) => {
    const { target, distance } = frameCamera(three, camera, { definition, solids, labels, fit, width: canvasWidth(), height })
    controls.target.copy(target)
    controls.minDistance = fit.radius * 0.5
    controls.maxDistance = distance * 4
    controls.update()
    labelsDirty = true
  }
  const canvasWidth = () => host.clientWidth || width
  let labelsDirty = true
  frame(bounds)

  let lastView = ""
  /**
   * Lay the labels out and draw them — only when the view has changed.
   *
   * Every frame would be simpler, but a still scene should be still: an image renderer waits for
   * the page to stop changing, and so does a reader's battery.
   */
  const drawLabels = () => {
    if (!pen) return
    const w = canvasWidth()
    const view = `${w}x${height}:${camera.matrixWorld.elements.map((n) => n.toFixed(5)).join(",")}`
    if (view === lastView && !labelsDirty) return
    lastView = view
    labelsDirty = false
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 2)
    if (overlay.width !== Math.round(w * ratio) || overlay.height !== Math.round(height * ratio)) {
      overlay.width = Math.round(w * ratio)
      overlay.height = Math.round(height * ratio)
      overlay.style.width = `${w}px`
      overlay.style.height = `${height}px`
    }
    pen.setTransform(ratio, 0, 0, ratio, 0, 0)
    pen.clearRect(0, 0, w, height)
    if (labels.length === 0) return

    // A hidden object neither has a label nor is in a label's way.
    const obstacles = screenObstacles(three, camera, solids.filter((s) => s.node.visible), w, height)
    const { requests, shown } = labelRequests(three, camera, labels.filter((l) => l.node.visible), w, height)
    const placed = layoutLabels(requests, { width: w, height, obstacles })
    const overlaps = String(countOverlaps(placed, requests, obstacles))
    if (overlay.getAttribute("data-overlaps") !== overlaps) {
      overlay.setAttribute("data-overlaps", overlaps)
      // Said where a checker looks for it, with the fix: the model that wrote the scene reads this.
      if (overlaps === "0") overlay.removeAttribute("data-aigui-issue")
      else overlay.setAttribute("data-aigui-issue", `${overlaps === "1" ? "1 label sits" : `${overlaps} labels sit`} on another label or object — give stacked or crowded objects "labelSide": "left" or "right"`)
    }
    if (overlay.getAttribute("data-labels") !== String(placed.length)) overlay.setAttribute("data-labels", String(placed.length))

    pen.font = LABEL_FONT
    pen.textAlign = "center"
    pen.textBaseline = "middle"
    pen.lineJoin = "round"
    for (const { leader } of placed) {
      if (!leader) continue
      const to = leader[leader.length - 1]
      pen.globalAlpha = 0.6
      pen.strokeStyle = colours.label
      pen.lineWidth = 1
      pen.beginPath()
      pen.moveTo(leader[0].x, leader[0].y)
      for (const point of leader.slice(1)) pen.lineTo(point.x, point.y)
      pen.stroke()
      pen.beginPath()
      pen.arc(to.x, to.y, 2.25, 0, Math.PI * 2)
      pen.fillStyle = colours.label
      pen.fill()
      pen.globalAlpha = 1
    }
    for (const [i, { rect }] of placed.entries()) {
      const x = rect.x + rect.width / 2
      const y = rect.y + rect.height / 2
      pen.strokeStyle = colours.halo
      pen.lineWidth = 3.5
      pen.strokeText(shown[i].text, x, y)
      pen.fillStyle = colours.label
      pen.fillText(shown[i].text, x, y)
    }
  }

  // Steps. `target` is the state the scene is easing to; `from` the one it is easing from.
  let target: ObjectState[] = sceneStateAt(definition, -1)
  let from: ObjectState[] = target
  let tweenStart: number | undefined
  const TWEEN_MS = 700
  const highlightColour = new three.Color(colours.highlight)
  const place = (index: number, a: ObjectState, b: ObjectState, k: number) => {
    const node = nodes[index]
    const object = definition.objects[index]
    if (!node) return
    const position: Vec3 = [0, 1, 2].map((axis) => a.position[axis] + (b.position[axis] - a.position[axis]) * k) as Vec3
    if (object.shape === "model") node.position.set(...position)
    else node.position.set(...centerOf({ ...object, position }))
    // Shown at the start of the change, hidden at its end: what appears is there while it moves in.
    node.visible = b.visible || (k < 1 && a.visible)
    const material = (node as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
    if (material?.color) {
      const start = new three.Color(a.color ?? colours.object)
      material.color.copy(start.lerp(new three.Color(b.color ?? colours.object), k))
    }
    // An outline, not a glow: a glow mixes with the object's colour, and a red that a step made red
    // to say "failed" must stay red while the step points at it.
    outlineOf(index, node).visible = b.highlight
  }
  const outlines = new Map<number, THREE.Object3D>()
  const outlineOf = (index: number, node: THREE.Object3D): THREE.Object3D => {
    let outline = outlines.get(index)
    if (outline) return outline
    const mesh = node as THREE.Mesh
    const geometry = mesh.isMesh && mesh.geometry ? new three.EdgesGeometry(mesh.geometry, 25) : new three.EdgesGeometry(new three.BoxGeometry(1, 1, 1))
    const material = new three.LineBasicMaterial({ color: highlightColour, depthTest: false, transparent: true })
    disposables.push(geometry, material)
    outline = new three.LineSegments(geometry, material)
    outline.renderOrder = 5
    outline.scale.setScalar(1.06)
    if (!mesh.isMesh) {
      const size = new three.Box3().setFromObject(node).getSize(new three.Vector3())
      outline.scale.set(size.x * 1.06, size.y * 1.06, size.z * 1.06)
    }
    outline.visible = false
    node.add(outline)
    outlines.set(index, outline)
    return outline
  }
  const applyTween = (now: number) => {
    if (tweenStart === undefined) return
    const raw = Math.min(1, (now - tweenStart) / TWEEN_MS)
    const k = raw < 0.5 ? 2 * raw * raw : 1 - (-2 * raw + 2) ** 2 / 2
    for (let i = 0; i < definition.objects.length; i++) place(i, from[i], target[i], k)
    labelsDirty = true
    if (raw >= 1) tweenStart = undefined
  }
  const goTo = (index: number, instant = false) => {
    from = target
    target = sceneStateAt(definition, index)
    tweenStart = instant ? undefined : performance.now()
    if (instant) for (let i = 0; i < definition.objects.length; i++) place(i, target[i], target[i], 1)
    labelsDirty = true
  }

  let frameId = 0
  const tick = () => {
    frameId = requestAnimationFrame(tick)
    controls.update()
    applyTween(performance.now())
    renderer.render(scene, camera)
    drawLabels()
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

  let disposed = false
  const models = definition.objects.filter((object): object is Extract<SceneObject, { shape: "model" }> => object.shape === "model")
  if (models.length > 0) {
    void import("three/examples/jsm/loaders/GLTFLoader.js").then(async ({ GLTFLoader }) => {
      const loader = new GLTFLoader()
      await Promise.all(models.map(async (object) => {
        try {
          const gltf = await loader.loadAsync(object.src)
          if (disposed) return
          const holder = fitModel(three, gltf.scene, object)
          world.add(holder)
          holder.updateMatrixWorld(true)
          const owner = definition.objects.indexOf(object)
          nodes[owner] = holder
          place(owner, target[owner], target[owner], 1)
          solids.push({ owner, node: holder, flat: false })
          addLabel(owner, object, holder)
          labelsDirty = true
        } catch (error) {
          options.onModelError?.(object, error)
        }
      }))
      // The guess made before the files arrived is replaced by what is actually on screen — unless
      // the model chose the camera itself, in which case its choice stands.
      if (disposed || definition.camera?.position) return
      const box = new three.Box3().setFromObject(world)
      if (box.isEmpty()) return
      const centre = new three.Vector3()
      box.getCenter(centre)
      const sphere = new three.Sphere()
      box.getBoundingSphere(sphere)
      frame({ center: [centre.x, centre.y, centre.z], radius: Math.max(sphere.radius, 0.5) })
    })
  }

  return {
    goTo,
    destroy() {
      disposed = true
      cancelAnimationFrame(frameId)
      observer?.disconnect()
      controls.dispose()
      for (const disposable of disposables) disposable.dispose()
      world.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (mesh.isMesh) {
          mesh.geometry?.dispose()
          const material = mesh.material
          for (const m of Array.isArray(material) ? material : [material]) m?.dispose()
        }
      })
      renderer.dispose()
      // A WebGL context is not garbage collected on its own, and a page of answers can build a lot
      // of them; without this the browser starts dropping the oldest canvas on screen.
      renderer.forceContextLoss?.()
      renderer.domElement.remove()
      overlay.remove()
    },
  }
}

export type { Vec3 }
