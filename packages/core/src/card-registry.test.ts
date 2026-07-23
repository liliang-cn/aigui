import { describe, expect, it } from "vitest"
import { CardRegistry } from "./card-registry"

const flight = {
  type: "flight",
  description: "flight info",
  schema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
  example: { title: "Tokyo to Osaka" },
}

describe("CardRegistry", () => {
  it("parses complete JSON after register", () => {
    const r = new CardRegistry()
    r.register(flight)
    expect(r.parse("flight", '{"title":"x"}')).toMatchObject({ data: { title: "x" }, complete: true, valid: true })
  })
  it("incomplete JSON -> complete=false", () => {
    const r = new CardRegistry()
    r.register(flight)
    expect(r.parse("flight", '{"title":"x"').complete).toBe(false)
  })
  it("missing required field -> valid=false", () => {
    const r = new CardRegistry()
    r.register(flight)
    expect(r.parse("flight", '{"other":1}').valid).toBe(false)
  })
  it("unregistered type -> valid=false", () => {
    const r = new CardRegistry()
    expect(r.parse("nope", "{}").valid).toBe(false)
  })
  it("toPromptSpec contains type name and description", () => {
    const r = new CardRegistry()
    r.register(flight)
    const spec = r.toPromptSpec()
    expect(spec).toContain("flight")
    expect(spec).toContain("flight info")
    expect(spec).toContain("card:flight")
  })
  it("toJSONSchema aggregates all cards", () => {
    const r = new CardRegistry()
    r.register(flight)
    expect(r.toJSONSchema().properties).toHaveProperty("flight")
  })
  it("treats a throwing custom validator as invalid instead of throwing", () => {
    const r = new CardRegistry()
    r.register({ type: "unsafe", description: "x", validate: () => { throw new Error("bad validator") } })
    expect(r.parse("unsafe", "{}")).toEqual({ data: {}, complete: true, valid: false })
  })
  it("returns no prompt spec for an empty registry", () => {
    expect(new CardRegistry().toPromptSpec()).toBe("")
  })
})
