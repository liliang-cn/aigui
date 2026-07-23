import { describe, expect, it } from "vitest"
import { validateJSONSchema } from "./json-schema"

describe("validateJSONSchema", () => {
  it("requires object properties to be own properties", () => {
    const schema = {
      type: "object",
      required: ["inheritedRequired"],
      properties: { inheritedRequired: { type: "string" } },
      additionalProperties: false,
    } as const
    Object.defineProperty(Object.prototype, "inheritedRequired", { value: "inherited", configurable: true })
    try {
      const result = validateJSONSchema(schema, {})

      expect(result.valid).toBe(false)
      expect(result.issues).toContain("$.inheritedRequired is required")
    } finally {
      delete (Object.prototype as { inheritedRequired?: unknown }).inheritedRequired
    }
  })

  it("accepts only plain JSON objects for object schemas", () => {
    class ValueBox {
      value = "x"
    }
    const schema = { type: "object", properties: { value: { type: "string" } } } as const

    expect(validateJSONSchema(schema, { value: "x" }).valid).toBe(true)
    expect(validateJSONSchema(schema, Object.assign(Object.create(null), { value: "x" })).valid).toBe(true)
    expect(validateJSONSchema(schema, new ValueBox()).valid).toBe(false)
    expect(validateJSONSchema(schema, new Date()).valid).toBe(false)
  })

  it("validates unknown own properties against an additionalProperties schema", () => {
    const schema = {
      type: "object",
      properties: { label: { type: "string" } },
      additionalProperties: { type: "integer", minimum: 0 },
    } as const

    expect(validateJSONSchema(schema, { label: "count", first: 1, second: 0 }).valid).toBe(true)
    expect(validateJSONSchema(schema, { label: "count", first: -1, second: "2" }).issues).toEqual([
      "$.first must be at least 0",
      "$.second must be an integer",
    ])
  })

  it("allows unknown properties when additionalProperties is true or omitted", () => {
    const value = { known: "value", unknown: { nested: true } }

    expect(validateJSONSchema({ type: "object", additionalProperties: true }, value).valid).toBe(true)
    expect(validateJSONSchema({ type: "object" }, value).valid).toBe(true)
  })

  it("compares enum and const JSON values by deep structure", () => {
    expect(validateJSONSchema({ const: { a: [1, { b: true }], c: null } }, {
      c: null,
      a: [1, { b: true }],
    }).valid).toBe(true)
    expect(validateJSONSchema({ enum: [{ a: [1, 2] }, "other"] }, { a: [1, 2] }).valid).toBe(true)
    expect(validateJSONSchema({ const: { a: [1, 2] } }, { a: [2, 1] }).valid).toBe(false)
  })

  it("handles cyclic and non-JSON enum or const values without throwing", () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const accessor: unknown[] = []
    Object.defineProperty(accessor, "0", {
      enumerable: true,
      get: () => { throw new Error("must not execute accessors") },
    })
    accessor.length = 1

    expect(() => validateJSONSchema({ const: cyclic }, cyclic)).not.toThrow()
    expect(validateJSONSchema({ const: cyclic }, cyclic).valid).toBe(false)
    expect(validateJSONSchema({ enum: [new Date(0)] }, new Date(0)).valid).toBe(false)
    expect(validateJSONSchema({ enum: [Number.NaN] }, Number.NaN).valid).toBe(false)
    expect(validateJSONSchema({ const: undefined }, undefined).valid).toBe(false)
    expect(() => validateJSONSchema({ const: accessor }, accessor)).not.toThrow()
    expect(validateJSONSchema({ const: accessor }, accessor).valid).toBe(false)
  })
})
