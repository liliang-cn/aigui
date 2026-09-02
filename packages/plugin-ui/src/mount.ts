import {
  ActionAbortedError, ActionDestroyedError, ActionNotFoundError, ActionRuntimeError,
  ActionTimeoutError, ActionValidationError, translator, type MountedCardSlot,
} from "@ai-gui/core"
import { UI_MESSAGES, format } from "./messages"
import type {
  UIBoundJSON, UIButtonNode, UICardNode, UIDocument, UIFieldNode, UIFormNode, UIKeyValueNode, UINode, UIScalar, UIScalarExpression, UIMountOptions,
} from "./types"
import { resolveBoundJSON } from "./validate"

interface RuntimeContext {
  document: UIDocument
  state: Record<string, UIScalar>
  options: UIMountOptions
  bindings: Map<string, Set<() => void>>
  cleanups: Array<() => void>
  disposed: boolean
  /** Resolved once per mount: a block draws many strings and each is a map hit. */
  t: (key: string) => string
}

export function mountUIDocument(host: HTMLElement, document: UIDocument, options: UIMountOptions): () => void {
  if (!host || typeof host.replaceChildren !== "function") throw new TypeError("mountUIDocument requires an HTMLElement host.")
  if (!options?.actionRuntime) throw new TypeError("mountUIDocument requires an actionRuntime.")
  const context: RuntimeContext = {
    document,
    state: Object.assign(Object.create(null), document.state ?? {}),
    options,
    bindings: new Map(),
    cleanups: [],
    disposed: false,
    t: translator(UI_MESSAGES, options.locale),
  }
  const root = createNode(document.root, context, undefined)
  const container = globalThis.document.createElement("div")
  container.setAttribute("data-aigui-ui", document.id)
  if (options.theme) container.setAttribute("data-aigui-ui-theme", options.theme)
  container.appendChild(root)
  host.replaceChildren(container)
  let cleaned = false
  return () => {
    if (cleaned) return
    cleaned = true
    context.disposed = true
    for (const cleanup of context.cleanups.splice(0).reverse()) {
      try { cleanup() } catch { /* cleanup is best-effort */ }
    }
  }
}

function createNode(node: UINode, context: RuntimeContext, form: HTMLFormElement | undefined): HTMLElement {
  switch (node.kind) {
    case "stack": {
      const element = base("div", node)
      element.setAttribute("data-aigui-ui-stack", node.direction ?? "column")
      if (node.gap) element.setAttribute("data-gap", node.gap)
      if (node.align) element.setAttribute("data-align", node.align)
      for (const child of node.children) element.appendChild(createNode(child, context, form))
      return element
    }
    case "grid": {
      const element = base("div", node)
      element.setAttribute("data-aigui-ui-grid", String(node.columns))
      if (node.gap) element.setAttribute("data-gap", node.gap)
      for (const child of node.children) element.appendChild(createNode(child, context, form))
      return element
    }
    case "text": {
      const element = base("p", node)
      element.setAttribute("data-tone", node.tone ?? "default")
      bindText(element, node.text, context)
      return element
    }
    case "heading": {
      const element = base(`h${node.level}`, node)
      bindText(element, node.text, context)
      return element
    }
    case "divider": return base("hr", node)
    case "list": {
      const element = base(node.ordered ? "ol" : "ul", node)
      for (const item of node.items) { const li = globalThis.document.createElement("li"); li.textContent = scalarText(item); element.appendChild(li) }
      return element
    }
    case "table": {
      const table = base("table", node)
      const caption = globalThis.document.createElement("caption"); caption.textContent = node.caption; table.appendChild(caption)
      const thead = globalThis.document.createElement("thead")
      const headRow = globalThis.document.createElement("tr")
      for (const header of node.headers) { const th = globalThis.document.createElement("th"); th.scope = "col"; th.textContent = header; headRow.appendChild(th) }
      thead.appendChild(headRow); table.appendChild(thead)
      const tbody = globalThis.document.createElement("tbody")
      for (const row of node.rows) { const tr = globalThis.document.createElement("tr"); for (const cell of row) { const td = globalThis.document.createElement("td"); td.textContent = scalarText(cell); tr.appendChild(td) } tbody.appendChild(tr) }
      table.appendChild(tbody)
      return table
    }
    case "keyValue": return createKeyValue(node, context)
    case "form": return createForm(node, context)
    case "field": return createField(node, context, form)
    case "button": return createButton(node, context)
    case "card": return createCard(node, context)
  }
}

function createKeyValue(node: UIKeyValueNode, context: RuntimeContext): HTMLElement {
  const dl = base("dl", node)
  for (const item of node.items) {
    const dt = globalThis.document.createElement("dt"); dt.textContent = item.label
    const dd = globalThis.document.createElement("dd"); bindText(dd, item.value, context)
    dl.append(dt, dd)
  }
  return dl
}

function createForm(node: UIFormNode, context: RuntimeContext): HTMLElement {
  const form = base("form", node) as HTMLFormElement
  form.noValidate = true
  form.setAttribute("data-aigui-ui-form", node.id)
  for (const child of node.children) form.appendChild(createNode(child, context, form))
  const actionError = actionErrorElement(node.id)
  const submit = globalThis.document.createElement("button")
  submit.type = "submit"
  submit.textContent = node.submitLabel ?? "Submit"
  form.append(actionError, submit)
  const owner = {}
  const controller = new AbortController()
  let pending = false
  const onSubmit = (event: SubmitEvent) => {
    event.preventDefault()
    if (pending || context.disposed) return
    const fields = collectFields(node)
    const firstInvalid = fields.find((field) => !validateField(field, context, form))
    if (firstInvalid) {
      form.querySelector<HTMLElement>(`[data-aigui-ui-id="${firstInvalid.id}"] input, [data-aigui-ui-id="${firstInvalid.id}"] textarea, [data-aigui-ui-id="${firstInvalid.id}"] select`)?.focus()
      return
    }
    pending = true
    submit.disabled = true
    form.setAttribute("aria-busy", "true")
    actionError.hidden = true
    const params: Record<string, UIScalar> = Object.create(null)
    for (const field of fields) params[field.bind] = context.state[field.bind]
    void context.options.actionRuntime.dispatch(
      { type: node.submit.type, params, cardType: `ui:${context.document.id}:${node.id}` },
      { owner, signal: controller.signal },
    ).then(() => settle(), (error: unknown) => {
      if (!context.disposed && !controller.signal.aborted) { actionError.textContent = safeActionError(error, context.t); actionError.hidden = false }
      settle()
    })
    function settle() { if (context.disposed) return; pending = false; submit.disabled = false; form.removeAttribute("aria-busy") }
  }
  form.addEventListener("submit", onSubmit)
  context.cleanups.push(() => { controller.abort(); form.removeEventListener("submit", onSubmit) })
  return form
}

function createField(node: UIFieldNode, context: RuntimeContext, form: HTMLFormElement | undefined): HTMLElement {
  const container = base(node.fieldType === "radio" ? "fieldset" : "div", node)
  container.setAttribute("data-aigui-ui-field", node.fieldType)
  const controlId = `aigui-ui-${nextInstance()}-${context.document.id}-${node.id}`
  const errorId = `${controlId}-error`
  const error = globalThis.document.createElement("div")
  error.id = errorId
  error.setAttribute("data-aigui-ui-field-error", node.id)
  error.setAttribute("role", "alert")
  error.hidden = true
  if (node.fieldType === "radio") {
    const legend = globalThis.document.createElement("legend"); legend.textContent = node.label; container.appendChild(legend)
    for (const [index, option] of (node.options ?? []).entries()) {
      const input = globalThis.document.createElement("input")
      input.type = "radio"; input.id = `${controlId}-${index}`; input.name = node.bind; input.value = option.value; input.checked = context.state[node.bind] === option.value; input.required = node.required === true; input.setAttribute("aria-describedby", errorId)
      const label = globalThis.document.createElement("label"); label.htmlFor = input.id; label.textContent = option.label
      const onChange = () => { if (input.checked) setState(node.bind, input.value, context); clearFieldError(node, container) }
      input.addEventListener("change", onChange); context.cleanups.push(() => input.removeEventListener("change", onChange)); container.append(input, label)
    }
    container.appendChild(error)
    return container
  }
  let control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  if (node.fieldType === "textarea") control = globalThis.document.createElement("textarea")
  else if (node.fieldType === "select") {
    const select = globalThis.document.createElement("select")
    for (const option of node.options ?? []) { const item = globalThis.document.createElement("option"); item.value = option.value; item.textContent = option.label; select.appendChild(item) }
    control = select
  } else { const input = globalThis.document.createElement("input"); input.type = node.fieldType; control = input }
  control.id = controlId; control.setAttribute("name", node.bind); control.required = node.required === true; control.setAttribute("aria-describedby", errorId)
  if (node.placeholder !== undefined && !(control instanceof HTMLSelectElement)) control.placeholder = node.placeholder
  if ((node.fieldType === "text" || node.fieldType === "textarea") && (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) { if (node.minLength !== undefined) control.minLength = node.minLength; if (node.maxLength !== undefined) control.maxLength = node.maxLength; if (node.pattern !== undefined && control instanceof HTMLInputElement) control.pattern = node.pattern }
  if (node.fieldType === "number" && control instanceof HTMLInputElement) { if (node.min !== undefined) control.min = String(node.min); if (node.max !== undefined) control.max = String(node.max) }
  writeControl(control, node, context.state[node.bind])
  const label = globalThis.document.createElement("label"); label.htmlFor = controlId; label.textContent = node.label
  const onInput = () => { setState(node.bind, readControl(control, node), context); clearFieldError(node, container) }
  control.addEventListener("input", onInput); control.addEventListener("change", onInput)
  context.cleanups.push(() => { control.removeEventListener("input", onInput); control.removeEventListener("change", onInput) })
  if (node.fieldType === "checkbox") container.append(control, label, error); else container.append(label, control, error)
  void form
  return container
}

function createButton(node: UIButtonNode, context: RuntimeContext): HTMLElement {
  const wrapper = globalThis.document.createElement("div")
  wrapper.setAttribute("data-aigui-ui-button", node.variant ?? "secondary")
  const button = base("button", node) as HTMLButtonElement
  button.type = "button"; button.textContent = node.label
  const error = actionErrorElement(node.id)
  wrapper.append(button, error)
  const owner = {}
  const controller = new AbortController()
  let pending = false
  const onClick = () => {
    if (pending || context.disposed) return
    pending = true; button.disabled = true; button.setAttribute("aria-busy", "true"); error.hidden = true
    const params = node.action.params === undefined ? Object.create(null) : resolveBoundJSON(node.action.params, context.state)
    void context.options.actionRuntime.dispatch(
      { type: node.action.type, params, cardType: `ui:${context.document.id}:${node.id}` },
      { owner, signal: controller.signal },
    ).then(() => settle(), (cause: unknown) => { if (!context.disposed && !controller.signal.aborted) { error.textContent = safeActionError(cause, context.t); error.hidden = false } settle() })
    function settle() { if (context.disposed) return; pending = false; button.disabled = false; button.removeAttribute("aria-busy") }
  }
  button.addEventListener("click", onClick)
  context.cleanups.push(() => { controller.abort(); button.removeEventListener("click", onClick) })
  return wrapper
}

function createCard(node: UICardNode, context: RuntimeContext): HTMLElement {
  const host = base("div", node)
  host.setAttribute("data-aigui-ui-card", node.type)
  let slot: MountedCardSlot | undefined
  const update = () => {
    const data = resolveBoundJSON(node.data, context.state)
    if (slot) slot.update(data)
    else {
      slot = context.options.mountContext?.mountCard?.(host, { type: node.type, data })
      if (!slot) {
        host.replaceChildren()
        const fallback = globalThis.document.createElement("span")
        fallback.setAttribute("data-aigui-ui-card-fallback", node.type)
        fallback.textContent = "Card unavailable."
        host.appendChild(fallback)
      }
    }
  }
  for (const key of bindingKeys(node.data)) subscribe(key, update, context)
  update()
  context.cleanups.push(() => slot?.destroy())
  return host
}

function validateField(node: UIFieldNode, context: RuntimeContext, form: HTMLFormElement): boolean {
  const container = form.querySelector<HTMLElement>(`[data-aigui-ui-id="${node.id}"]`)
  if (!container) return true
  const value = context.state[node.bind]
  let message = ""
  const t = context.t
  if (node.required && (value === "" || value === null || value === false)) message = t("field.required")
  else if (node.fieldType === "number" && typeof value === "number") { if (node.min !== undefined && value < node.min) message = format(t("field.min"), { min: String(node.min) }); else if (node.max !== undefined && value > node.max) message = format(t("field.max"), { max: String(node.max) }) }
  else if (typeof value === "string") {
    if (node.minLength !== undefined && value.length < node.minLength) message = format(t("field.minLength"), { min: String(node.minLength) })
    else if (node.maxLength !== undefined && value.length > node.maxLength) message = format(t("field.maxLength"), { max: String(node.maxLength) })
    else if (node.pattern !== undefined && !new RegExp(node.pattern).test(value)) message = t("field.pattern")
    else if ((node.fieldType === "select" || node.fieldType === "radio") && !node.options?.some((option) => option.value === value)) message = t("field.option")
  }
  const controls = container.querySelectorAll<HTMLElement>("input, textarea, select")
  const error = container.querySelector<HTMLElement>(`[data-aigui-ui-field-error="${node.id}"]`)
  for (const control of controls) { if (message) control.setAttribute("aria-invalid", "true"); else control.removeAttribute("aria-invalid") }
  if (error) { error.textContent = message; error.hidden = !message }
  return !message
}

function collectFields(node: UIFormNode): UIFieldNode[] {
  const fields: UIFieldNode[] = []
  const walk = (children: UINode[]) => { for (const child of children) { if (child.kind === "field") fields.push(child); else if (child.kind === "stack" || child.kind === "grid") walk(child.children) } }
  walk(node.children)
  return fields
}

function bindText(element: HTMLElement, expression: UIScalarExpression, context: RuntimeContext): void {
  const update = () => { element.textContent = scalarText(resolveScalar(expression, context.state)) }
  if (isBinding(expression)) subscribe(expression.$state, update, context)
  update()
}
function subscribe(key: string, update: () => void, context: RuntimeContext): void { let listeners = context.bindings.get(key); if (!listeners) { listeners = new Set(); context.bindings.set(key, listeners) } listeners.add(update); context.cleanups.push(() => listeners?.delete(update)) }
function setState(key: string, value: UIScalar, context: RuntimeContext): void { if (Object.is(context.state[key], value)) return; context.state[key] = value; for (const update of context.bindings.get(key) ?? []) update() }
function resolveScalar(value: UIScalarExpression, state: Record<string, UIScalar>): UIScalar { return isBinding(value) ? state[value.$state] : value }
function bindingKeys(value: UIBoundJSON): Set<string> { const keys = new Set<string>(); const walk = (item: UIBoundJSON) => { if (isBinding(item)) keys.add(item.$state); else if (Array.isArray(item)) item.forEach(walk); else if (item !== null && typeof item === "object") Object.values(item).forEach(walk) }; walk(value); return keys }
function isBinding(value: unknown): value is { $state: string } { return typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 1 && typeof (value as { $state?: unknown }).$state === "string" }
function scalarText(value: UIScalar): string { return value === null ? "" : String(value) }
function readControl(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, field: UIFieldNode): UIScalar { if (field.fieldType === "checkbox" && control instanceof HTMLInputElement) return control.checked; if (field.fieldType === "number") return control.value === "" ? null : Number(control.value); return control.value }
function writeControl(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, field: UIFieldNode, value: UIScalar): void { if (field.fieldType === "checkbox" && control instanceof HTMLInputElement) control.checked = value === true; else control.value = value === null ? "" : String(value) }
function clearFieldError(node: UIFieldNode, container: HTMLElement): void { for (const control of container.querySelectorAll<HTMLElement>("input, textarea, select")) control.removeAttribute("aria-invalid"); const error = container.querySelector<HTMLElement>(`[data-aigui-ui-field-error="${node.id}"]`); if (error) { error.textContent = ""; error.hidden = true } }
function actionErrorElement(id: string): HTMLElement { const error = globalThis.document.createElement("div"); error.setAttribute("data-aigui-ui-action-error", id); error.setAttribute("role", "alert"); error.hidden = true; return error }
/**
 * What the reader is told when an action fails.
 *
 * The split is between errors the runtime raised, whose *class* is a fact about
 * the request and safe to describe, and anything thrown by the host's own
 * action code, which is not: a stack, a DSN, an internal id or a database
 * message would all arrive here as `error.message`, on a surface the model
 * chose the shape of. So only the class is ever read, never the message, and an
 * unrecognised error is the generic line.
 *
 * The classes are worth telling apart because they imply different next moves:
 * fix the input, wait and retry, or stop. Before this they were one sentence,
 * and a mistyped field and a dead backend looked identical.
 */
function safeActionError(error: unknown, t: (key: string) => string): string {
  if (error instanceof ActionValidationError) return t("action.invalid")
  if (error instanceof ActionTimeoutError) return t("action.timeout")
  if (error instanceof ActionAbortedError) return t("action.cancelled")
  if (error instanceof ActionNotFoundError) return t("action.notFound")
  if (error instanceof ActionDestroyedError) return t("action.unavailable")
  // ActionExecutionError included: it wraps whatever the host threw.
  if (error instanceof ActionRuntimeError) return t("action.failed")
  return t("action.failed")
}
function base(tag: string, node: { id: string }): HTMLElement { const element = globalThis.document.createElement(tag); element.setAttribute("data-aigui-ui-id", node.id); return element }
let instance = 0
function nextInstance(): number { return ++instance }
