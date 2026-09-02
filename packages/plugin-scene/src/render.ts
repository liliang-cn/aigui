import type * as THREE from "three"
import { DEFAULT_VIEW, centerOf, framingDistance, halfExtents, sceneBounds } from "./bounds"
import type { Bounds, SceneDefinition, SceneObject, Vec3 } from "./types"

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
  sky: string
  ground: string
}

/** A scene has to read against the page it is on; lit for a light page it glares on a dark one. */
export function palette(theme?: string): Palette {
  return theme === "dark"
    ? { object: "#94a3b8", grid: "#3f3f46", gridCenter: "#71717a", label: "#fafafa", sky: "#e2e8f0", ground: "#1e293b" }
    : { object: "#64748b", grid: "#d4d4d8", gridCenter: "#a1a1aa", label: "#18181b", sky: "#ffffff", ground: "#94a3b8" }
}

const DEG = Math.PI / 180

function geometryFor(three: typeof THREE, object: SceneObject): THREE.BufferGeometry | undefined {
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

/** A word drawn beside an object, as a sprite so it always faces the reader. */
function labelSprite(three: typeof THREE, text: string, colour: string, scaleBy: number): THREE.Sprite {
  const height = 96
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  const font = "600 56px ui-sans-serif, system-ui, sans-serif"
  let width = height * 2
  if (context) {
    context.font = font
    width = Math.max(height, Math.ceil(context.measureText(text).width) + 32)
  }
  canvas.width = width
  canvas.height = height
  if (context) {
    context.fillStyle = colour
    context.font = font
    context.textAlign = "center"
    context.textBaseline = "middle"
    context.fillText(text, width / 2, height / 2)
  }
  const texture = new three.CanvasTexture(canvas)
  const sprite = new three.Sprite(new three.SpriteMaterial({ map: texture, depthTest: false, transparent: true }))
  sprite.scale.set((scaleBy * width) / height, scaleBy, 1)
  sprite.renderOrder = 10
  return sprite
}

function placeAt(object3d: THREE.Object3D, object: SceneObject): void {
  const [x, y, z] = centerOf(object)
  object3d.position.set(x, y, z)
  const [rx, ry, rz] = object.rotation ?? [0, 0, 0]
  object3d.rotation.set(rx * DEG, ry * DEG, rz * DEG)
}

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
  const labelScale = Math.max(bounds.radius * 0.12, 0.08)

  for (const object of definition.objects) {
    if (object.shape === "model") continue
    const geometry = geometryFor(three, object)
    if (!geometry) continue
    const material = materialFor(three, object, colours)
    disposables.push(geometry, material)
    const mesh = new three.Mesh(geometry, material)
    placeAt(mesh, object)
    world.add(mesh)
    if (object.label) world.add(labelFor(three, object, colours.label, labelScale, disposables))
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

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.autoRotate = definition.autoRotate === true
  controls.autoRotateSpeed = 1.2

  const frame = (fit: Bounds) => {
    const target = definition.camera?.target ?? fit.center
    const distance = framingDistance(fit, fov, camera.aspect)
    if (definition.camera?.position) {
      camera.position.set(...definition.camera.position)
    } else {
      camera.position.set(...DEFAULT_VIEW).normalize().multiplyScalar(distance).add(new three.Vector3(...target))
    }
    controls.target.set(...target)
    controls.minDistance = fit.radius * 0.5
    controls.maxDistance = distance * 4
    controls.update()
  }
  frame(bounds)

  let frameId = 0
  const tick = () => {
    frameId = requestAnimationFrame(tick)
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
          if (object.label) world.add(labelFor(three, object, colours.label, labelScale, disposables))
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
    },
  }
}

function labelFor(three: typeof THREE, object: SceneObject, colour: string, scaleBy: number, disposables: Array<{ dispose(): void }>): THREE.Sprite {
  const sprite = labelSprite(three, object.label ?? "", colour, scaleBy)
  const [x, y, z] = centerOf(object)
  sprite.position.set(x, y + halfExtents(object)[1] + scaleBy * 0.9, z)
  disposables.push(sprite.material.map!, sprite.material)
  return sprite
}

export type { Vec3 }
