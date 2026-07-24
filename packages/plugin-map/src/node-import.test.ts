import { describe, expect, it, vi } from "vitest"

describe("node import", () => {
  it("does not import Leaflet while loading the package", async () => {
    vi.resetModules()
    const loaded = vi.fn()
    vi.doMock("leaflet", () => { loaded(); return {} })
    await import("./index")
    expect(loaded).not.toHaveBeenCalled()
  })
})
