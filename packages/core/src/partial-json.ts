export interface PartialJSONResult {
  data: unknown
  complete: boolean
}

/**
 * Parse a possibly-incomplete JSON string, as produced by a streaming source.
 *
 * If the input is valid JSON, it is returned with `complete: true`. Otherwise
 * the parser attempts to repair the fragment by dropping any trailing
 * incomplete token (a dangling key, colon, or comma) and auto-closing unclosed
 * strings, objects, and arrays, returning whatever data has arrived so far with
 * `complete: false`. Unparseable input yields `{ data: undefined, complete: false }`
 * and never throws.
 */
export function parsePartialJSON(input: string): PartialJSONResult {
  const str = input.trim()
  if (str === "") return { data: undefined, complete: false }
  try {
    return { data: JSON.parse(str), complete: true }
  } catch {
    // Fall through to repair.
  }
  const repaired = repair(str)
  if (repaired !== null) {
    try {
      return { data: JSON.parse(repaired), complete: false }
    } catch {
      // Fall through.
    }
  }
  return { data: undefined, complete: false }
}

type Container = "obj" | "arr"
// Parser mode describing what token is expected next.
type Mode = "value" | "objKey" | "objColon" | "afterValue"

const LITERAL_CHAR = /[0-9a-zA-Z+.\-]/
const WHITESPACE = /\s/

function repair(str: string): string | null {
  const stack: Container[] = []
  let inString = false
  let escaped = false
  let stringIsKey = false
  let inLiteral = false
  let mode: Mode = "value"
  // Last index (exclusive) where the prefix ends on a complete value or an
  // empty container, i.e. a point where truncating and auto-closing is safe.
  let lastGoodEnd = -1

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]

    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') {
        inString = false
        if (stringIsKey) {
          mode = "objColon"
        } else {
          mode = "afterValue"
          lastGoodEnd = i + 1
        }
      }
      continue
    }

    if (inLiteral) {
      if (LITERAL_CHAR.test(ch)) continue
      // The literal ended just before this delimiter character.
      inLiteral = false
      mode = "afterValue"
      lastGoodEnd = i
      // Fall through to process the current delimiter character.
    }

    if (WHITESPACE.test(ch)) continue

    if (ch === "}" || ch === "]") {
      stack.pop()
      mode = "afterValue"
      lastGoodEnd = i + 1
      continue
    }

    switch (mode) {
      case "value":
        if (ch === "{") {
          stack.push("obj")
          mode = "objKey"
          lastGoodEnd = i + 1
        } else if (ch === "[") {
          stack.push("arr")
          mode = "value"
          lastGoodEnd = i + 1
        } else if (ch === '"') {
          inString = true
          stringIsKey = false
        } else {
          // Start of a number or a literal (true/false/null).
          inLiteral = true
        }
        break
      case "objKey":
        if (ch === '"') {
          inString = true
          stringIsKey = true
        }
        // Anything else here is malformed; ignored and caught by JSON.parse.
        break
      case "objColon":
        if (ch === ":") mode = "value"
        break
      case "afterValue":
        if (ch === ",") {
          mode = stack[stack.length - 1] === "obj" ? "objKey" : "value"
        }
        // Anything else here is malformed; ignored and caught by JSON.parse.
        break
    }
  }

  // An unclosed value string: keep the received characters and close it.
  if (inString && !stringIsKey) {
    return closeContainers(str + '"', stack)
  }
  // An unclosed trailing literal (e.g. a number) is assumed complete: keep it.
  if (inLiteral) {
    return closeContainers(str, stack)
  }
  // Otherwise truncate back to the last safe point, dropping any dangling
  // key/colon/comma, then auto-close the open containers.
  if (lastGoodEnd === -1) return null
  return closeContainers(str.slice(0, lastGoodEnd), stack)
}

function closeContainers(body: string, stack: Container[]): string {
  let out = body.replace(/,\s*$/, "")
  for (let i = stack.length - 1; i >= 0; i--) {
    out += stack[i] === "obj" ? "}" : "]"
  }
  return out
}
