import { describe, expect, it } from "vitest"
import { parsePartialJSON } from "./partial-json"

describe("parsePartialJSON", () => {
  it("parses complete object, complete=true", () => {
    expect(parsePartialJSON('{"a":1}')).toEqual({ data: { a: 1 }, complete: true })
  })
  it("completes unclosed object", () => {
    expect(parsePartialJSON('{"a":1')).toEqual({ data: { a: 1 }, complete: false })
  })
  it("completes unclosed string", () => {
    expect(parsePartialJSON('{"title":"tok')).toEqual({ data: { title: "tok" }, complete: false })
  })
  it("drops trailing incomplete key/value", () => {
    expect(parsePartialJSON('{"a":1,"b"')).toEqual({ data: { a: 1 }, complete: false })
  })
  it("drops trailing dangling value position", () => {
    expect(parsePartialJSON('{"a":1,"price":')).toEqual({ data: { a: 1 }, complete: false })
  })
  it("completes nested array and object", () => {
    expect(parsePartialJSON('{"items":[{"id":1},{"id":2')).toEqual({
      data: { items: [{ id: 1 }, { id: 2 }] },
      complete: false,
    })
  })
  it("empty string returns undefined data", () => {
    expect(parsePartialJSON("")).toEqual({ data: undefined, complete: false })
  })
  it("unparseable input returns undefined without throwing", () => {
    expect(parsePartialJSON("not json at all")).toEqual({ data: undefined, complete: false })
  })
  it("recovers prior fields when trailing boolean is incomplete", () => {
    expect(parsePartialJSON('{"title":"hello","done":tru')).toEqual({ data: { title: "hello" }, complete: false })
  })
  it("recovers prior fields when trailing null is incomplete", () => {
    expect(parsePartialJSON('{"a":1,"x":nul')).toEqual({ data: { a: 1 }, complete: false })
  })
  it("recovers prior fields when trailing number is incomplete (exponent)", () => {
    expect(parsePartialJSON('{"a":1,"price":1.5e-')).toEqual({ data: { a: 1 }, complete: false })
  })
  it("recovers prior array items when trailing literal is incomplete", () => {
    expect(parsePartialJSON('[1,2,tru')).toEqual({ data: [1, 2], complete: false })
  })
  it("keeps a complete trailing literal value", () => {
    expect(parsePartialJSON('{"a":true')).toEqual({ data: { a: true }, complete: false })
  })
  it("keeps a complete trailing number value", () => {
    expect(parsePartialJSON('{"a":12')).toEqual({ data: { a: 12 }, complete: false })
  })
})
