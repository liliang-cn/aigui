import { describe, expect, it } from "vitest"
import { resolveConfig } from "./config"

describe("resolveConfig", () => {
  it("defaults to WeChat only, so no other channel changes behaviour on install", () => {
    expect(resolveConfig(undefined).channels).toEqual(["openclaw-weixin"])
  })

  it("defaults to every block family", () => {
    expect(resolveConfig(undefined).blocks).toEqual(["chart", "mermaid", "dashboard", "card", "math", "table"])
  })

  it("carries the documented numeric defaults", () => {
    const config = resolveConfig(undefined)
    expect(config).toMatchObject({
      theme: "light",
      width: 720,
      scale: 2,
      maxImages: 6,
      timeoutMs: 10_000,
      idleShutdownMs: 300_000,
    })
  })

  it("takes operator overrides", () => {
    const config = resolveConfig({ channels: ["telegram"], theme: "dark", maxImages: 2 })
    expect(config.channels).toEqual(["telegram"])
    expect(config.theme).toBe("dark")
    expect(config.maxImages).toBe(2)
    expect(config.width).toBe(720)
  })

  it("ignores junk rather than failing a reply", () => {
    const config = resolveConfig({ channels: "telegram", theme: "chartreuse", maxImages: -4 } as never)
    expect(config.channels).toEqual(["openclaw-weixin"])
    expect(config.theme).toBe("light")
    expect(config.maxImages).toBe(6)
  })

  it("accepts an unknown channel id without complaint", () => {
    expect(resolveConfig({ channels: ["some-future-channel"] }).channels).toEqual(["some-future-channel"])
  })
})
