import { describe, expect, it } from "vitest"
import { derivativeAt, evaluateConstant, ExprError, isPlottable, parseExpression } from "./expr"

const at = (source: string, x: number): number => parseExpression(source)(x)

describe("parseExpression", () => {
  it("evaluates arithmetic with the usual precedence", () => {
    expect(at("1 + 2*3", 0)).toBe(7)
    expect(at("(1 + 2)*3", 0)).toBe(9)
    expect(at("x^2 - 2*x", 3)).toBe(3)
    expect(at("-x^2", 3)).toBe(-9)
  })
  it("makes ^ right-associative, as it is on paper", () => {
    expect(at("2^3^2", 0)).toBe(512)
  })
  it("knows x, pi and e", () => {
    expect(at("x", 4)).toBe(4)
    expect(at("pi", 0)).toBeCloseTo(Math.PI)
    expect(at("e", 0)).toBeCloseTo(Math.E)
  })
  it("evaluates the functions it lists", () => {
    expect(at("sin(x)", Math.PI / 2)).toBeCloseTo(1)
    expect(at("sqrt(x)", 9)).toBe(3)
    expect(at("abs(x - 1)", -2)).toBe(3)
    expect(at("ln(exp(x))", 2.5)).toBeCloseTo(2.5)
  })
})

describe("what the grammar refuses", () => {
  it("rejects implicit multiplication, and says how to write it", () => {
    // Rejected rather than guessed at: `x(x+1)` would be ambiguous with a function call, and a plot
    // that picks one reading silently is wrong in a way nobody checks.
    expect(() => parseExpression("2x")).toThrow(/write 2\*x, not 2x/)
    expect(() => parseExpression("3x^2")).toThrow(ExprError)
  })
  it("rejects a function without brackets", () => {
    expect(() => parseExpression("sin x")).toThrow(/sin needs brackets/)
  })
  it("rejects a second variable", () => {
    expect(() => parseExpression("x^2 + y")).toThrow(/unknown name y/)
  })
  it("cannot reach anything outside its own table", () => {
    expect(() => parseExpression("eval(1)")).toThrow(/unknown function eval/)
    expect(() => parseExpression("constructor")).toThrow(ExprError)
    expect(() => parseExpression("globalThis")).toThrow(ExprError)
    expect(() => parseExpression("x.constructor")).toThrow(ExprError)
  })
  it("rejects characters that are not part of the grammar", () => {
    for (const source of ["x!", "x % 2", "log_2(x)", "x;y", "$x"]) {
      expect(() => parseExpression(source), source).toThrow(ExprError)
    }
  })
  it("rejects an unbalanced or empty expression", () => {
    expect(() => parseExpression("(x + 1")).toThrow(ExprError)
    expect(() => parseExpression("")).toThrow(ExprError)
    expect(() => parseExpression("x +")).toThrow(ExprError)
  })
})

describe("isPlottable", () => {
  it("accepts a curve with a finite value somewhere on its interval", () => {
    expect(isPlottable("1/x", [-2, 2])).toBe(true)
    expect(isPlottable("sqrt(x)", [-1, 4])).toBe(true)
  })
  it("rejects one that is finite nowhere", () => {
    expect(() => isPlottable("sqrt(x)", [-4, -1])).toThrow(/never takes a finite value/)
  })
})

describe("evaluateConstant", () => {
  it("takes the intervals a question actually states", () => {
    expect(evaluateConstant("2*pi")).toBeCloseTo(2 * Math.PI)
    expect(evaluateConstant("-pi/2")).toBeCloseTo(-Math.PI / 2)
    expect(evaluateConstant(6.28)).toBe(6.28)
  })
  it("refuses anything that depends on x", () => {
    // Evaluating at NaN is the test: any use of x propagates NaN through the whole grammar.
    expect(evaluateConstant("x")).toBeUndefined()
    expect(evaluateConstant("2*x")).toBeUndefined()
    expect(evaluateConstant("sin(x)")).toBeUndefined()
  })
  it("refuses what it cannot parse", () => {
    expect(evaluateConstant("2pi")).toBeUndefined()
    expect(evaluateConstant(null)).toBeUndefined()
    expect(evaluateConstant(Number.POSITIVE_INFINITY)).toBeUndefined()
  })
})

describe("derivativeAt", () => {
  it("matches derivatives that are known exactly", () => {
    expect(derivativeAt(parseExpression("x^2"), 1)).toBeCloseTo(2, 5)
    expect(derivativeAt(parseExpression("x^2"), 3)).toBeCloseTo(6, 5)
    expect(derivativeAt(parseExpression("sin(x)"), 0)).toBeCloseTo(1, 5)
    expect(derivativeAt(parseExpression("exp(x)"), 1)).toBeCloseTo(Math.E, 4)
    expect(derivativeAt(parseExpression("sqrt(x)"), 4)).toBeCloseTo(0.25, 5)
  })
  it("stays accurate far from the origin, where a fixed step would not", () => {
    expect(derivativeAt(parseExpression("x^2"), 1e6)).toBeCloseTo(2e6, 0)
  })
  it("falls back to one side at the end of a domain", () => {
    // sqrt has no left neighbour at 0; a central difference alone would give NaN and lose the mark.
    expect(Number.isFinite(derivativeAt(parseExpression("sqrt(x)"), 0))).toBe(true)
  })
})

describe("how a sign binds", () => {
  it("makes -x^2 negative, as mathematical convention requires", () => {
    // Parsed as (-x)^2 this is +9 — a different curve, and one that looks perfectly plausible.
    expect(at("-x^2", 3)).toBe(-9)
    expect(at("-x^2", -3)).toBe(-9)
    expect(at("(-x)^2", 3)).toBe(9)
  })
  it("still allows a signed exponent", () => {
    expect(at("2^-3", 0)).toBeCloseTo(0.125)
    expect(at("x^-1", 4)).toBeCloseTo(0.25)
  })
  it("handles a sign after an operator", () => {
    expect(at("1 - -2", 0)).toBe(3)
    expect(at("2 * -3", 0)).toBe(-6)
  })
})
