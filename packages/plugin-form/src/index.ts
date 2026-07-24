import { ActionRuntimeError, type ActionRuntime, type AIGuiPlugin, type ASTNode, type RenderOutput } from "@ai-gui/core"

const FIELD_TYPES = new Set<FormFieldType>(["text", "textarea", "number", "date", "select", "checkbox", "radio"])
const FORM_KEYS = new Set(["id", "fields", "submitAction", "submitLabel"])
const FIELD_KEYS = new Set(["name", "type", "label", "required", "minLength", "maxLength", "pattern", "min", "max", "options", "placeholder"])
const OPTION_KEYS = new Set(["label", "value"])
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/
const SAFE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/
const MAX_SOURCE_LENGTH = 64 * 1024
const MAX_FIELDS = 100
const MAX_PATTERN_LENGTH = 128
let nextFormInstanceId = 0

export type FormFieldType = "text" | "textarea" | "number" | "date" | "select" | "checkbox" | "radio"

export interface FormOption {
  label: string
  value: string
}

interface FormFieldBase {
  name: string
  type: FormFieldType
  label: string
  required?: boolean
  placeholder?: string
}

export interface FormStringField extends FormFieldBase {
  type: "text" | "textarea"
  minLength?: number
  maxLength?: number
  pattern?: string
}

export interface FormDateField extends FormFieldBase {
  type: "date"
}

export interface FormNumberField extends FormFieldBase {
  type: "number"
  min?: number
  max?: number
}

export interface FormChoiceField extends FormFieldBase {
  type: "select" | "radio"
  options: FormOption[]
}

export interface FormCheckboxField extends FormFieldBase {
  type: "checkbox"
}

export type FormField = FormStringField | FormDateField | FormNumberField | FormChoiceField | FormCheckboxField

export interface FormDefinition {
  id: string
  fields: FormField[]
  submitAction: string
  submitLabel?: string
}

export type FormParseResult =
  | { valid: true; data: FormDefinition }
  | { valid: false; issues: string[] }

export interface FormValidationResult {
  valid: boolean
  values: Record<string, string | number | boolean>
  errors: Record<string, string>
}

export interface FormPluginOptions {
  /** Shared core runtime whose registry is the only allowlist for submitAction. */
  actionRuntime: ActionRuntime
  /** Mount forms as already submitted, useful when restoring persisted conversations. */
  submitted?: boolean
  /** Label shown after a successful or restored submission. */
  submittedLabel?: string
}

export function formPromptSpec(): string {
  return [
    "Forms (fenced): ```form <safe form JSON>```.",
    "Fields: text, textarea, number, date, select, checkbox, radio. Constraints: required, minLength, maxLength, pattern, min, max.",
    "submitAction must name an application-registered Action. Never emit URLs, scripts, HTML, handlers, or component names.",
  ].join("\n")
}

export function form(options: FormPluginOptions): AIGuiPlugin {
  if (!options?.actionRuntime) throw new TypeError("form() requires an actionRuntime")
  const outputs = new WeakMap<ASTNode, RenderOutput>()
  const render = (node: ASTNode): RenderOutput => {
    const cached = outputs.get(node)
    if (cached) return cached
    if (!node.complete) {
      const output: RenderOutput = { kind: "html", html: '<div data-aigui-block-loading data-block-type="form"></div>' }
      outputs.set(node, output)
      return output
    }
    const parsed = parseFormDefinition(node.content ?? "")
    if (!parsed.valid) {
      const output = invalidOutput(parsed.issues)
      outputs.set(node, output)
      return output
    }
    if (!options.actionRuntime.hasAction(parsed.data.submitAction)) {
      const output = invalidOutput([`Action "${parsed.data.submitAction}" is not registered.`])
      outputs.set(node, output)
      return output
    }
    const output: RenderOutput = {
      kind: "mount",
      mount: (host) => mountForm(host, parsed.data, options),
    }
    outputs.set(node, output)
    return output
  }
  return {
    name: "form",
    nodeRenderers: { form: render },
    promptSpec: formPromptSpec(),
  }
}

export function parseFormDefinition(source: string): FormParseResult {
  if (source.length > MAX_SOURCE_LENGTH) return { valid: false, issues: ["Form definition is too large."] }
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    return { valid: false, issues: ["Form definition must be valid JSON."] }
  }
  if (!isPlainObject(value)) return { valid: false, issues: ["Form definition must be an object."] }
  const issues: string[] = []
  rejectUnknownKeys(value, FORM_KEYS, "$", issues)
  const id = readString(value.id, "$.id", issues, 128)
  if (id && !SAFE_ID.test(id)) issues.push("$.id must start with a letter and contain only letters, numbers, underscores, or hyphens.")
  const submitAction = readString(value.submitAction, "$.submitAction", issues, 256)
  const submitLabel = value.submitLabel === undefined ? undefined : readString(value.submitLabel, "$.submitLabel", issues, 128)
  if (!Array.isArray(value.fields)) issues.push("$.fields must be an array.")
  else if (value.fields.length > MAX_FIELDS) issues.push(`$.fields must contain at most ${MAX_FIELDS} fields.`)

  const fields: FormField[] = []
  const names = new Set<string>()
  if (Array.isArray(value.fields)) {
    value.fields.forEach((candidate, index) => {
      const field = parseField(candidate, index, issues)
      if (!field) return
      if (names.has(field.name)) issues.push(`$.fields[${index}].name must be unique.`)
      names.add(field.name)
      fields.push(field)
    })
  }
  if (issues.length > 0 || !id || !submitAction) return { valid: false, issues }
  return {
    valid: true,
    data: {
      id,
      fields,
      submitAction,
      ...(submitLabel === undefined ? {} : { submitLabel }),
    },
  }
}

export function validateFormValues(
  definition: FormDefinition,
  input: Record<string, unknown>,
): FormValidationResult {
  const values: Record<string, string | number | boolean> = Object.create(null)
  const errors: Record<string, string> = Object.create(null)
  for (const field of definition.fields) {
    const raw = input[field.name]
    if (field.type === "checkbox") {
      const value = raw === true
      values[field.name] = value
      if (field.required && !value) errors[field.name] = "This field is required."
      continue
    }
    if (field.type === "number") {
      if (raw === "" || raw === undefined || raw === null) {
        if (field.required) errors[field.name] = "This field is required."
        continue
      }
      const value = typeof raw === "number" ? raw : Number(raw)
      if (!Number.isFinite(value)) {
        errors[field.name] = "Must be a number."
        continue
      }
      values[field.name] = value
      if (field.min !== undefined && value < field.min) errors[field.name] = `Must be at least ${field.min}.`
      else if (field.max !== undefined && value > field.max) errors[field.name] = `Must be at most ${field.max}.`
      continue
    }
    const value = typeof raw === "string" ? raw : ""
    if (value === "") {
      if (field.required) errors[field.name] = "This field is required."
      continue
    }
    values[field.name] = value
    if (field.type === "select" || field.type === "radio") {
      if (!field.options.some((option) => option.value === value)) errors[field.name] = "Select an allowed option."
      continue
    }
    if (field.type === "date") continue
    if ("minLength" in field && field.minLength !== undefined && value.length < field.minLength) errors[field.name] = `Must contain at least ${field.minLength} characters.`
    else if ("maxLength" in field && field.maxLength !== undefined && value.length > field.maxLength) errors[field.name] = `Must contain at most ${field.maxLength} characters.`
    else if ("pattern" in field && field.pattern !== undefined && !new RegExp(field.pattern).test(value)) errors[field.name] = "Must match the required format."
  }
  return { valid: Object.keys(errors).length === 0, values, errors }
}

function parseField(value: unknown, index: number, issues: string[]): FormField | undefined {
  const path = `$.fields[${index}]`
  if (!isPlainObject(value)) {
    issues.push(`${path} must be an object.`)
    return undefined
  }
  rejectUnknownKeys(value, FIELD_KEYS, path, issues)
  const name = readString(value.name, `${path}.name`, issues, 128)
  const label = readString(value.label, `${path}.label`, issues, 256)
  const rawType = readString(value.type, `${path}.type`, issues, 32)
  const type = rawType && FIELD_TYPES.has(rawType as FormFieldType) ? rawType as FormFieldType : undefined
  if (name && !SAFE_NAME.test(name)) issues.push(`${path}.name is not a safe field name.`)
  if (rawType && !type) issues.push(`${path}.type is not supported.`)
  if (value.required !== undefined && typeof value.required !== "boolean") issues.push(`${path}.required must be a boolean.`)
  const placeholder = value.placeholder === undefined ? undefined : readString(value.placeholder, `${path}.placeholder`, issues, 256)
  const minLength = readOptionalInteger(value.minLength, `${path}.minLength`, issues)
  const maxLength = readOptionalInteger(value.maxLength, `${path}.maxLength`, issues)
  const min = readOptionalNumber(value.min, `${path}.min`, issues)
  const max = readOptionalNumber(value.max, `${path}.max`, issues)
  if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) issues.push(`${path}.minLength cannot exceed maxLength.`)
  if (min !== undefined && max !== undefined && min > max) issues.push(`${path}.min cannot exceed max.`)
  let pattern: string | undefined
  if (value.pattern !== undefined) {
    pattern = readString(value.pattern, `${path}.pattern`, issues, MAX_PATTERN_LENGTH)
    if (pattern !== undefined) {
      if (!isSafePattern(pattern)) issues.push(`${path}.pattern uses unsupported regular expression features.`)
      else {
        try { new RegExp(pattern) }
        catch { issues.push(`${path}.pattern must be a valid regular expression.`) }
      }
    }
  }
  if (!name || !label || !type) return undefined

  const base = {
    name,
    label,
    ...(value.required === true ? { required: true as const } : {}),
    ...(placeholder === undefined ? {} : { placeholder }),
  }
  if (type === "number") {
    if (minLength !== undefined || maxLength !== undefined || pattern !== undefined || value.options !== undefined) issues.push(`${path} contains constraints unsupported by number fields.`)
    return { ...base, type, ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) }
  }
  if (type === "select" || type === "radio") {
    if (minLength !== undefined || maxLength !== undefined || pattern !== undefined || min !== undefined || max !== undefined || placeholder !== undefined) issues.push(`${path} contains unsupported choice-field properties.`)
    const options = parseOptions(value.options, `${path}.options`, issues)
    return { ...base, type, options }
  }
  if (type === "checkbox") {
    if (minLength !== undefined || maxLength !== undefined || pattern !== undefined || min !== undefined || max !== undefined || value.options !== undefined || placeholder !== undefined) issues.push(`${path} contains unsupported checkbox properties.`)
    return { ...base, type }
  }
  if (type === "date") {
    if (minLength !== undefined || maxLength !== undefined || pattern !== undefined || min !== undefined || max !== undefined || value.options !== undefined || placeholder !== undefined) issues.push(`${path} contains unsupported date-field properties.`)
    return { ...base, type }
  }
  if (min !== undefined || max !== undefined || value.options !== undefined) issues.push(`${path} contains unsupported string-field properties.`)
  return {
    ...base,
    type,
    ...(minLength === undefined ? {} : { minLength }),
    ...(maxLength === undefined ? {} : { maxLength }),
    ...(pattern === undefined ? {} : { pattern }),
  }
}

function parseOptions(value: unknown, path: string, issues: string[]): FormOption[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    issues.push(`${path} must be a non-empty array with at most 100 options.`)
    return []
  }
  const seen = new Set<string>()
  return value.flatMap((option, index) => {
    const itemPath = `${path}[${index}]`
    if (!isPlainObject(option)) {
      issues.push(`${itemPath} must be an object.`)
      return []
    }
    rejectUnknownKeys(option, OPTION_KEYS, itemPath, issues)
    const label = readString(option.label, `${itemPath}.label`, issues, 256)
    const optionValue = readString(option.value, `${itemPath}.value`, issues, 256)
    if (optionValue !== undefined && seen.has(optionValue)) issues.push(`${itemPath}.value must be unique.`)
    if (optionValue !== undefined) seen.add(optionValue)
    return label !== undefined && optionValue !== undefined ? [{ label, value: optionValue }] : []
  })
}

function mountForm(host: HTMLElement, definition: FormDefinition, options: FormPluginOptions): () => void {
  const instanceId = String(++nextFormInstanceId)
  const instancePrefix = `aigui-form-${instanceId}-${definition.id}`
  const cardType = `form:${definition.id}:${instanceId}`
  const owner = {}
  const controller = new AbortController()
  let pending = false
  let submitted = options.submitted === true
  let disposed = false
  const formElement = document.createElement("form")
  formElement.noValidate = true
  formElement.setAttribute("data-aigui-form", definition.id)
  formElement.setAttribute("data-aigui-form-instance", instanceId)
  const controls = new Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>()
  const errorElements = new Map<string, HTMLElement>()
  for (const field of definition.fields) {
    const rendered = createField(instancePrefix, field)
    formElement.appendChild(rendered.container)
    controls.set(field.name, rendered.control)
    errorElements.set(field.name, rendered.error)
  }
  const actionError = document.createElement("div")
  actionError.setAttribute("data-aigui-form-action-error", "")
  actionError.setAttribute("role", "alert")
  actionError.hidden = true
  formElement.appendChild(actionError)
  const submit = document.createElement("button")
  submit.type = "button"
  submit.setAttribute("data-aigui-form-submit", "")
  submit.textContent = definition.submitLabel ?? "Submit"
  formElement.appendChild(submit)

  const markSubmitted = () => {
    if (disposed) return
    pending = false
    submitted = true
    formElement.removeAttribute("aria-busy")
    formElement.setAttribute("data-aigui-form-submitted", "")
    for (const element of Array.from(formElement.elements)) {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement || element instanceof HTMLButtonElement || element instanceof HTMLFieldSetElement) element.disabled = true
    }
    submit.textContent = options.submittedLabel ?? "Submitted"
  }
  if (submitted) markSubmitted()

  const onInput = (event: Event) => {
    const control = event.target
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) return
    clearFieldError(control.name, controls, errorElements)
    actionError.hidden = true
  }
  const onSubmit = () => {
    if (pending || submitted || disposed) return
    const validation = validateFormValues(definition, readControls(definition, controls))
    renderErrors(validation.errors, controls, errorElements)
    actionError.hidden = true
    if (!validation.valid) {
      controls.get(Object.keys(validation.errors)[0])?.focus()
      return
    }
    pending = true
    submit.disabled = true
    formElement.setAttribute("aria-busy", "true")
    const settle = () => {
      if (disposed) return
      pending = false
      submit.disabled = false
      formElement.removeAttribute("aria-busy")
    }
    void options.actionRuntime.dispatch(
      { type: definition.submitAction, params: validation.values, cardType },
      { owner, signal: controller.signal },
    ).then(
      markSubmitted,
      (error: unknown) => {
        if (!disposed && !controller.signal.aborted) {
          actionError.textContent = actionErrorMessage(error)
          actionError.hidden = false
        }
        settle()
      },
    )
  }
  const preventImplicitSubmit = (event: SubmitEvent) => event.preventDefault()
  formElement.addEventListener("input", onInput)
  formElement.addEventListener("change", onInput)
  formElement.addEventListener("submit", preventImplicitSubmit)
  submit.addEventListener("click", onSubmit)
  host.replaceChildren(formElement)
  return () => {
    disposed = true
    controller.abort()
    formElement.removeEventListener("input", onInput)
    formElement.removeEventListener("change", onInput)
    formElement.removeEventListener("submit", preventImplicitSubmit)
    submit.removeEventListener("click", onSubmit)
  }
}

interface RenderedField {
  container: HTMLElement
  control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  error: HTMLElement
}

function createField(formId: string, field: FormField): RenderedField {
  const container = document.createElement(field.type === "radio" ? "fieldset" : "div")
  container.setAttribute("data-aigui-form-field", field.name)
  const controlId = `${formId}-${field.name.replace(/[^A-Za-z0-9_-]/g, "-")}`
  const errorId = `${controlId}-error`
  const error = document.createElement("div")
  error.id = errorId
  error.setAttribute("data-aigui-form-field-error", field.name)
  error.setAttribute("aria-live", "polite")
  error.hidden = true

  if (field.type === "radio") {
    const legend = document.createElement("legend")
    legend.textContent = field.label
    container.appendChild(legend)
    let first: HTMLInputElement | undefined
    for (const [index, option] of field.options.entries()) {
      const optionId = `${controlId}-${index}`
      const input = document.createElement("input")
      input.type = "radio"
      input.id = optionId
      input.name = field.name
      input.value = option.value
      input.required = field.required === true
      input.setAttribute("aria-describedby", errorId)
      const label = document.createElement("label")
      label.htmlFor = optionId
      label.textContent = option.label
      container.append(input, label)
      first ??= input
    }
    container.appendChild(error)
    return { container, control: first as HTMLInputElement, error }
  }

  let control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  if (field.type === "textarea") control = document.createElement("textarea")
  else if (field.type === "select") {
    const select = document.createElement("select")
    const empty = document.createElement("option")
    empty.value = ""
    empty.textContent = "Select..."
    select.appendChild(empty)
    for (const option of field.options) {
      const element = document.createElement("option")
      element.value = option.value
      element.textContent = option.label
      select.appendChild(element)
    }
    control = select
  } else {
    const input = document.createElement("input")
    input.type = field.type
    control = input
  }
  control.id = controlId
  control.setAttribute("name", field.name)
  control.required = field.required === true
  control.setAttribute("aria-describedby", errorId)
  if (field.placeholder !== undefined && !(control instanceof HTMLSelectElement)) control.placeholder = field.placeholder
  if ((control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) && (field.type === "text" || field.type === "textarea") && field.minLength !== undefined) control.minLength = field.minLength
  if ((control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) && (field.type === "text" || field.type === "textarea") && field.maxLength !== undefined) control.maxLength = field.maxLength
  if (field.type === "text" && field.pattern !== undefined && control instanceof HTMLInputElement) control.pattern = field.pattern
  if (field.type === "number" && control instanceof HTMLInputElement) {
    if (field.min !== undefined) control.min = String(field.min)
    if (field.max !== undefined) control.max = String(field.max)
  }
  const label = document.createElement("label")
  label.htmlFor = controlId
  label.textContent = field.label
  if (field.type === "checkbox") container.append(control, label, error)
  else container.append(label, control, error)
  return { container, control, error }
}

function readControls(
  definition: FormDefinition,
  controls: Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
): Record<string, unknown> {
  const values: Record<string, unknown> = Object.create(null)
  for (const field of definition.fields) {
    const control = controls.get(field.name)
    if (!control) continue
    if (field.type === "checkbox" && control instanceof HTMLInputElement) values[field.name] = control.checked
    else if (field.type === "radio") {
      const group = control.form?.elements.namedItem(field.name)
      values[field.name] = group instanceof RadioNodeList
        ? group.value
        : control instanceof HTMLInputElement && control.checked ? control.value : ""
    }
    else values[field.name] = control.value
  }
  return values
}

function renderErrors(
  errors: Record<string, string>,
  controls: Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  elements: Map<string, HTMLElement>,
): void {
  for (const name of controls.keys()) {
    const message = errors[name]
    const control = controls.get(name)
    const element = elements.get(name)
    if (!control || !element) continue
    if (message) {
      control.setAttribute("aria-invalid", "true")
      element.textContent = message
      element.hidden = false
    } else clearFieldError(name, controls, elements)
  }
}

function clearFieldError(
  name: string,
  controls: Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  elements: Map<string, HTMLElement>,
): void {
  controls.get(name)?.removeAttribute("aria-invalid")
  const element = elements.get(name)
  if (element) {
    element.textContent = ""
    element.hidden = true
  }
}

function invalidOutput(issues: string[]): RenderOutput {
  return { kind: "html", html: `<div data-aigui-form-invalid="" role="alert">${escapeHtml(issues[0] ?? "Invalid form definition.")}</div>` }
}

function actionErrorMessage(error: unknown): string {
  return error instanceof ActionRuntimeError ? error.message : "The action failed."
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: Set<string>, path: string, issues: string[]): void {
  for (const key of Object.keys(value)) if (!allowed.has(key)) issues.push(`${path}.${key} is not allowed.`)
}

function readString(value: unknown, path: string, issues: string[], maxLength: number, allowEmpty = false): string | undefined {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "") || value.length > maxLength) {
    issues.push(`${path} must be ${allowEmpty ? "a" : "a non-empty"} string of at most ${maxLength} characters.`)
    return undefined
  }
  return value
}

function readOptionalInteger(value: unknown, path: string, issues: string[]): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 1_000_000) {
    issues.push(`${path} must be a non-negative integer.`)
    return undefined
  }
  return value as number
}

function readOptionalNumber(value: unknown, path: string, issues: string[]): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push(`${path} must be a finite number.`)
    return undefined
  }
  return value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function isSafePattern(pattern: string): boolean {
  let index = 0
  let hasAtom = false
  let canQuantify = false
  let hasQuantifier = false

  if (pattern[index] === "^") index++
  while (index < pattern.length) {
    const char = pattern[index]
    if (char === "$" && index === pattern.length - 1) return hasAtom
    if (char === "[") {
      const end = readCharacterClass(pattern, index)
      if (end === -1) return false
      index = end
      hasAtom = true
      canQuantify = true
      continue
    }
    if (char === "\\") {
      if (!isSafeEscape(pattern[index + 1])) return false
      index += 2
      hasAtom = true
      canQuantify = true
      continue
    }
    if (char === "*" || char === "+" || char === "?") {
      if (!canQuantify || hasQuantifier) return false
      index++
      canQuantify = false
      hasQuantifier = true
      continue
    }
    if (char === "{") {
      if (!canQuantify || hasQuantifier) return false
      const end = readBoundedQuantifier(pattern, index)
      if (end === -1) return false
      index = end
      canQuantify = false
      hasQuantifier = true
      continue
    }
    if (".^$|()]}".includes(char)) return false
    index++
    hasAtom = true
    canQuantify = true
  }
  return hasAtom
}

function readCharacterClass(pattern: string, start: number): number {
  let index = start + 1
  if (pattern[index] === "^") index++
  let hasCharacter = false
  while (index < pattern.length) {
    const char = pattern[index]
    if (char === "]") return hasCharacter ? index + 1 : -1
    if (char === "\\") {
      if (!isSafeEscape(pattern[index + 1])) return -1
      index += 2
    } else {
      if (char === "[") return -1
      index++
    }
    hasCharacter = true
  }
  return -1
}

function readBoundedQuantifier(pattern: string, start: number): number {
  const match = /^\{(\d{1,4})(?:,(\d{0,4}))?\}/.exec(pattern.slice(start))
  if (!match) return -1
  const minimum = Number(match[1])
  const maximum = match[2] === undefined || match[2] === "" ? minimum : Number(match[2])
  if (minimum > 1000 || maximum > 1000 || maximum < minimum) return -1
  return start + match[0].length
}

function isSafeEscape(char: string | undefined): boolean {
  return char !== undefined && ("dDsSwW\\.^$*+?{}[]|()-".includes(char) || !/[A-Za-z0-9]/.test(char))
}
