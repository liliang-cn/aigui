/**
 * A small, total expression evaluator for `y = f(x)`.
 *
 * This is the one piece of machinery a function block needs that no other plugin has. `eval` is not an option — the string comes
 * from a model — so this is a recursive-descent parser over a fixed grammar with a fixed function
 * table, and nothing outside that table can be reached.
 */

const FUNCTIONS: Record<string, (value: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  exp: Math.exp, ln: Math.log, log: Math.log10, log2: Math.log2,
  sqrt: Math.sqrt, abs: Math.abs, sign: Math.sign,
  floor: Math.floor, ceil: Math.ceil, round: Math.round,
}
const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E }

interface Token {
  type: string
  value?: number | string
  at: number
}

/** A parsed expression, ready to evaluate at any x. */
export type CompiledExpression = (x: number) => number

export class ExprError extends Error {}

/** Split the source into numbers, names, operators and brackets — rejecting any other character. */
function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < source.length) {
    const c = source[i]
    if (/\s/.test(c)) { i++; continue }
    if (/[0-9.]/.test(c)) {
      const m = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(source.slice(i))
      if (!m) throw new ExprError(`malformed number at ${i}`)
      tokens.push({ type: "number", value: Number(m[0]), at: i })
      i += m[0].length
      continue
    }
    if (/[a-zA-Z]/.test(c)) {
      const m = /^[a-zA-Z][a-zA-Z0-9]*/.exec(source.slice(i))!
      tokens.push({ type: "name", value: m[0], at: i })
      i += m[0].length
      continue
    }
    if ("+-*/^(),".includes(c)) {
      tokens.push({ type: c, at: i })
      i++
      continue
    }
    throw new ExprError(`"${c}" is not allowed in an expression`)
  }
  return tokens
}

/**
 * Parse into a closure over x.
 *
 * Implicit multiplication is rejected rather than guessed at. `2x` and `sin x` are what a person
 * writes and what a model reaches for, but `x(x+1)` is then ambiguous with a function call, and a
 * plot that silently interprets one as the other is wrong in a way nobody checks. Requiring `2*x`
 * makes the model's intent explicit, and whether it complies is exactly what the probe measures.
 */
export function parseExpression(source: string): CompiledExpression {
  const tokens = tokenize(source)
  let pos = 0
  const peek = (): Token | undefined => tokens[pos]
  const eat = (type: string) => {
    if (tokens[pos]?.type !== type) throw new ExprError(`expected ${type} at ${tokens[pos]?.at ?? source.length}`)
    return tokens[pos++]
  }

  function primary(): CompiledExpression {
    const token = peek()
    if (!token) throw new ExprError("expression ends early")
    if (token.type === "number") { pos++; const value = token.value as number; return () => value }
    if (token.type === "(") {
      pos++
      const inner = additive()
      eat(")")
      return inner
    }
    if (token.type === "name") {
      pos++
      const name = token.value as string
      if (peek()?.type === "(") {
        // `Object.hasOwn`, never `in` or a bare lookup: `in` walks the prototype chain, so
        // `constructor`, `toString` and `__proto__` all answer yes and a model's expression reaches
        // Object.prototype. Nothing there is callable as maths, but nothing there should be
        // reachable either.
        const fn = Object.hasOwn(FUNCTIONS, name) ? FUNCTIONS[name] : undefined
        if (!fn) throw new ExprError(`unknown function ${name}`)
        pos++
        const argument = additive()
        eat(")")
        return (x) => fn(argument(x))
      }
      if (name === "x") return (x) => x
      if (Object.hasOwn(CONSTANTS, name)) { const value = CONSTANTS[name]; return () => value }
      if (Object.hasOwn(FUNCTIONS, name)) throw new ExprError(`${name} needs brackets: write ${name}(x)`)
      throw new ExprError(`unknown name ${name} — only x, pi, e and the listed functions exist`)
    }
    throw new ExprError(`unexpected ${token.type} at ${token.at}`)
  }

  function power(): CompiledExpression {
    const base = primary()
    if (peek()?.type === "^") {
      pos++
      // Right-associative, and the exponent may be signed: x^2^3 is x^(2^3) and 2^-3 is a third.
      const exponent = unary()
      return (x) => Math.pow(base(x), exponent(x))
    }
    return base
  }

  /**
   * A sign binds looser than a power, which is what makes `-x^2` negative.
   *
   * Parsed the other way round it is `(-x)^2`, a different curve entirely — and one that looks
   * perfectly reasonable on screen, so nobody would catch it.
   */
  function unary(): CompiledExpression {
    const type = peek()?.type
    if (type === "-") { pos++; const value = unary(); return (x) => -value(x) }
    if (type === "+") { pos++; return unary() }
    return power()
  }

  function multiplicative(): CompiledExpression {
    let left = unary()
    for (;;) {
      const type = peek()?.type
      if (type === "*") { pos++; const right = unary(); const l = left; left = (x) => l(x) * right(x) }
      else if (type === "/") { pos++; const right = unary(); const l = left; left = (x) => l(x) / right(x) }
      // A name or number or bracket sitting where an operator belongs is implicit multiplication.
      else if (type === "name" || type === "number" || type === "(") {
        throw new ExprError(`missing operator before "${peek()?.value ?? "("}" — write 2*x, not 2x`)
      }
      else return left
    }
  }

  function additive(): CompiledExpression {
    let left = multiplicative()
    for (;;) {
      const type = peek()?.type
      if (type === "+") { pos++; const right = multiplicative(); const l = left; left = (x) => l(x) + right(x) }
      else if (type === "-") { pos++; const right = multiplicative(); const l = left; left = (x) => l(x) - right(x) }
      else return left
    }
  }

  const fn = additive()
  if (pos !== tokens.length) throw new ExprError(`unexpected trailing "${source.slice(tokens[pos]!.at)}"`)
  return fn
}

/** Whether an expression parses and produces a finite value somewhere on the interval. */
export function isPlottable(source: string, [from, to]: [number, number] = [-5, 5]): boolean {
  const fn = parseExpression(source)
  let finite = 0
  for (let i = 0; i <= 40; i++) {
    const value = fn(from + ((to - from) * i) / 40)
    if (Number.isFinite(value)) finite++
  }
  if (finite === 0) throw new ExprError("never takes a finite value on its domain")
  return true
}

/**
 * Evaluate a constant expression such as `"2*pi"` or `"-pi/2"`.
 *
 * A trigonometry question states its interval as [0, 2π], and a protocol that only takes numbers
 * forces the model to write 6.283185 — unnatural, lossy, and one more place for it to do the
 * arithmetic that the renderer exists to do. Evaluating at NaN is what proves the expression is
 * constant: any use of x propagates NaN through every operation in the grammar.
 */
export function evaluateConstant(source: unknown): number | undefined {
  if (typeof source === "number") return Number.isFinite(source) ? source : undefined
  if (typeof source !== "string") return undefined
  let value: number
  try {
    value = parseExpression(source)(Number.NaN)
  } catch {
    return undefined
  }
  return Number.isFinite(value) ? value : undefined
}

/**
 * The slope of `f` at `x`, by central difference.
 *
 * This is what keeps the model's calculus out of the picture. Asked for the tangent at a point, it
 * supplies the point; the slope is measured here, so an answer that mis-differentiates still draws
 * the right line. The step is scaled to the magnitude of x — a fixed h loses all its significant
 * digits once x is large.
 */
export function derivativeAt(fn: CompiledExpression, x: number): number {
  const h = Math.cbrt(Number.EPSILON) * Math.max(1, Math.abs(x))
  const slope = (fn(x + h) - fn(x - h)) / (2 * h)
  if (Number.isFinite(slope)) return slope
  // One-sided where the curve stops, so an endpoint still gets a tangent.
  const forward = (fn(x + h) - fn(x)) / h
  return Number.isFinite(forward) ? forward : (fn(x) - fn(x - h)) / h
}
