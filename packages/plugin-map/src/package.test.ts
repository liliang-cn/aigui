import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import packageJSON from "../package.json"

describe("package surface", () => {
  it("exports and publishes the standalone stylesheet", () => {
    expect(packageJSON.exports["./style.css"]).toBe("./style.css")
    expect(packageJSON.files).toContain("style.css")
    const css = readFileSync(fileURLToPath(new URL("../style.css", import.meta.url)), "utf8")
    expect(css).toContain('leaflet/dist/leaflet.css')
    expect(css).toContain("data-aigui-map-canvas")
  })

  it("does not import CSS from JavaScript", () => {
    const source = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8")
    expect(source).not.toMatch(/import\s+["'][^"']+\.css["']/)
  })
})
