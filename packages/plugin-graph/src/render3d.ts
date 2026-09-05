import type * as THREE from "three"
import { createLayout } from "./layout"
import { checkRelations, classColour, instanceGraph, ontologyGraph, propertyColour, type LayerGraph } from "./ontology"
import type { Palette } from "./palette"
import { degrees, labelled } from "./render2d"
import { createTooltip } from "./tooltip"
import type { EntityDef, GraphDefinition, GraphLayer } from "./types"

/**
 * The graph as a model you look at, rather than a picture you look down on.
 *
 * Three.js is imported when a 3D graph is actually drawn, never when the plugin is installed: a
 * page whose answers contain no 3D graph should not carry a 3D engine. The layout is the same
 * spring–electrical simulation as the 2D figure, one dimension further, and it is stepped in the
 * frame loop so the reader watches the graph pull itself apart into shape rather than being
 * handed a settled picture. Spheres for nodes, one line-segments object for the edges (a second,
 * dashed and red, for the relations that break the ontology), canvas sprites for the labels, and
 * OrbitControls to turn it.
 */
let threePromise: Promise<typeof THREE> | null = null
const loadThree = () => (threePromise ??= import("three"))

export interface Mount3dOptions {
  palette: Palette
  height: number
  labelBudget: number
  rotate: boolean
  onEntityClick?: (entity: EntityDef) => void
}

export interface Mounted3d {
  destroy(): void
}

/** The radius the normalised layout is scaled to, in world units. Everything else follows from it. */
const RADIUS = 10
const FOV = 45
const MIN_NODE = 0.18
const MAX_NODE = 0.6

/** How many layout steps are spent per frame: fewer as the graph grows, so drawing keeps its share. */
function chunk(n: number): number {
  return Math.max(1, Math.min(8, Math.round(600 / Math.max(1, n))))
}

function reducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** A word drawn beside a node, as a sprite so it always faces the reader. */
function labelSprite(three: typeof THREE, text: string, colour: string, disposables: Array<{ dispose(): void }>): THREE.Sprite {
  const height = 64
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  const font = "600 36px ui-sans-serif, system-ui, sans-serif"
  let width = height * 3
  if (context) {
    context.font = font
    width = Math.max(height, Math.ceil(context.measureText(text).width) + 24)
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
  const material = new three.SpriteMaterial({ map: texture, depthTest: false, transparent: true })
  disposables.push(texture, material)
  const sprite = new three.Sprite(material)
  const scale = 0.9
  sprite.scale.set((scale * width) / height, scale, 1)
  sprite.renderOrder = 10
  return sprite
}

/** Refuse before three.js does, with an error the chrome can act on: no WebGL, no 3D. */
function assertWebGL(): void {
  const probe = document.createElement("canvas")
  const context = probe.getContext("webgl2") ?? probe.getContext("webgl")
  if (!context) throw new Error("WebGL is not available")
}

/** Build and draw one layer into `host`, returning the teardown the chrome will call. */
export async function mount3d(host: HTMLElement, def: GraphDefinition, layer: GraphLayer, options: Mount3dOptions): Promise<Mounted3d> {
  assertWebGL()
  const three = await loadThree()
  const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js")
  const c = options.palette
  const disposables: Array<{ dispose(): void }> = []

  const graph: LayerGraph = layer === "ontology" ? ontologyGraph(def) : instanceGraph(def)
  const ids = graph.nodes.map((node) => node.id)
  const index = new Map(ids.map((id, i) => [id, i]))
  const layout = createLayout(graph.nodes, graph.links, { dimensions: 3 })
  const settled = reducedMotion()
  if (settled) layout.step(layout.steps)

  const holder = document.createElement("div")
  holder.setAttribute("data-aigui-graph-canvas", "")
  host.appendChild(holder)
  const width = holder.clientWidth || 640
  const height = options.height

  const scene = new three.Scene()
  const world = new three.Group()
  scene.add(world)

  // Sizes: by degree within this layer (or by value on the instance layer), as in 2D.
  const degree = new Map<string, number>(ids.map((id) => [id, 0]))
  for (const link of graph.links) {
    for (const id of [link.from, link.to]) degree.set(id, (degree.get(id) ?? 0) + 1)
  }
  const maxDegree = Math.max(1, ...degree.values())
  const values = new Map(def.entities.map((entity) => [entity.id, entity.value]))
  const hasValues = layer === "instances" && def.entities.some((entity) => entity.value !== undefined)
  const maxValue = Math.max(1e-9, ...def.entities.map((entity) => entity.value ?? 0))
  const radiusOf = (id: string): number => {
    const weight = hasValues ? (values.get(id) ?? 0) / maxValue : (degree.get(id) ?? 0) / maxDegree
    return MIN_NODE + (MAX_NODE - MIN_NODE) * Math.sqrt(Math.max(0, weight))
  }
  const colourOf = (id: string): string => {
    if (layer === "ontology") return classColour(def, id, c)
    return classColour(def, def.entities.find((entity) => entity.id === id)?.type, c)
  }

  const sphere = new three.SphereGeometry(1, 20, 14)
  disposables.push(sphere)
  const materials = new Map<string, THREE.MeshStandardMaterial>()
  const materialFor = (colour: string): THREE.MeshStandardMaterial => {
    let material = materials.get(colour)
    if (!material) {
      material = new three.MeshStandardMaterial({ color: colour, roughness: 0.55, metalness: 0.05 })
      materials.set(colour, material)
      disposables.push(material)
    }
    return material
  }
  const meshes: THREE.Mesh[] = ids.map((id) => {
    const mesh = new three.Mesh(sphere, materialFor(colourOf(id)))
    mesh.scale.setScalar(radiusOf(id))
    mesh.userData.id = id
    world.add(mesh)
    return mesh
  })
  let focusRing: THREE.Mesh | undefined
  if (def.focus !== undefined && index.has(def.focus)) {
    const ring = new three.MeshBasicMaterial({ color: c.focus, transparent: true, opacity: 0.35 })
    disposables.push(ring)
    focusRing = new three.Mesh(sphere, ring)
    focusRing.scale.setScalar(radiusOf(def.focus) * 1.6)
    world.add(focusRing)
  }

  // Edges: one geometry for the sound ones, coloured per vertex, and one dashed red geometry for
  // the relations that break the ontology.
  const violated = layer === "instances" ? new Set(checkRelations(def).map((violation) => violation.relation)) : new Set<number>()
  const sound: number[] = []
  const broken: number[] = []
  const soundColours: number[] = []
  graph.links.forEach((link, i) => {
    const a = index.get(link.from)
    const b = index.get(link.to)
    if (a === undefined || b === undefined || a === b) return
    if (violated.has(i)) {
      broken.push(a, b)
      return
    }
    sound.push(a, b)
    const colour = new three.Color(link.type === "subClassOf" ? c.muted : propertyColour(def, link.type, c))
    soundColours.push(colour.r, colour.g, colour.b, colour.r, colour.g, colour.b)
  })
  const soundGeometry = new three.BufferGeometry()
  soundGeometry.setAttribute("position", new three.Float32BufferAttribute(new Float32Array(sound.length * 3), 3))
  soundGeometry.setAttribute("color", new three.Float32BufferAttribute(new Float32Array(soundColours), 3))
  const soundMaterial = new three.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7 })
  const soundLines = new three.LineSegments(soundGeometry, soundMaterial)
  disposables.push(soundGeometry, soundMaterial)
  world.add(soundLines)
  const brokenGeometry = new three.BufferGeometry()
  brokenGeometry.setAttribute("position", new three.Float32BufferAttribute(new Float32Array(broken.length * 3), 3))
  const brokenMaterial = new three.LineDashedMaterial({ color: c.violation, dashSize: 0.35, gapSize: 0.25, transparent: true, opacity: 0.95 })
  const brokenLines = new three.LineSegments(brokenGeometry, brokenMaterial)
  disposables.push(brokenGeometry, brokenMaterial)
  if (broken.length > 0) world.add(brokenLines)

  // Labels for the best-connected nodes and the focus; every class on the ontology layer.
  const named = layer === "ontology" ? new Set(ids) : labelled(def, options.labelBudget)
  const nameOf = (id: string): string =>
    layer === "ontology" ? def.classes.find((cls) => cls.id === id)?.name ?? id : def.entities.find((entity) => entity.id === id)?.name ?? id
  const sprites = new Map<number, THREE.Sprite>()
  for (const id of named) {
    const i = index.get(id)
    if (i === undefined) continue
    const sprite = labelSprite(three, nameOf(id), c.text, disposables)
    sprites.set(i, sprite)
    world.add(sprite)
  }

  scene.add(new three.HemisphereLight("#ffffff", "#334155", 1.4))
  const key = new three.DirectionalLight("#ffffff", 1.2)
  key.position.set(RADIUS * 2, RADIUS * 3, RADIUS * 2)
  scene.add(key)

  const camera = new three.PerspectiveCamera(FOV, width / height, 0.1, RADIUS * 20)
  const distance = (RADIUS * 1.35) / Math.tan((FOV / 2) * (Math.PI / 180))
  camera.position.set(distance * 0.45, distance * 0.35, distance * 0.82)
  const renderer = new three.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2))
  renderer.setSize(width, height)
  holder.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.autoRotate = options.rotate && !settled
  controls.autoRotateSpeed = 0.8
  controls.minDistance = RADIUS * 0.5
  controls.maxDistance = distance * 3

  const tip = createTooltip(holder, def, layer)
  const raycaster = new three.Raycaster()
  const pointer = new three.Vector2()
  let hovered: THREE.Mesh | undefined
  const pick = (event: PointerEvent): THREE.Mesh | undefined => {
    const box = renderer.domElement.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return undefined
    pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    const hit = raycaster.intersectObjects(meshes, false)[0]
    return hit?.object as THREE.Mesh | undefined
  }
  const onMove = (event: PointerEvent): void => {
    const mesh = pick(event)
    if (mesh !== hovered) {
      hovered = mesh
      for (const m of meshes) (m.material as THREE.MeshStandardMaterial).emissive?.set?.(0x000000)
    }
    if (!mesh) {
      tip.hide()
      return
    }
    tip.show(mesh.userData.id as string, event.clientX, event.clientY)
  }
  const onLeave = (): void => {
    hovered = undefined
    tip.hide()
  }
  let downAt: [number, number] | undefined
  const onDown = (event: PointerEvent): void => {
    downAt = [event.clientX, event.clientY]
  }
  const onUp = (event: PointerEvent): void => {
    if (!downAt || layer === "ontology" || !options.onEntityClick) return
    const moved = Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1])
    downAt = undefined
    if (moved > 3) return
    const mesh = pick(event)
    const entity = mesh ? def.entities.find((e) => e.id === mesh.userData.id) : undefined
    if (entity) options.onEntityClick(entity)
  }
  renderer.domElement.addEventListener("pointermove", onMove)
  renderer.domElement.addEventListener("pointerleave", onLeave)
  renderer.domElement.addEventListener("pointerdown", onDown)
  renderer.domElement.addEventListener("pointerup", onUp)

  // Every frame: a few layout steps while it settles, then the positions copied into the meshes,
  // the line buffers and the sprites.
  const soundPositions = soundGeometry.getAttribute("position") as THREE.BufferAttribute
  const brokenPositions = brokenGeometry.getAttribute("position") as THREE.BufferAttribute
  let placedOnce = false
  const place = (): void => {
    const p = layout.positions()
    meshes.forEach((mesh, i) => mesh.position.set(p[i * 3] * RADIUS, p[i * 3 + 1] * RADIUS, p[i * 3 + 2] * RADIUS))
    if (focusRing && def.focus !== undefined) focusRing.position.copy(meshes[index.get(def.focus)!].position)
    for (let e = 0; e < sound.length; e++) {
      const i = sound[e]
      soundPositions.setXYZ(e, p[i * 3] * RADIUS, p[i * 3 + 1] * RADIUS, p[i * 3 + 2] * RADIUS)
    }
    soundPositions.needsUpdate = true
    for (let e = 0; e < broken.length; e++) {
      const i = broken[e]
      brokenPositions.setXYZ(e, p[i * 3] * RADIUS, p[i * 3 + 1] * RADIUS, p[i * 3 + 2] * RADIUS)
    }
    brokenPositions.needsUpdate = true
    if (broken.length > 0) brokenLines.computeLineDistances()
    for (const [i, sprite] of sprites) {
      const mesh = meshes[i]
      sprite.position.set(mesh.position.x, mesh.position.y + radiusOf(ids[i]) + 0.55, mesh.position.z)
    }
    placedOnce = true
  }

  let frameId = 0
  const steps = chunk(ids.length)
  const tick = (): void => {
    frameId = requestAnimationFrame(tick)
    if (!layout.done) {
      layout.step(steps)
      place()
    } else if (!placedOnce) {
      place()
    }
    controls.update()
    renderer.render(scene, camera)
  }
  place()
  if (typeof requestAnimationFrame === "function") tick()
  else renderer.render(scene, camera)

  const resize = (): void => {
    const next = holder.clientWidth || width
    camera.aspect = next / height
    camera.updateProjectionMatrix()
    renderer.setSize(next, height)
  }
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(resize)
  observer?.observe(holder)

  let disposed = false
  return {
    destroy() {
      if (disposed) return
      disposed = true
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frameId)
      observer?.disconnect()
      renderer.domElement.removeEventListener("pointermove", onMove)
      renderer.domElement.removeEventListener("pointerleave", onLeave)
      renderer.domElement.removeEventListener("pointerdown", onDown)
      renderer.domElement.removeEventListener("pointerup", onUp)
      controls.dispose()
      for (const disposable of disposables) disposable.dispose()
      renderer.dispose()
      // A WebGL context is not garbage collected on its own, and a page of answers can build a
      // lot of them; without this the browser starts dropping the oldest canvas on screen.
      renderer.forceContextLoss?.()
      holder.remove()
    },
  }
}
