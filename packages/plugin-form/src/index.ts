import { actionOutcome, ActionRuntimeError, type ActionOutcome, type ActionRuntime, type AIGuiPlugin, type ASTNode, type OutcomeTone, type RenderOutput } from "@ai-gui/core"

const FIELD_TYPES = new Set<FormFieldType>(["text", "textarea", "number", "date", "select", "checkbox", "checkboxes", "radio", "audio"])
const FORM_KEYS = new Set(["id", "fields", "submitAction", "submitLabel"])
const FIELD_KEYS = new Set(["name", "type", "label", "required", "minLength", "maxLength", "pattern", "min", "max", "minSelected", "maxSelected", "options", "placeholder", "expect", "maxSeconds"])
const OPTION_KEYS = new Set(["label", "value"])
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/
const SAFE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/
const MAX_SOURCE_LENGTH = 64 * 1024
const MAX_FIELDS = 100
const MAX_PATTERN_LENGTH = 128
let nextFormInstanceId = 0

export type FormFieldType = "text" | "textarea" | "number" | "date" | "select" | "checkbox" | "checkboxes" | "radio" | "audio"

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
  /**
   * The answer this field is expected to carry.
   *
   * Declaring it lets the form report how the submission compared — a quiz colours itself the
   * moment it is answered instead of waiting for a round trip to say so. Unlike the constraints
   * beside it this never blocks a submission: a wrong answer is an answer, and the person is told
   * rather than stopped.
   */
  expect?: FormValue
}

/**
 * What a field can carry.
 *
 * `string[]` is the multi-select case, and it is a list rather than a joined string on purpose: an
 * option label containing the separator would otherwise split into two answers that were never given.
 */
export type FormValue = string | number | boolean | string[]

/** How long a recording may run when the field does not say. */
const DEFAULT_MAX_RECORDING_SECONDS = 60
/** The largest recording a form will carry, as base64 in its own value. */
const MAX_RECORDING_CHARS = 8 * 1024 * 1024

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

/**
 * Several answers to one question — 多选, where more than one option is right at once.
 *
 * Distinct from `checkbox`, which is one box and answers yes or no. A question with several correct
 * options cannot be asked with radios (they exclude each other) and should not be asked with a text
 * box (the person has to guess the format, and "A、C" and "AC" and "a,c" are all the same answer). The
 * value is the chosen option values, in the order the options were declared.
 */
export interface FormCheckboxesField extends FormFieldBase {
  type: "checkboxes"
  options: FormOption[]
  /** How few may be chosen. `required` on its own already means at least one. */
  minSelected?: number
  /** How many may be chosen — for "pick two" rather than "pick all that apply". */
  maxSelected?: number
}

/**
 * A spoken answer — the person records, and the recording itself is the value.
 *
 * For questions a written answer cannot carry. Asked to say a sentence in a language they are learning,
 * a person who types it has demonstrated spelling; the recording is the only thing that holds whether
 * the vowel was long, which syllable took the stress, or whether two words ran together. Transcribing it
 * in the browser first would defeat the point: a recogniser returns the word it thinks was meant, so a
 * mispronunciation arrives as the correct word and disappears before anyone is told about it.
 *
 * The value is a `data:` URL carrying the recorded bytes, which keeps a submission ordinary JSON that a
 * handler can post onward or store. There is no `expect`: two recordings of the same sentence are never
 * equal, so judging one is the host's job — this field only carries it there.
 */
export interface FormAudioField extends FormFieldBase {
  type: "audio"
  /** How long a recording may run. Defaults to 60 seconds; recording stops itself at the limit. */
  maxSeconds?: number
  expect?: never
}

export type FormField =
  | FormStringField
  | FormDateField
  | FormNumberField
  | FormChoiceField
  | FormCheckboxField
  | FormCheckboxesField
  | FormAudioField

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
  values: Record<string, FormValue>
  errors: Record<string, string>
}

/** What was answered, and how it turned out — enough to put a form back the way it was left. */
export interface FormSubmission {
  values: Record<string, FormValue>
  /**
   * The verdict, when the host kept one. Omitted, the fields' own `expect` is graded again, so a
   * quiz still comes back coloured without the host having to store the marking.
   */
  outcome?: ActionOutcome
}

export interface FormPluginOptions {
  /** Shared core runtime whose registry is the only allowlist for submitAction. */
  actionRuntime: ActionRuntime
  /** Mount every form as already submitted, useful when restoring persisted conversations. */
  submitted?: boolean
  /** Label shown after a successful or restored submission. */
  submittedLabel?: string
  /**
   * The submission this form already has, by form id.
   *
   * `submitted` on its own marks a form done without saying what was answered, so a reloaded
   * conversation shows a disabled question with nothing chosen in it — which reads as worse than
   * unanswered, since it claims to have been answered and cannot say with what. Returning the
   * values puts the person's own answer back in front of them.
   *
   * Called once per form as it mounts, so it can read whatever the host has loaded by then.
   */
  restore?: (formId: string) => FormSubmission | undefined
  /**
   * Called when a submission succeeds, so the host can persist what to restore later.
   *
   * The action handler sees the values too, but not which form they came from — the form id is only
   * in `cardType`, which a host would have to parse. This hands it over directly.
   */
  onSubmitted?: (formId: string, submission: FormSubmission) => void
}

export function formPromptSpec(): string {
  return [
    "Forms (fenced): ```form <safe form JSON>```.",
    "Fields: text, textarea, number, date, select, radio, checkbox (one box, yes or no), checkboxes (several answers to one question), audio (a spoken answer, recorded in the browser). Constraints: required, minLength, maxLength, pattern, min, max; on checkboxes, minSelected and maxSelected; on audio, maxSeconds.",
    'A question with more than one right answer is `checkboxes` with `options`, never radio (they exclude each other) and never a text box (the format has to be guessed). Its value is the chosen option values, and its `expect` is the array of every correct one: {"name":"answer","type":"checkboxes","label":"...","options":[{"label":"A. ...","value":"A"}],"expect":["A","C"]}.',
    'Ask for `audio` when a written answer cannot carry what is being assessed — pronunciation, intonation, fluency, reading aloud: {"name":"reading","type":"audio","label":"读出这句：Ich möchte über mein Projekt sprechen","required":true,"maxSeconds":20}. Its value is the recording itself, so never give it `expect` (two recordings are never equal; the application judges it) and never ask the person to type what they said instead — a spelling is not a pronunciation.',
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
  const values: Record<string, FormValue> = Object.create(null)
  const errors: Record<string, string> = Object.create(null)
  for (const field of definition.fields) {
    const raw = input[field.name]
    if (field.type === "checkboxes") {
      // Kept in the order the options were declared, so the same answer is the same value however it
      // was clicked — a set that depended on click order would compare unequal to itself.
      const chosen = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : []
      const allowed = field.options.map((option) => option.value)
      const selected = allowed.filter((value) => chosen.includes(value))
      values[field.name] = selected
      if (chosen.some((value) => !allowed.includes(value))) {
        errors[field.name] = "Select an allowed option."
      } else if (selected.length === 0) {
        if (field.required || (field.minSelected ?? 0) > 0) errors[field.name] = "This field is required."
      } else if (field.minSelected !== undefined && selected.length < field.minSelected) {
        errors[field.name] = `Choose at least ${field.minSelected}.`
      } else if (field.maxSelected !== undefined && selected.length > field.maxSelected) {
        errors[field.name] = `Choose at most ${field.maxSelected}.`
      }
      continue
    }
    if (field.type === "audio") {
      const value = typeof raw === "string" ? raw : ""
      if (value === "") {
        if (field.required) errors[field.name] = "Record an answer."
        continue
      }
      // Only a recording, and only one small enough to travel in a submission. A `data:` URL of any
      // other type here would be an arbitrary payload smuggled through a field the host will forward.
      if (!/^data:audio\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i.test(value)) {
        errors[field.name] = "Must be a recording."
        continue
      }
      if (value.length > MAX_RECORDING_CHARS) {
        errors[field.name] = "Recording is too long."
        continue
      }
      values[field.name] = value
      continue
    }
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
  const minSelected = readOptionalInteger(value.minSelected, `${path}.minSelected`, issues)
  const maxSelected = readOptionalInteger(value.maxSelected, `${path}.maxSelected`, issues)
  if (minSelected !== undefined && maxSelected !== undefined && minSelected > maxSelected) {
    issues.push(`${path}.minSelected cannot exceed maxSelected.`)
  }
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
  let expected: FormValue | undefined
  if (value.expect !== undefined) {
    if (typeof value.expect === "string" || typeof value.expect === "number" || typeof value.expect === "boolean") {
      expected = value.expect
    } else if (Array.isArray(value.expect) && value.expect.every((item) => typeof item === "string")) {
      // A multi-select's answer is a set of options, so its expectation has to be one too.
      expected = value.expect as string[]
    } else {
      issues.push(`${path}.expect must be a string, a number, a boolean, or an array of strings.`)
    }
  }
  if (type !== "checkboxes" && Array.isArray(expected)) {
    issues.push(`${path}.expect may only be an array on a checkboxes field.`)
  }
  const maxSeconds = readOptionalInteger(value.maxSeconds, `${path}.maxSeconds`, issues)
  if (maxSeconds !== undefined && type !== "audio") {
    issues.push(`${path}.maxSeconds may only be set on an audio field.`)
  }
  if (type === "audio" && expected !== undefined) {
    // Two recordings of the same sentence are never equal, so an expectation here could only ever be
    // wrong. Judging a recording is the host's, and it is what the submission is forwarded for.
    issues.push(`${path}.expect cannot be set on an audio field; a recording is judged by the host.`)
  }
  if (!name || !label || !type) return undefined

  const base = {
    name,
    label,
    ...(value.required === true ? { required: true as const } : {}),
    ...(placeholder === undefined ? {} : { placeholder }),
    ...(expected === undefined ? {} : { expect: expected }),
  }
  if (type === "audio") {
    if (minLength !== undefined || maxLength !== undefined || pattern !== undefined || min !== undefined || max !== undefined || value.options !== undefined) {
      issues.push(`${path} contains constraints unsupported by audio fields.`)
    }
    if (maxSeconds !== undefined && (maxSeconds < 1 || maxSeconds > 600)) {
      issues.push(`${path}.maxSeconds must be between 1 and 600.`)
    }
    return {
      name,
      label,
      type,
      ...(value.required === true ? { required: true as const } : {}),
      ...(placeholder === undefined ? {} : { placeholder }),
      ...(maxSeconds === undefined ? {} : { maxSeconds }),
    }
  }
  if (type === "number") {
    if (minLength !== undefined || maxLength !== undefined || pattern !== undefined || value.options !== undefined) issues.push(`${path} contains constraints unsupported by number fields.`)
    return { ...base, type, ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) }
  }
  if (minSelected !== undefined || maxSelected !== undefined) {
    if (type !== "checkboxes") issues.push(`${path} may only limit selections on a checkboxes field.`)
  }
  if (type === "select" || type === "radio") {
    if (minLength !== undefined || maxLength !== undefined || pattern !== undefined || min !== undefined || max !== undefined || placeholder !== undefined) issues.push(`${path} contains unsupported choice-field properties.`)
    const options = parseOptions(value.options, `${path}.options`, issues)
    return { ...base, type, options }
  }
  if (type === "checkboxes") {
    if (minLength !== undefined || maxLength !== undefined || pattern !== undefined || min !== undefined || max !== undefined || placeholder !== undefined) issues.push(`${path} contains unsupported choice-field properties.`)
    const options = parseOptions(value.options, `${path}.options`, issues)
    if (maxSelected !== undefined && options.length > 0 && maxSelected > options.length) {
      issues.push(`${path}.maxSelected cannot exceed the number of options.`)
    }
    return {
      ...base,
      type,
      options,
      ...(minSelected === undefined ? {} : { minSelected }),
      ...(maxSelected === undefined ? {} : { maxSelected }),
    }
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
  // Kept so a per-field verdict can mark the field it belongs to.
  const fieldContainers = new Map<string, HTMLElement>()
  for (const field of definition.fields) {
    const rendered = createField(instancePrefix, field)
    formElement.appendChild(rendered.container)
    controls.set(field.name, rendered.control)
    errorElements.set(field.name, rendered.error)
    fieldContainers.set(field.name, rendered.container)
  }
  const actionError = document.createElement("div")
  actionError.setAttribute("data-aigui-form-action-error", "")
  actionError.setAttribute("role", "alert")
  actionError.hidden = true
  formElement.appendChild(actionError)
  // Where a verdict is shown. Separate from the error slot above: a wrong answer is not a failed
  // request, and reading it as one would tell the person their submission broke.
  const outcomeMessage = document.createElement("div")
  outcomeMessage.setAttribute("data-aigui-form-outcome-message", "")
  outcomeMessage.setAttribute("aria-live", "polite")
  outcomeMessage.hidden = true
  formElement.appendChild(outcomeMessage)
  const submit = document.createElement("button")
  submit.type = "button"
  submit.setAttribute("data-aigui-form-submit", "")
  submit.textContent = definition.submitLabel ?? "Submit"
  formElement.appendChild(submit)

  /**
   * Compare the submission with the answers the fields declared.
   *
   * Only fields carrying `expect` take part, so a plain form is never marked. The tone is the worst
   * of them: one wrong answer among three right ones is not a pass.
   */
  const gradeAgainstExpectations = (values: Record<string, FormValue>): ActionOutcome | undefined => {
    const graded = definition.fields.filter((field) => field.expect !== undefined)
    if (graded.length === 0) return undefined
    const fieldTones: Record<string, OutcomeTone> = {}
    let wrong = 0
    for (const field of graded) {
      const submitted = values[field.name]
      const matches = matchesExpectation(submitted, field.expect)
      fieldTones[field.name] = matches ? "positive" : "warning"
      if (!matches) wrong += 1
    }
    return { tone: wrong === 0 ? "positive" : "warning", fields: fieldTones }
  }

  /**
   * Show how the submission turned out, when the handler judged it.
   *
   * The result used to be discarded, so an app that knew the answer was wrong had no way to say so
   * — the form simply disabled itself and read "Submitted" whether the answer was right or not.
   */
  const applyOutcome = (result: unknown, fallback?: ActionOutcome) => {
    // The handler wins when it judged: it knows more than a value comparison can.
    const outcome = actionOutcome(result) ?? fallback
    if (!outcome || disposed) return
    formElement.setAttribute("data-aigui-form-outcome", outcome.tone)
    if (outcome.message) {
      outcomeMessage.textContent = outcome.message
      outcomeMessage.hidden = false
    }
    for (const [name, tone] of Object.entries(outcome.fields ?? {}) as Array<[string, OutcomeTone]>) {
      fieldContainers.get(name)?.setAttribute("data-aigui-form-field-outcome", tone)
    }
  }

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
  // A stored submission is put back before the form is locked, so the person sees their own answer
  // rather than an empty question that claims to have been answered.
  const stored = options.restore?.(definition.id)
  if (stored) {
    writeControls(definition, controls, stored.values)
    markSubmitted()
    applyOutcome(stored.outcome, gradeAgainstExpectations(stored.values))
  } else if (submitted) {
    markSubmitted()
  }

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
    const graded = gradeAgainstExpectations(validation.values)
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
      (result: unknown) => {
        markSubmitted()
        applyOutcome(result, graded)
        // Handed over after the form is settled, so a host that throws while persisting cannot
        // leave the person looking at a form that took their answer and still says "Submit".
        if (disposed) return
        const outcome = actionOutcome(result) ?? graded
        try {
          options.onSubmitted?.(definition.id, {
            values: validation.values,
            ...(outcome ? { outcome } : {}),
          })
        } catch {
          // The host's bookkeeping is not the person's problem.
        }
      },
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
  const grouped = field.type === "radio" || field.type === "checkboxes"
  const container = document.createElement(grouped ? "fieldset" : "div")
  container.setAttribute("data-aigui-form-field", field.name)
  const controlId = `${formId}-${field.name.replace(/[^A-Za-z0-9_-]/g, "-")}`
  const errorId = `${controlId}-error`
  const error = document.createElement("div")
  error.id = errorId
  error.setAttribute("data-aigui-form-field-error", field.name)
  error.setAttribute("aria-live", "polite")
  error.hidden = true

  if (grouped && (field.type === "radio" || field.type === "checkboxes")) {
    const legend = document.createElement("legend")
    legend.textContent = field.label
    container.appendChild(legend)
    let first: HTMLInputElement | undefined
    for (const [index, option] of field.options.entries()) {
      const optionId = `${controlId}-${index}`
      const input = document.createElement("input")
      input.type = field.type === "radio" ? "radio" : "checkbox"
      input.id = optionId
      input.name = field.name
      input.value = option.value
      // A required multi-select means "choose at least one", and `required` on every box would demand
      // all of them — so that one is checked in `validateFormValues` instead of by the browser.
      input.required = field.type === "radio" && field.required === true
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

  if (field.type === "audio") {
    return createAudioField(field, container, controlId, errorId, error)
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

/**
 * A record button, a player, and a hidden input holding the recording.
 *
 * The hidden input is deliberately the control: it makes a recording an ordinary form value, so reading,
 * restoring a previous submission and re-grading all work through the same paths as a text box, and a
 * host that stored the answer gets the recording back when the form is rebuilt.
 *
 * Everything is feature-detected. A browser without `MediaRecorder`, or a person who declines the
 * microphone, gets a disabled button and a sentence saying so — not a button that looks live and does
 * nothing.
 */
function createAudioField(
  field: FormAudioField,
  container: HTMLElement,
  controlId: string,
  errorId: string,
  error: HTMLElement,
): RenderedField {
  const label = document.createElement("label")
  label.htmlFor = controlId
  label.textContent = field.label

  const control = document.createElement("input")
  control.type = "hidden"
  control.id = controlId
  control.setAttribute("name", field.name)
  control.setAttribute("data-aigui-form-audio", field.name)

  const button = document.createElement("button")
  button.type = "button"
  button.setAttribute("data-aigui-form-record", field.name)
  button.setAttribute("aria-describedby", errorId)
  const idleLabel = field.placeholder ?? "Record"
  button.textContent = idleLabel

  const player = document.createElement("audio")
  player.controls = true
  player.hidden = true
  player.setAttribute("data-aigui-form-playback", field.name)

  const limit = field.maxSeconds ?? DEFAULT_MAX_RECORDING_SECONDS
  let recorder: MediaRecorder | undefined
  let stopTimer: ReturnType<typeof setTimeout> | undefined
  let tick: ReturnType<typeof setInterval> | undefined

  const supported = typeof MediaRecorder !== "undefined"
    && typeof navigator !== "undefined"
    && typeof navigator.mediaDevices?.getUserMedia === "function"
  if (!supported) {
    button.disabled = true
    button.textContent = "Recording is not supported here"
  }

  const finish = () => {
    if (stopTimer !== undefined) clearTimeout(stopTimer)
    if (tick !== undefined) clearInterval(tick)
    stopTimer = undefined
    tick = undefined
    recorder = undefined
    button.textContent = idleLabel
    button.removeAttribute("data-recording")
  }

  const start = async () => {
    error.hidden = true
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      error.textContent = "Microphone permission is needed to answer this."
      error.hidden = false
      return
    }
    const media = new MediaRecorder(stream)
    const chunks: Blob[] = []
    media.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data) }
    media.onstop = () => {
      for (const track of stream.getTracks()) track.stop()
      const blob = new Blob(chunks, { type: media.mimeType || "audio/webm" })
      finish()
      const reader = new FileReader()
      reader.onload = () => {
        const url = typeof reader.result === "string" ? reader.result : ""
        control.value = url
        player.src = url
        player.hidden = url === ""
        // A hidden input's value changing fires nothing, so the form is told by hand — this is what
        // clears a "Record an answer." error and lets the submit button notice there is an answer.
        control.dispatchEvent(new Event("input", { bubbles: true }))
        control.dispatchEvent(new Event("change", { bubbles: true }))
      }
      reader.readAsDataURL(blob)
    }
    recorder = media
    media.start()
    button.setAttribute("data-recording", "true")
    const started = Date.now()
    const render = () => {
      const elapsed = Math.round((Date.now() - started) / 1000)
      button.textContent = `Stop (${elapsed}s)`
    }
    render()
    tick = setInterval(render, 250)
    // Stops itself at the limit rather than recording until the tab is closed.
    stopTimer = setTimeout(() => { if (recorder?.state === "recording") recorder.stop() }, limit * 1000)
  }

  button.addEventListener("click", () => {
    if (recorder?.state === "recording") { recorder.stop(); return }
    void start()
  })

  container.append(label, button, player, control, error)
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
    if (field.type === "checkboxes") {
      const group = control.form?.elements.namedItem(field.name)
      const inputs = group instanceof RadioNodeList ? Array.from(group) : [control]
      values[field.name] = inputs
        .filter((input): input is HTMLInputElement => input instanceof HTMLInputElement && input.checked)
        .map((input) => input.value)
    }
    else if (field.type === "checkbox" && control instanceof HTMLInputElement) values[field.name] = control.checked
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

/**
 * Put a stored submission back into the controls — the inverse of `readControls`.
 *
 * A radio group is several inputs sharing a name, and `controls` holds only the first, so the one
 * that carries the stored value has to be found in the group. Setting `.value` on that first input
 * would rename the option instead of choosing it.
 */
function writeControls(
  definition: FormDefinition,
  controls: Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  values: Record<string, FormValue>,
): void {
  for (const field of definition.fields) {
    const control = controls.get(field.name)
    const value = values[field.name]
    if (!control || value === undefined) continue
    if (field.type === "checkboxes") {
      const chosen = new Set(Array.isArray(value) ? value : [String(value)])
      const group = control.form?.elements.namedItem(field.name)
      const inputs = group instanceof RadioNodeList ? Array.from(group) : [control]
      for (const input of inputs) {
        if (input instanceof HTMLInputElement) input.checked = chosen.has(input.value)
      }
    } else if (field.type === "checkbox" && control instanceof HTMLInputElement) {
      control.checked = value === true
    } else if (field.type === "radio") {
      const group = control.form?.elements.namedItem(field.name)
      const inputs = group instanceof RadioNodeList ? Array.from(group) : [control]
      for (const input of inputs) {
        if (input instanceof HTMLInputElement) input.checked = input.value === String(value)
      }
    } else {
      control.value = String(value)
      if (field.type === "audio") {
        // The value alone is invisible: without this a restored form shows a Record button and no sign
        // that an answer is already in it.
        //
        // Found by walking the siblings rather than by selector: a field name would have to be escaped
        // into one, and `CSS.escape` is absent from older browsers and from some test environments — so
        // a selector here turns "restore an answer" into a crash on the whole form.
        const player = Array.from(control.parentElement?.children ?? [])
          .find((element): element is HTMLAudioElement => element instanceof HTMLAudioElement)
        if (player) {
          player.src = String(value)
          player.hidden = String(value) === ""
        }
      }
    }
  }
}

/**
 * Whether an answer is the answer that was expected.
 *
 * A multi-select is compared as a set: every correct option chosen and no incorrect one. Partial
 * credit is deliberately not decided here — how much a half-right 多选 is worth is the host's marking
 * scheme, and this only says whether it was right. The handler's own outcome still wins over this.
 */
function matchesExpectation(submitted: FormValue | undefined, expected: FormValue | undefined): boolean {
  if (Array.isArray(expected)) {
    if (!Array.isArray(submitted)) return false
    const wanted = new Set(expected.map((value) => value.trim()))
    const given = new Set(submitted.map((value) => value.trim()))
    return wanted.size === given.size && [...wanted].every((value) => given.has(value))
  }
  if (Array.isArray(submitted)) return false
  if (typeof expected === "string" && typeof submitted === "string") return submitted.trim() === expected.trim()
  return submitted === expected
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
