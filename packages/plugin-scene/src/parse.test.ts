import { describe, expect, it } from "vitest"
import { modelOriginAllowed, parseScene } from "./parse"

const box = (extra: Record<string, unknown> = {}) => ({ shape: "box", size: [1, 2, 3], ...extra })
const scene = (objects: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({ objects, ...extra })

const fail = (source: string, options?: Parameters<typeof parseScene>[1]): string => {
  const result = parseScene(source, options)
  if (result.ok) throw new Error("expected the scene to be refused")
  return result.error.message
}

describe("parseScene", () => {
  it("accepts every primitive with its own size fields", () => {
    const result = parseScene(scene([
      box(),
      { shape: "sphere", radius: 1 },
      { shape: "cylinder", radius: 1, height: 2, radiusTop: 0.5 },
      { shape: "cone", radius: 1, height: 2 },
      { shape: "torus", radius: 1, tube: 0.2 },
      { shape: "capsule", radius: 0.3, height: 1 },
      { shape: "plane", size: [4, 4] },
    ]))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.definition.objects.map((o) => o.shape)).toEqual(["box", "sphere", "cylinder", "cone", "torus", "capsule", "plane"])
  })
  it("keeps placement, appearance and the caption", () => {
    const result = parseScene(scene([box({ position: [1, 2, 3], rotation: [0, 45, 0], anchor: "bottom", color: "#FF0000", opacity: 0.5, material: "metal", wireframe: true, label: "crate" })], {
      camera: { position: [5, 5, 5], target: [0, 1, 0] },
      grid: false,
      autoRotate: true,
      caption: "one crate",
    }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const [object] = result.value.definition.objects
    expect(object).toMatchObject({ position: [1, 2, 3], rotation: [0, 45, 0], anchor: "bottom", color: "#ff0000", opacity: 0.5, material: "metal", wireframe: true, label: "crate" })
    expect(result.value.definition).toMatchObject({ camera: { position: [5, 5, 5], target: [0, 1, 0] }, grid: false, autoRotate: true, caption: "one crate" })
  })
  it("refuses a field this protocol does not offer rather than drawing without it", () => {
    // A model that wrote `texture` wanted something; dropping it quietly draws the wrong picture.
    expect(fail(scene([box({ texture: "wood.png" })]))).toContain("texture is not a field of a box")
    expect(fail(scene([box()], { lights: [] }))).toContain("lights is not a field")
    expect(fail(scene([{ shape: "sphere", radius: 1, size: [1, 1, 1] }]))).toContain("size is not a field of a sphere")
  })
  it("says which shape and which size is missing", () => {
    expect(fail(scene([{ shape: "box" }]))).toContain("box needs size [width, height, depth]")
    expect(fail(scene([{ shape: "cylinder", radius: 1 }]))).toContain("cylinder needs a positive height")
    expect(fail(scene([{ shape: "torus", radius: 1 }]))).toContain("torus needs a positive tube")
    expect(fail(scene([{ shape: "plane", size: [1, 2, 3] }]))).toContain("plane needs size [width, depth]")
    expect(fail(scene([{ shape: "blob", radius: 1 }]))).toContain("shape must be one of")
  })
  it("lets a cone or cylinder be faceted, within reason", () => {
    const result = parseScene(scene([{ shape: "cone", radius: 1, height: 1, sides: 4 }, { shape: "cylinder", radius: 1, height: 1, sides: 6 }]))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.definition.objects.map((o) => "sides" in o && o.sides)).toEqual([4, 6])
    expect(fail(scene([{ shape: "cone", radius: 1, height: 1, sides: 2 }]))).toContain("sides must be a whole number from 3 to 64")
    expect(fail(scene([{ shape: "cylinder", radius: 1, height: 1, sides: 4.5 }]))).toContain("sides must be a whole number")
    expect(fail(scene([{ shape: "sphere", radius: 1, sides: 4 }]))).toContain("sides is not a field of a sphere")
  })
  it("refuses a colour it cannot name back", () => {
    expect(fail(scene([box({ color: "浅蓝" })]))).toContain("color must be a hex colour")
    expect(fail(scene([box({ color: "#12345" })]))).toContain("color must be a hex colour")
    expect(parseScene(scene([box({ color: "Wheat" })])).ok).toBe(true)
  })
  it("refuses out-of-range and mis-typed appearance fields", () => {
    expect(fail(scene([box({ opacity: 1.5 })]))).toContain("opacity must be between 0 and 1")
    expect(fail(scene([box({ material: "wood" })]))).toContain("material must be matte, metal or glass")
    expect(fail(scene([box({ anchor: "top" })]))).toContain("anchor must be center or bottom")
    expect(fail(scene([box({ rotation: [0, 90] })]))).toContain("rotation must be [x, y, z]")
    expect(fail(scene([box({ position: [0, "1", 0] })]))).toContain("position must be [x, y, z]")
  })
  it("refuses an empty, oversized or non-array objects list", () => {
    expect(fail(scene([]))).toContain("objects must be a non-empty array")
    expect(fail(JSON.stringify({ objects: {} }))).toContain("objects must be a non-empty array")
    expect(fail(scene(Array.from({ length: 3 }, () => box())), { maxObjects: 2 })).toContain("more than 2")
  })
  it("refuses a fence that is not JSON, not an object, or too large", () => {
    expect(parseScene("not json")).toMatchObject({ ok: false, error: { code: "invalid-json" } })
    expect(fail("[1,2]")).toContain("must be a JSON object")
    expect(parseScene(scene([box()]), { maxSourceBytes: 10 })).toMatchObject({ ok: false, error: { code: "too-large" } })
  })
  it("checks the camera's shape", () => {
    expect(fail(scene([box()], { camera: { position: [0, 0] } }))).toContain("camera.position must be [x, y, z]")
    expect(fail(scene([box()], { camera: { fov: 30 } }))).toContain("camera.fov is not a field")
    expect(fail(scene([box()], { camera: "auto" }))).toContain("camera must be an object")
  })
})

describe("model objects", () => {
  const model = (src: string, extra: Record<string, unknown> = {}) => scene([{ shape: "model", src, ...extra }])
  const allowed = { allowedModelOrigins: ["https://assets.example.com"] }

  it("is refused when the host allowed no origin, and says so", () => {
    // A URL in a fence is a URL the model wrote; the page fetches nothing on a model's say-so.
    const result = parseScene(model("https://assets.example.com/chair.glb"))
    expect(result).toMatchObject({ ok: false, error: { code: "invalid-definition" } })
    if (!result.ok) expect(result.error.message).toContain("disabled")
  })
  it("drops only the model from a scene that has other objects, and reports it", () => {
    // The table the model built is still worth showing; the note under it says what is missing.
    const result = parseScene(scene([box(), { shape: "model", src: "https://assets.example.com/chair.glb" }]))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.definition.objects).toHaveLength(1)
    expect(result.value.refused).toEqual([{ index: 1, src: "https://assets.example.com/chair.glb", message: expect.stringContaining("disabled") }])
  })
  it("loads from an allowed origin and keeps the normalised URL", () => {
    const result = parseScene(model("https://assets.example.com/models/chair.glb?v=2", { size: 0.9, anchor: "bottom" }), allowed)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.definition.objects[0]).toMatchObject({ shape: "model", src: "https://assets.example.com/models/chair.glb?v=2", size: 0.9 })
      expect(result.value.refused).toEqual([])
    }
  })
  it("matches the origin exactly, not as a prefix or a suffix", () => {
    expect(fail(model("https://assets.example.com.evil.net/chair.glb"), allowed)).toContain("may not be loaded from https://assets.example.com.evil.net")
    expect(fail(model("https://evil.net/assets.example.com/chair.glb"), allowed)).toContain("may not be loaded from https://evil.net")
    expect(fail(model("https://assets.example.com:8443/chair.glb"), allowed)).toContain("may not be loaded")
  })
  it("insists on https without credentials", () => {
    expect(fail(model("http://assets.example.com/chair.glb"), allowed)).toContain("must use https")
    expect(fail(model("https://user:pw@assets.example.com/chair.glb"), allowed)).toContain("credentials")
    expect(fail(model("/chair.glb"), allowed)).toContain("absolute URL")
    expect(fail(model("javascript:alert(1)"), allowed)).toContain("must use https")
  })
  it("tolerates a sloppily written allowlist entry", () => {
    const sloppy = { allowedModelOrigins: ["https://assets.example.com/models/"] }
    expect(parseScene(model("https://assets.example.com/chair.glb"), sloppy).ok).toBe(true)
    expect(modelOriginAllowed("https://assets.example.com/x.glb", ["not a url"]).ok).toBe(false)
  })
  it("checks size like any other length", () => {
    expect(fail(model("https://assets.example.com/chair.glb", { size: -1 }), allowed)).toContain("size must be a positive length")
    expect(fail(scene([{ shape: "model" }]), allowed)).toContain("model needs a src URL")
  })
})
