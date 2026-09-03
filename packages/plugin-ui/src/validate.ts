import { UIDocumentError, UILimitError } from "./errors"
import { resolveUILimits } from "./limits"
import type {
  UIActionRuntime, UIBoundJSON, UICardRegistry, UIDocument, UIFieldNode, UILimits, UINode, UIScalar, UIScalarExpression, UIValidationOptions,
} from "./types"

const SAFE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/
const SAFE_STATE_KEY = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"])
const DOCUMENT_KEYS = set("version", "id", "state", "root")
const BASE_KEYS = ["kind", "id"]
const NODE_KEYS: Record<string, Set<string>> = {
  stack: set(...BASE_KEYS, "direction", "gap", "align", "children"),
  grid: set(...BASE_KEYS, "columns", "gap", "children"),
  text: set(...BASE_KEYS, "text", "tone"),
  heading: set(...BASE_KEYS, "level", "text"),
  divider: set(...BASE_KEYS),
  list: set(...BASE_KEYS, "ordered", "items"),
  table: set(...BASE_KEYS, "caption", "headers", "rows"),
  keyValue: set(...BASE_KEYS, "items"),
  form: set(...BASE_KEYS, "children", "submit", "submitLabel"),
  field: set(...BASE_KEYS, "bind", "fieldType", "label", "required", "placeholder", "minLength", "maxLength", "pattern", "min", "max", "options"),
  button: set(...BASE_KEYS, "label", "variant", "action"),
  card: set(...BASE_KEYS, "type", "data"),
}
const GAPS = new Set(["none", "sm", "md", "lg"])
const ALIGNS = new Set(["start", "center", "end", "stretch"])
const TONES = new Set(["default", "muted", "positive", "warning", "critical"])
const FIELD_TYPES = new Set(["text", "textarea", "number", "date", "select", "checkbox", "radio"])

interface Context {
  registry: UICardRegistry
  actionRuntime: UIActionRuntime
  limits: UILimits
  state: Record<string, UIScalar>
  ids: Set<string>
  nodes: number
  totalStrings: number
  issues: string[]
}

export function parseUIDocument(source: string, options: UIValidationOptions): UIDocument {
  if (typeof source !== "string") throw new UIDocumentError(["UI source must be a string."])
  const limits = resolveUILimits(options.limits)
  if (new TextEncoder().encode(source).byteLength > limits.sourceBytes) throw new UILimitError("UI source exceeds the byte limit.")
  let value: unknown
  try { value = JSON.parse(source) } catch { throw new UIDocumentError(["UI source must be valid JSON."]) }
  return validateUIDocument(value, { ...options, limits })
}

export function validateUIDocument(value: unknown, options: UIValidationOptions): UIDocument {
  if (!options?.registry || !options?.actionRuntime) throw new TypeError("UI validation requires registry and actionRuntime.")
  const limits = resolveUILimits(options.limits)
  assertSafeGraph(value)
  if (!isPlainObject(value)) throw new UIDocumentError(["UI document must be a plain object."])
  const issues: string[] = []
  rejectKeys(value, DOCUMENT_KEYS, "$", issues)
  if (value.version !== 1) issues.push("$.version must be 1.")
  const id = readString(value.id, "$.id", issues, limits)
  if (id && !SAFE_ID.test(id)) issues.push("$.id is not a safe id.")
  const state: Record<string, UIScalar> = Object.create(null)
  if (value.state !== undefined) {
    if (!isPlainObject(value.state)) issues.push("$.state must be a plain object.")
    else {
      const entries = Object.entries(value.state)
      if (entries.length > limits.state) issues.push(`$.state exceeds ${limits.state} entries.`)
      for (const [key, scalar] of entries) {
        if (DANGEROUS_KEYS.has(key) || !SAFE_STATE_KEY.test(key)) issues.push(`$.state.${key} is not a safe state key.`)
        if (!isScalar(scalar)) issues.push(`$.state.${key} must be a scalar.`)
        else state[key] = scalar
      }
    }
  }
  const ctx: Context = { registry: options.registry, actionRuntime: options.actionRuntime, limits, state, ids: new Set(), nodes: 0, totalStrings: 0, issues }
  const root = validateNode(value.root, "$.root", 1, false, ctx)
  if (issues.length || !id || !root) throw new UIDocumentError(issues.length ? issues : ["Invalid UI document."])
  return value as unknown as UIDocument
}

function validateNode(value: unknown, path: string, depth: number, insideForm: boolean, ctx: Context): UINode | undefined {
  if (depth > ctx.limits.depth) { ctx.issues.push(`${path} exceeds maximum depth.`); return undefined }
  if (++ctx.nodes > ctx.limits.nodes) { ctx.issues.push(`UI exceeds ${ctx.limits.nodes} nodes.`); return undefined }
  if (!isPlainObject(value)) { ctx.issues.push(`${path} must be a plain object.`); return undefined }
  const kind = typeof value.kind === "string" ? value.kind : ""
  const allowed = NODE_KEYS[kind]
  if (!allowed) { ctx.issues.push(`${path}.kind is not supported.`); return undefined }
  rejectKeys(value, allowed, path, ctx.issues)
  const id = readString(value.id, `${path}.id`, ctx.issues, ctx.limits)
  if (id) {
    if (!SAFE_ID.test(id)) ctx.issues.push(`${path}.id is not safe.`)
    if (ctx.ids.has(id)) ctx.issues.push(`${path}.id must be unique.`)
    ctx.ids.add(id)
  }

  switch (kind) {
    case "stack":
      optionalEnum(value.direction, ["row", "column"], `${path}.direction`, ctx.issues)
      optionalEnum(value.gap, GAPS, `${path}.gap`, ctx.issues)
      optionalEnum(value.align, ALIGNS, `${path}.align`, ctx.issues)
      validateChildren(value.children, path, depth, insideForm, ctx)
      break
    case "grid":
      if (![1, 2, 3, 4].includes(value.columns as number)) ctx.issues.push(`${path}.columns must be 1, 2, 3, or 4.`)
      optionalEnum(value.gap, GAPS, `${path}.gap`, ctx.issues)
      validateChildren(value.children, path, depth, insideForm, ctx)
      break
    case "text":
      validateScalarExpression(value.text, `${path}.text`, ctx)
      optionalEnum(value.tone, TONES, `${path}.tone`, ctx.issues)
      break
    case "heading":
      if (![2, 3, 4].includes(value.level as number)) ctx.issues.push(`${path}.level must be 2, 3, or 4.`)
      validateScalarExpression(value.text, `${path}.text`, ctx)
      break
    case "divider": break
    case "list":
      if (value.ordered !== undefined && typeof value.ordered !== "boolean") ctx.issues.push(`${path}.ordered must be boolean.`)
      if (!Array.isArray(value.items)) ctx.issues.push(`${path}.items must be an array.`)
      else value.items.forEach((item, index) => { if (!isScalar(item)) ctx.issues.push(`${path}.items[${index}] must be a scalar.`); else countScalar(item, ctx, `${path}.items[${index}]`) })
      break
    case "table": validateTable(value, path, ctx); break
    case "keyValue": validateKeyValue(value, path, ctx); break
    case "form":
      if (insideForm) ctx.issues.push(`${path} cannot nest a form.`)
      validateActionType(value.submit, `${path}.submit`, ctx)
      if (value.submitLabel !== undefined) readString(value.submitLabel, `${path}.submitLabel`, ctx.issues, ctx.limits)
      validateChildren(value.children, path, depth, true, ctx)
      break
    case "field": validateField(value, path, insideForm, ctx); break
    case "button":
      readString(value.label, `${path}.label`, ctx.issues, ctx.limits)
      optionalEnum(value.variant, ["primary", "secondary", "danger"], `${path}.variant`, ctx.issues)
      validateAction(value.action, `${path}.action`, ctx)
      break
    case "card": {
      const type = readString(value.type, `${path}.type`, ctx.issues, ctx.limits)
      validateBoundJSON(value.data, `${path}.data`, ctx)
      if (type && !ctx.registry.get(type)) ctx.issues.push(`${path}.type is not registered.`)
      else if (type) {
        try { if (!ctx.registry.validate(type, resolveBoundJSON(value.data as UIBoundJSON, ctx.state))) ctx.issues.push(`${path}.data is invalid for card type "${type}".`) }
        catch { ctx.issues.push(`${path}.data is invalid.`) }
      }
      break
    }
  }
  return value as unknown as UINode
}

function validateChildren(value: unknown, path: string, depth: number, insideForm: boolean, ctx: Context): void {
  if (!Array.isArray(value)) { ctx.issues.push(`${path}.children must be an array.`); return }
  if (value.length > ctx.limits.children) ctx.issues.push(`${path}.children exceeds ${ctx.limits.children} items.`)
  value.forEach((child, index) => validateNode(child, `${path}.children[${index}]`, depth + 1, insideForm, ctx))
}

function validateTable(value: Record<string, unknown>, path: string, ctx: Context): void {
  // Optional, like every other decorative string in this file — submitLabel and
  // pattern are both guarded the same way. It was the one that was not, so a
  // table written without a caption failed the whole document, and a model that
  // read "table: caption, headers[], rows[][]" as a list of fields it may use
  // had no way to know the first one was compulsory.
  if (value.caption !== undefined) readString(value.caption, `${path}.caption`, ctx.issues, ctx.limits, true)
  if (!Array.isArray(value.headers) || value.headers.length > ctx.limits.tableColumns) ctx.issues.push(`${path}.headers must contain at most ${ctx.limits.tableColumns} strings.`)
  else value.headers.forEach((header, index) => readString(header, `${path}.headers[${index}]`, ctx.issues, ctx.limits, true))
  if (!Array.isArray(value.rows) || value.rows.length > ctx.limits.tableRows) ctx.issues.push(`${path}.rows must contain at most ${ctx.limits.tableRows} rows.`)
  else value.rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row) || !Array.isArray(value.headers) || row.length !== value.headers.length) ctx.issues.push(`${path}.rows[${rowIndex}] must match header width.`)
    else row.forEach((cell, cellIndex) => { if (!isScalar(cell)) ctx.issues.push(`${path}.rows[${rowIndex}][${cellIndex}] must be a scalar.`); else countScalar(cell, ctx, `${path}.rows[${rowIndex}][${cellIndex}]`) })
  })
}

function validateKeyValue(value: Record<string, unknown>, path: string, ctx: Context): void {
  if (!Array.isArray(value.items)) { ctx.issues.push(`${path}.items must be an array.`); return }
  value.items.forEach((item, index) => {
    const itemPath = `${path}.items[${index}]`
    if (!isPlainObject(item)) { ctx.issues.push(`${itemPath} must be a plain object.`); return }
    rejectKeys(item, set("label", "value"), itemPath, ctx.issues)
    readString(item.label, `${itemPath}.label`, ctx.issues, ctx.limits)
    validateScalarExpression(item.value, `${itemPath}.value`, ctx)
  })
}

function validateField(value: Record<string, unknown>, path: string, insideForm: boolean, ctx: Context): void {
  if (!insideForm) ctx.issues.push(`${path} must be inside a form.`)
  const field = value as unknown as UIFieldNode
  const bind = readString(value.bind, `${path}.bind`, ctx.issues, ctx.limits)
  const type = readString(value.fieldType, `${path}.fieldType`, ctx.issues, ctx.limits)
  readString(value.label, `${path}.label`, ctx.issues, ctx.limits)
  if (bind && !Object.hasOwn(ctx.state, bind)) ctx.issues.push(`${path}.bind must reference declared state.`)
  if (type && !FIELD_TYPES.has(type)) ctx.issues.push(`${path}.fieldType is unsupported.`)
  if (value.required !== undefined && typeof value.required !== "boolean") ctx.issues.push(`${path}.required must be boolean.`)
  if (value.placeholder !== undefined) readString(value.placeholder, `${path}.placeholder`, ctx.issues, ctx.limits, true)
  const minLength = optionalNonNegativeInteger(value.minLength, `${path}.minLength`, ctx.issues)
  const maxLength = optionalNonNegativeInteger(value.maxLength, `${path}.maxLength`, ctx.issues)
  const min = optionalFiniteNumber(value.min, `${path}.min`, ctx.issues)
  const max = optionalFiniteNumber(value.max, `${path}.max`, ctx.issues)
  if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) ctx.issues.push(`${path}.minLength cannot exceed maxLength.`)
  if (min !== undefined && max !== undefined && min > max) ctx.issues.push(`${path}.min cannot exceed max.`)
  let pattern: string | undefined
  if (value.pattern !== undefined) {
    pattern = readString(value.pattern, `${path}.pattern`, ctx.issues, { ...ctx.limits, string: Math.min(ctx.limits.string, 128) })
    if (pattern && !isSafePattern(pattern)) ctx.issues.push(`${path}.pattern uses unsupported regular expression features.`)
    else if (pattern) { try { new RegExp(pattern) } catch { ctx.issues.push(`${path}.pattern is invalid.`) } }
  }
  validateOptions(value.options, path, ctx)
  if (bind && type && Object.hasOwn(ctx.state, bind) && !compatibleState(type, ctx.state[bind])) ctx.issues.push(`${path}.bind has an incompatible initial value.`)
  if (type === "number" && (minLength !== undefined || maxLength !== undefined || pattern !== undefined || value.options !== undefined || value.placeholder !== undefined)) ctx.issues.push(`${path} has constraints unsupported by number fields.`)
  if ((type === "select" || type === "radio") && (!Array.isArray(value.options) || minLength !== undefined || maxLength !== undefined || pattern !== undefined || min !== undefined || max !== undefined || value.placeholder !== undefined)) ctx.issues.push(`${path} has invalid choice-field properties.`)
  if (type === "checkbox" && (value.options !== undefined || minLength !== undefined || maxLength !== undefined || pattern !== undefined || min !== undefined || max !== undefined || value.placeholder !== undefined)) ctx.issues.push(`${path} has invalid checkbox properties.`)
  if (type === "date" && (value.options !== undefined || minLength !== undefined || maxLength !== undefined || pattern !== undefined || min !== undefined || max !== undefined)) ctx.issues.push(`${path} has invalid date properties.`)
  if ((type === "text" || type === "textarea") && (value.options !== undefined || min !== undefined || max !== undefined)) ctx.issues.push(`${path} has invalid string-field properties.`)
  void field
}

function validateOptions(value: unknown, path: string, ctx: Context): void {
  if (value === undefined) return
  if (!Array.isArray(value) || value.length === 0 || value.length > ctx.limits.options) { ctx.issues.push(`${path}.options must be a non-empty bounded array.`); return }
  const seen = new Set<string>()
  value.forEach((option, index) => {
    const optionPath = `${path}.options[${index}]`
    if (!isPlainObject(option)) { ctx.issues.push(`${optionPath} must be a plain object.`); return }
    rejectKeys(option, set("label", "value"), optionPath, ctx.issues)
    readString(option.label, `${optionPath}.label`, ctx.issues, ctx.limits)
    const optionValue = readString(option.value, `${optionPath}.value`, ctx.issues, ctx.limits, true)
    if (optionValue !== undefined && seen.has(optionValue)) ctx.issues.push(`${optionPath}.value must be unique.`)
    if (optionValue !== undefined) seen.add(optionValue)
  })
}

function validateAction(value: unknown, path: string, ctx: Context): void {
  if (!isPlainObject(value)) { ctx.issues.push(`${path} must be a plain object.`); return }
  rejectKeys(value, set("type", "params"), path, ctx.issues)
  validateActionName(value.type, `${path}.type`, ctx)
  if (value.params !== undefined) validateBoundJSON(value.params, `${path}.params`, ctx)
}

function validateActionType(value: unknown, path: string, ctx: Context): void {
  if (!isPlainObject(value)) { ctx.issues.push(`${path} must be a plain object.`); return }
  rejectKeys(value, set("type"), path, ctx.issues)
  validateActionName(value.type, `${path}.type`, ctx)
}

function validateActionName(value: unknown, path: string, ctx: Context): void {
  const type = readString(value, path, ctx.issues, ctx.limits)
  if (type && !ctx.actionRuntime.hasAction(type)) ctx.issues.push(`${path} is not registered.`)
}

function validateScalarExpression(value: unknown, path: string, ctx: Context): value is UIScalarExpression {
  if (isScalar(value)) { countScalar(value, ctx, path); return true }
  if (!isPlainObject(value) || Object.keys(value).length !== 1 || typeof value.$state !== "string") { ctx.issues.push(`${path} must be a scalar or exact {$state:string} binding.`); return false }
  if (!Object.hasOwn(ctx.state, value.$state)) ctx.issues.push(`${path} references undeclared state.`)
  countString(value.$state, ctx, path)
  return true
}

function validateBoundJSON(value: unknown, path: string, ctx: Context): void {
  let count = 0
  const walk = (current: unknown, currentPath: string, depth: number): void => {
    if (++count > ctx.limits.boundJSONNodes) { ctx.issues.push(`${path} exceeds bound JSON node limit.`); return }
    if (depth > ctx.limits.boundJSONDepth) { ctx.issues.push(`${path} exceeds bound JSON depth.`); return }
    if (isScalar(current)) { countScalar(current, ctx, currentPath); return }
    if (Array.isArray(current)) { current.forEach((item, index) => walk(item, `${currentPath}[${index}]`, depth + 1)); return }
    if (!isPlainObject(current)) { ctx.issues.push(`${currentPath} must contain only JSON values and state bindings.`); return }
    if (Object.keys(current).length === 1 && typeof current.$state === "string") { validateScalarExpression(current, currentPath, ctx); return }
    for (const [key, item] of Object.entries(current)) {
      if (DANGEROUS_KEYS.has(key)) ctx.issues.push(`${currentPath}.${key} is dangerous.`)
      countString(key, ctx, currentPath)
      walk(item, `${currentPath}.${key}`, depth + 1)
    }
  }
  walk(value, path, 1)
}

export function resolveBoundJSON(value: UIBoundJSON, state: Record<string, UIScalar>): unknown {
  if (isScalar(value)) return value
  if (Array.isArray(value)) return value.map((item) => resolveBoundJSON(item, state))
  if (Object.keys(value).length === 1 && typeof (value as { $state?: unknown }).$state === "string") return state[(value as { $state: string }).$state]
  const result: Record<string, unknown> = Object.create(null)
  for (const [key, item] of Object.entries(value)) result[key] = resolveBoundJSON(item, state)
  return result
}

function assertSafeGraph(value: unknown): void {
  const active = new Set<object>()
  const visited = new Set<object>()
  const walk = (current: unknown): void => {
    if (typeof current === "number" && !Number.isFinite(current)) throw new UIDocumentError(["UI values must be finite."])
    if (typeof current !== "object" || current === null) return
    if (active.has(current)) throw new UIDocumentError(["UI values must not contain cycles."])
    if (visited.has(current)) return
    if (!Array.isArray(current) && !isPlainObject(current)) throw new UIDocumentError(["UI values must use plain objects."])
    if (Array.isArray(current)) for (let i = 0; i < current.length; i++) if (!Object.hasOwn(current, i)) throw new UIDocumentError(["UI arrays must not be sparse."])
    active.add(current); visited.add(current)
    for (const key of Object.keys(current)) {
      if (DANGEROUS_KEYS.has(key)) throw new UIDocumentError([`Dangerous key "${key}" is not allowed.`])
      walk((current as Record<string, unknown>)[key])
    }
    active.delete(current)
  }
  walk(value)
}

function rejectKeys(value: Record<string, unknown>, allowed: Set<string>, path: string, issues: string[]): void {
  for (const key of Object.keys(value)) if (DANGEROUS_KEYS.has(key) || !allowed.has(key)) issues.push(`${path}.${key} is not allowed.`)
}
function readString(value: unknown, path: string, issues: string[], limits: Pick<UILimits, "string">, allowEmpty = false): string | undefined {
  // Three different failures used to share one sentence — missing, wrong type,
  // and too long all read "must be a bounded string", which tells a model
  // rewriting its own document nothing about what to change. Each says which.
  if (value === undefined || value === null) { issues.push(`${path} is required and must be a string.`); return undefined }
  if (typeof value !== "string") { issues.push(`${path} must be a string, not ${Array.isArray(value) ? "an array" : typeof value}.`); return undefined }
  if (!allowEmpty && value.trim() === "") { issues.push(`${path} must not be empty.`); return undefined }
  if (value.length > limits.string) { issues.push(`${path} must be at most ${limits.string} characters (got ${value.length}).`); return undefined }
  return value
}
function countString(value: string, ctx: Context, path: string): void {
  if (value.length > ctx.limits.string) ctx.issues.push(`${path} exceeds string limit.`)
  ctx.totalStrings += value.length
  if (ctx.totalStrings > ctx.limits.totalStrings) ctx.issues.push("UI exceeds total string limit.")
}
function countScalar(value: UIScalar, ctx: Context, path: string): void { if (typeof value === "string") countString(value, ctx, path) }
function optionalEnum(value: unknown, allowed: Iterable<unknown>, path: string, issues: string[]): void { if (value !== undefined && !new Set(allowed).has(value)) issues.push(`${path} is invalid.`) }
function optionalNonNegativeInteger(value: unknown, path: string, issues: string[]): number | undefined { if (value === undefined) return undefined; if (!Number.isInteger(value) || (value as number) < 0) { issues.push(`${path} must be a non-negative integer.`); return undefined } return value as number }
function optionalFiniteNumber(value: unknown, path: string, issues: string[]): number | undefined { if (value === undefined) return undefined; if (typeof value !== "number" || !Number.isFinite(value)) { issues.push(`${path} must be finite.`); return undefined } return value }
function compatibleState(type: string, value: UIScalar): boolean { if (value === null) return type !== "checkbox"; if (type === "checkbox") return typeof value === "boolean"; if (type === "number") return typeof value === "number"; return typeof value === "string" }
function isScalar(value: unknown): value is UIScalar { return value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) }
function isPlainObject(value: unknown): value is Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) return false; const prototype = Object.getPrototypeOf(value); return prototype === Object.prototype || prototype === null }
function set(...values: string[]): Set<string> { return new Set(values) }

function isSafePattern(pattern: string): boolean {
  let index = pattern.startsWith("^") ? 1 : 0
  let hasAtom = false
  let canQuantify = false
  let quantified = false
  while (index < pattern.length) {
    const char = pattern[index]
    if (char === "$" && index === pattern.length - 1) return hasAtom
    if (char === "[") { const end = readCharacterClass(pattern, index); if (end < 0) return false; index = end; hasAtom = canQuantify = true; quantified = false; continue }
    if (char === "\\") { if (!isSafeEscape(pattern[index + 1])) return false; index += 2; hasAtom = canQuantify = true; quantified = false; continue }
    if (char === "*" || char === "+" || char === "?") { if (!canQuantify || quantified) return false; index++; canQuantify = false; quantified = true; continue }
    if (char === "{") { if (!canQuantify || quantified) return false; const end = readBoundedQuantifier(pattern, index); if (end < 0) return false; index = end; canQuantify = false; quantified = true; continue }
    if (".^$|()]}".includes(char)) return false
    index++; hasAtom = canQuantify = true; quantified = false
  }
  return hasAtom
}
function readCharacterClass(pattern: string, start: number): number { let index = start + 1; if (pattern[index] === "^") index++; let any = false; while (index < pattern.length) { const char = pattern[index]; if (char === "]") return any ? index + 1 : -1; if (char === "\\") { if (!isSafeEscape(pattern[index + 1])) return -1; index += 2 } else { if (char === "[") return -1; index++ } any = true } return -1 }
function readBoundedQuantifier(pattern: string, start: number): number { const match = /^\{(\d{1,4})(?:,(\d{0,4}))?\}/.exec(pattern.slice(start)); if (!match) return -1; const min = Number(match[1]); const max = match[2] === undefined || match[2] === "" ? min : Number(match[2]); return min <= 1000 && max <= 1000 && max >= min ? start + match[0].length : -1 }
function isSafeEscape(char: string | undefined): boolean { return char !== undefined && ("dDsSwW\\.^$*+?{}[]|()-".includes(char) || !/[A-Za-z0-9]/.test(char)) }
