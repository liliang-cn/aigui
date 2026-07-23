import type { JSONSchema } from "./types"

export interface JSONSchemaValidationResult {
  valid: boolean
  issues: string[]
}

/** Small, dependency-free validator for the JSON Schema subset used by AIGUI definitions. */
export function validateJSONSchema(schema: JSONSchema, value: unknown): JSONSchemaValidationResult {
  const issues: string[] = []
  validate(schema, value, "$", issues)
  return { valid: issues.length === 0, issues }
}

function validate(schema: JSONSchema, value: unknown, path: string, issues: string[]): void {
  if (Object.hasOwn(schema, "const") && !jsonEqual(value, schema.const)) {
    issues.push(`${path} must equal ${describeJSONValue(schema.const)}`)
    return
  }
  if (schema.enum && !schema.enum.some((candidate) => jsonEqual(candidate, value))) {
    issues.push(`${path} must be one of the allowed values`)
    return
  }

  if (schema.type === "object") {
    if (!isJSONObject(value)) {
      issues.push(`${path} must be an object`)
      return
    }
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) issues.push(`${path}.${required} is required`)
    }
    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, key)) validate(childSchema, value[key], `${path}.${key}`, issues)
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties ?? {}))
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) issues.push(`${path}.${key} is not allowed`)
      }
    } else if (typeof schema.additionalProperties === "object" && schema.additionalProperties !== null) {
      const allowed = new Set(Object.keys(schema.properties ?? {}))
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) validate(schema.additionalProperties, value[key], `${path}.${key}`, issues)
      }
    }
    return
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      issues.push(`${path} must be an array`)
      return
    }
    if (schema.minItems !== undefined && value.length < schema.minItems) issues.push(`${path} must contain at least ${schema.minItems} items`)
    if (schema.maxItems !== undefined && value.length > schema.maxItems) issues.push(`${path} must contain at most ${schema.maxItems} items`)
    if (schema.items) value.forEach((item, index) => validate(schema.items as JSONSchema, item, `${path}[${index}]`, issues))
    return
  }

  if (schema.type === "string") {
    if (typeof value !== "string") {
      issues.push(`${path} must be a string`)
      return
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) issues.push(`${path} must contain at least ${schema.minLength} characters`)
    if (schema.maxLength !== undefined && value.length > schema.maxLength) issues.push(`${path} must contain at most ${schema.maxLength} characters`)
    if (schema.pattern !== undefined) {
      try {
        if (!new RegExp(schema.pattern).test(value)) issues.push(`${path} must match ${schema.pattern}`)
      } catch {
        issues.push(`${path} has an invalid schema pattern`)
      }
    }
    return
  }

  if (schema.type === "number" || schema.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value) || (schema.type === "integer" && !Number.isInteger(value))) {
      issues.push(`${path} must be ${schema.type === "integer" ? "an integer" : "a number"}`)
      return
    }
    if (schema.minimum !== undefined && value < schema.minimum) issues.push(`${path} must be at least ${schema.minimum}`)
    if (schema.maximum !== undefined && value > schema.maximum) issues.push(`${path} must be at most ${schema.maximum}`)
    return
  }

  if (schema.type === "boolean" && typeof value !== "boolean") issues.push(`${path} must be a boolean`)
  if (schema.type === "null" && value !== null) issues.push(`${path} must be null`)
}

function isJSONObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  if (Object.getOwnPropertySymbols(value).length > 0) return false
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(
    (descriptor) => descriptor.enumerable && "value" in descriptor,
  )
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return compareJSON(left, right, new WeakSet<object>(), new WeakSet<object>())
}

function compareJSON(
  left: unknown,
  right: unknown,
  leftPath: WeakSet<object>,
  rightPath: WeakSet<object>,
): boolean {
  if (left === null || right === null) return left === right
  if (typeof left !== typeof right) return false
  if (typeof left === "string" || typeof left === "boolean") return left === right
  if (typeof left === "number") {
    return Number.isFinite(left) && Number.isFinite(right) && left === right
  }
  if (typeof left !== "object" || typeof right !== "object") return false
  if (leftPath.has(left) || rightPath.has(right)) return false

  const leftArray = Array.isArray(left)
  if (leftArray !== Array.isArray(right)) return false
  if (leftArray) {
    if (!isJSONArray(left as unknown[]) || !isJSONArray(right as unknown[])) return false
  } else if (!isJSONObject(left) || !isJSONObject(right)) return false

  leftPath.add(left)
  rightPath.add(right)
  try {
    if (leftArray) {
      const rightArray = right as unknown[]
      if (left.length !== rightArray.length) return false
      for (let index = 0; index < left.length; index++) {
        if (!compareJSON(left[index], rightArray[index], leftPath, rightPath)) return false
      }
      return true
    }

    const leftRecord = left as Record<string, unknown>
    const rightRecord = right as Record<string, unknown>
    const leftKeys = Object.keys(leftRecord)
    const rightKeys = Object.keys(rightRecord)
    if (leftKeys.length !== rightKeys.length) return false
    for (const key of leftKeys) {
      if (!Object.hasOwn(rightRecord, key)) return false
      if (!compareJSON(leftRecord[key], rightRecord[key], leftPath, rightPath)) return false
    }
    return true
  } finally {
    leftPath.delete(left)
    rightPath.delete(right)
  }
}

function describeJSONValue(value: unknown): string {
  try {
    const serialized = JSON.stringify(value)
    return serialized === undefined ? "a valid JSON value" : serialized
  } catch {
    return "a valid JSON value"
  }
}

function isJSONArray(value: unknown[]): boolean {
  if (Object.getOwnPropertySymbols(value).length > 0) return false
  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (key === "length") continue
    if (!isArrayIndex(key) || !descriptor.enumerable || !("value" in descriptor)) return false
  }
  return Object.keys(value).length === value.length
}

function isArrayIndex(key: string): boolean {
  const index = Number(key)
  return Number.isInteger(index) && index >= 0 && index < 2 ** 32 - 1 && String(index) === key
}
