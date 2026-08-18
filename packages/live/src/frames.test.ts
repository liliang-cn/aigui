import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { decodeServerFrame, encodeFrame, isFrameValid } from "./frames"

const fixtures = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../fixtures/live-protocol/frames.json", import.meta.url)), "utf8"),
) as { version: number; cases: Array<{ name: string; dir: "c2s" | "s2c"; valid: boolean; frame: unknown }> }

describe("conformance fixtures", () => {
  it("are the version this package speaks", () => {
    expect(fixtures.version).toBe(1)
  })

  it.each(fixtures.cases.map((c) => [c.name, c] as const))("%s", (_name, testCase) => {
    expect(isFrameValid(testCase.frame, testCase.dir)).toBe(testCase.valid)
  })
})

describe("decodeServerFrame", () => {
  it("parses a JSON string into a typed frame", () => {
    const frame = decodeServerFrame('{"v":1,"t":"pong"}')
    expect(frame).toEqual({ v: 1, t: "pong" })
  })

  it("returns undefined for text that is not JSON", () => {
    expect(decodeServerFrame("not json")).toBeUndefined()
  })

  it("returns undefined for a frame that fails validation", () => {
    expect(decodeServerFrame('{"v":1,"t":"outcome"}')).toBeUndefined()
  })

  it("keeps an unknown frame type so the caller can ignore it deliberately", () => {
    expect(decodeServerFrame('{"v":1,"t":"future"}')).toEqual({ v: 1, t: "future" })
  })
})

describe("encodeFrame", () => {
  it("stamps the protocol version so no caller has to remember to", () => {
    expect(JSON.parse(encodeFrame({ t: "ping" }))).toEqual({ v: 1, t: "ping" })
  })

  it("encodes an action with its correlation id", () => {
    const encoded = JSON.parse(encodeFrame({ t: "action", id: "c1", action: { type: "x", params: { a: 1 } } }))
    expect(encoded).toEqual({ v: 1, t: "action", id: "c1", action: { type: "x", params: { a: 1 } } })
  })
})
