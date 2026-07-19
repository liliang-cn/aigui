import { describe, expect, it } from "vitest"
import type { RenderOutput } from "./types"

describe("RenderOutput mount kind", () => {
  it("accepts a mount variant returning a cleanup", () => {
    const cleanup = () => {}
    const out: RenderOutput = { kind: "mount", mount: (el) => { void el; return cleanup } }
    expect(out.kind).toBe("mount")
    if (out.kind === "mount") {
      const el = {} as unknown as HTMLElement
      expect(out.mount(el)).toBe(cleanup)
    }
  })
  it("accepts a mount variant returning void", () => {
    const out: RenderOutput = { kind: "mount", mount: () => {} }
    expect(out.kind).toBe("mount")
  })
})
