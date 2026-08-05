import { describe, expect, it } from "vitest"
import { imageOf, refract } from "./optics"

describe("imageOf", () => {
  it("puts a real image behind a convex lens, inverted", () => {
    // u = 30, f = 10 → v = 15: the textbook case of an object beyond 2F.
    const image = imageOf("convex-lens", 10, 30, 4)
    expect(image.v).toBeCloseTo(15)
    expect(image.x).toBeCloseTo(15)
    expect(image.real).toBe(true)
    expect(image.inverted).toBe(true)
    expect(image.magnification).toBeCloseTo(-0.5)
    expect(image.height).toBeCloseTo(-2)
  })
  it("gives an upright enlarged virtual image inside the focal length", () => {
    // The magnifying glass. Getting this upright is the whole point of the figure.
    const image = imageOf("convex-lens", 10, 6, 3)
    expect(image.v).toBeCloseTo(-15)
    expect(image.x).toBeCloseTo(-15)
    expect(image.real).toBe(false)
    expect(image.inverted).toBe(false)
    expect(Math.abs(image.magnification)).toBeGreaterThan(1)
  })
  it("gives the same size at twice the focal length", () => {
    const image = imageOf("convex-lens", 10, 20, 4)
    expect(image.v).toBeCloseTo(20)
    expect(Math.abs(image.magnification)).toBeCloseTo(1)
  })
  it("reports no image when the object sits at the focus", () => {
    expect(imageOf("convex-lens", 10, 10, 4).atInfinity).toBe(true)
  })
  it("always gives a concave lens an upright, reduced, virtual image", () => {
    for (const u of [4, 18, 40]) {
      const image = imageOf("concave-lens", -12, u, 4)
      expect(image.real, `u=${u}`).toBe(false)
      expect(image.inverted, `u=${u}`).toBe(false)
      expect(Math.abs(image.magnification), `u=${u}`).toBeLessThan(1)
    }
  })
  it("puts a concave mirror's real image in front of it, not behind", () => {
    // A mirror sends light back the way it came. Placing this image behind the mirror is the error
    // the sign of `x` exists to prevent, and the figure would look reasonable either way.
    const image = imageOf("concave-mirror", 15, 25, 4)
    expect(image.v).toBeCloseTo(37.5)
    expect(image.x).toBeCloseTo(-37.5)
    expect(image.real).toBe(true)
  })
  it("gives a convex mirror an upright reduced virtual image behind it — the wing mirror", () => {
    const image = imageOf("convex-mirror", -10, 20, 4)
    expect(image.x).toBeGreaterThan(0)
    expect(image.real).toBe(false)
    expect(image.inverted).toBe(false)
    expect(Math.abs(image.magnification)).toBeLessThan(1)
  })
  it("mirrors a plane mirror's image at the same distance and size", () => {
    const image = imageOf("plane-mirror", 0, 8, 5)
    expect(image.x).toBeCloseTo(8)
    expect(image.height).toBeCloseTo(5)
    expect(image.real).toBe(false)
  })
})

describe("refract", () => {
  it("bends toward the normal entering a denser medium", () => {
    const result = refract(1, 1.5, 45)
    expect(result.refraction).toBeCloseTo(28.13, 1)
    expect(result.totalInternalReflection).toBe(false)
    expect(result.critical).toBeUndefined()
  })
  it("bends away from the normal leaving a denser medium", () => {
    const result = refract(1.33, 1, 40)
    expect(result.refraction!).toBeGreaterThan(40)
    expect(result.critical).toBeCloseTo(48.75, 1)
  })
  it("finds total internal reflection past the critical angle", () => {
    // Glass to air: the critical angle is arcsin(1/1.5) ≈ 41.8°, so 50° cannot get out.
    const result = refract(1.5, 1, 50)
    expect(result.totalInternalReflection).toBe(true)
    expect(result.refraction).toBeUndefined()
    expect(result.critical).toBeCloseTo(41.81, 1)
  })
  it("passes light through just below the critical angle", () => {
    expect(refract(1.5, 1, 41).totalInternalReflection).toBe(false)
  })
  it("leaves a normal ray undeviated", () => {
    expect(refract(1, 1.5, 0).refraction).toBeCloseTo(0)
  })
})
