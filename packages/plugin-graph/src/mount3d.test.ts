// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { palette } from "./palette"
import { parseGraph } from "./parse"
import type { GraphDefinition } from "./types"

/**
 * three.js needs a WebGL context jsdom does not have, so the engine is replaced by the smallest
 * set of classes the renderer touches. What is tested is the plumbing around the engine: that the
 * canvas lands in the host, that the layout is placed, that teardown disposes everything and
 * releases the context, and that a page without WebGL is refused before the engine is loaded.
 */
const dispose = vi.fn()
const forceContextLoss = vi.fn()
const setSize = vi.fn()
const render = vi.fn()

class Vec {
  x = 0
  y = 0
  z = 0
  set(x: number, y = x, z = x) {
    this.x = x
    this.y = y
    this.z = z
    return this
  }
  setScalar(v: number) {
    return this.set(v, v, v)
  }
  copy(v: Vec) {
    return this.set(v.x, v.y, v.z)
  }
}
class Object3D {
  position = new Vec()
  scale = new Vec()
  children: Object3D[] = []
  userData: Record<string, unknown> = {}
  renderOrder = 0
  add(child: Object3D) {
    this.children.push(child)
  }
}
class Attribute {
  count: number
  needsUpdate = false
  constructor(public array: Float32Array, public itemSize: number) {
    this.count = array.length / itemSize
  }
  setXYZ(i: number, x: number, y: number, z: number) {
    this.array[i * 3] = x
    this.array[i * 3 + 1] = y
    this.array[i * 3 + 2] = z
  }
}
class Geometry {
  attributes = new Map<string, Attribute>()
  setAttribute(name: string, attribute: Attribute) {
    this.attributes.set(name, attribute)
  }
  getAttribute(name: string) {
    return this.attributes.get(name)
  }
  dispose = dispose
}
class Material {
  emissive = { set: vi.fn() }
  dispose = dispose
  constructor(public params: Record<string, unknown> = {}) {}
}
class Mesh extends Object3D {
  constructor(public geometry: Geometry, public material: Material) {
    super()
  }
}
class LineSegments extends Mesh {
  computeLineDistances = vi.fn()
}

vi.mock("three", () => ({
  Scene: Object3D,
  Group: Object3D,
  Mesh,
  LineSegments,
  Sprite: class extends Object3D {
    constructor(public material: Material) {
      super()
    }
  },
  SphereGeometry: Geometry,
  BufferGeometry: Geometry,
  Float32BufferAttribute: Attribute,
  MeshStandardMaterial: Material,
  MeshBasicMaterial: Material,
  LineBasicMaterial: Material,
  LineDashedMaterial: Material,
  SpriteMaterial: Material,
  CanvasTexture: class {
    dispose = dispose
  },
  Color: class {
    r = 0.5
    g = 0.5
    b = 0.5
  },
  Vector2: Vec,
  Vector3: Vec,
  HemisphereLight: Object3D,
  DirectionalLight: Object3D,
  Raycaster: class {
    setFromCamera = vi.fn()
    intersectObjects = vi.fn(() => [])
  },
  PerspectiveCamera: class extends Object3D {
    aspect = 1
    updateProjectionMatrix = vi.fn()
  },
  WebGLRenderer: class {
    domElement = document.createElement("canvas")
    setPixelRatio = vi.fn()
    setSize = setSize
    render = render
    dispose = dispose
    forceContextLoss = forceContextLoss
  },
}))
vi.mock("three/examples/jsm/controls/OrbitControls.js", () => ({
  OrbitControls: class {
    enableDamping = false
    autoRotate = false
    autoRotateSpeed = 0
    minDistance = 0
    maxDistance = 0
    update = vi.fn()
    dispose = dispose
  },
}))

const def = (raw: unknown): GraphDefinition => {
  const parsed = parseGraph(JSON.stringify(raw))
  if (!parsed.ok) throw new Error(parsed.error.message)
  return parsed.value
}
const ZOO = def({
  classes: [{ id: "Animal" }, { id: "Dog", subClassOf: "Animal" }, { id: "Food" }],
  properties: [{ id: "eats", domain: "Animal", range: "Food" }],
  entities: [{ id: "rex", name: "Rex", type: "Dog" }, { id: "bone", name: "Bone", type: "Food" }, { id: "rock" }],
  relations: [{ from: "rex", to: "bone", type: "eats" }, { from: "bone", to: "rex", type: "eats" }, { from: "rock", to: "rex" }],
  focus: "rex",
})

const getContext = HTMLCanvasElement.prototype.getContext
beforeEach(() => {
  vi.clearAllMocks()
  HTMLCanvasElement.prototype.getContext = vi.fn((kind: string) => (kind === "2d" ? null : {})) as never
})
afterEach(() => {
  HTMLCanvasElement.prototype.getContext = getContext
})

describe("mount3d", () => {
  it("draws into the host and places every node", async () => {
    const { mount3d } = await import("./render3d")
    const host = document.createElement("div")
    const handle = await mount3d(host, ZOO, "instances", { palette: palette("dark"), height: 400, labelBudget: 20, rotate: true })
    expect(host.querySelector("canvas")).not.toBeNull()
    expect(host.querySelector("[data-aigui-graph-tip]")).not.toBeNull()
    expect(setSize).toHaveBeenCalledWith(640, 400)
    expect(render).toHaveBeenCalled()
    handle.destroy()
  })

  it("disposes everything and releases the WebGL context when torn down, once", async () => {
    const { mount3d } = await import("./render3d")
    const host = document.createElement("div")
    const handle = await mount3d(host, ZOO, "ontology", { palette: palette("light"), height: 300, labelBudget: 20, rotate: false })
    handle.destroy()
    handle.destroy()
    expect(forceContextLoss).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalled()
    expect(host.querySelector("canvas")).toBeNull()
  })

  it("refuses a page without WebGL before touching the engine", async () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never
    const { mount3d } = await import("./render3d")
    const host = document.createElement("div")
    await expect(mount3d(host, ZOO, "instances", { palette: palette("light"), height: 300, labelBudget: 20, rotate: true })).rejects.toThrow("WebGL")
    expect(host.querySelector("canvas")).toBeNull()
  })
})
