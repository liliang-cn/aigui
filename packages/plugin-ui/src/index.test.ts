// @vitest-environment jsdom
import {
  ActionRegistry,
  CardRegistry,
  Renderer,
  collectNodeRenderers,
  createActionRuntime,
  type RenderMountContext,
  type RenderOutput,
} from "@ai-gui/core"
import { describe, expect, it, vi } from "vitest"
import {
  DEFAULT_UI_LIMITS,
  UIDocumentError,
  mountUIDocument,
  parseUIDocument,
  ui,
  uiCss,
  uiPromptSpec,
  validateUIDocument,
  type UIDocument,
} from "./index"

function setup() {
  const actions = new ActionRegistry()
  actions.register({ type: "save", schema: { type: "object" }, run: vi.fn() })
  actions.register({ type: "delete", run: vi.fn() })
  const actionRuntime = createActionRuntime({ registry: actions })
  const registry = new CardRegistry()
  registry.register({
    type: "weather",
    description: "Current weather",
    schema: { type: "object", properties: { city: { type: "string" }, units: { type: "string" } }, required: ["city"] },
  })
  return { actions, actionRuntime, registry }
}

const fullDocument = {
  version: 1,
  id: "profile-ui",
  state: { name: "Ada", age: 36, active: true, role: "admin" },
  root: {
    kind: "stack", id: "root", direction: "column", gap: "md", align: "stretch", children: [
      { kind: "heading", id: "title", level: 2, text: "Profile" },
      { kind: "text", id: "name", text: { $state: "name" }, tone: "positive" },
      { kind: "divider", id: "rule" },
      { kind: "grid", id: "grid", columns: 2, gap: "sm", children: [
        { kind: "list", id: "list", ordered: true, items: ["one", 2, true, null] },
        { kind: "keyValue", id: "kv", items: [{ label: "Name", value: { $state: "name" } }] },
      ] },
      { kind: "table", id: "table", caption: "People", headers: ["Name", "Age"], rows: [["Ada", 36]] },
      { kind: "form", id: "form", submit: { type: "save" }, submitLabel: "Store", children: [
        { kind: "field", id: "f-name", bind: "name", fieldType: "text", label: "Name", required: true, minLength: 2, maxLength: 20, pattern: "^[A-Za-z]+$" },
        { kind: "field", id: "f-age", bind: "age", fieldType: "number", label: "Age", min: 1, max: 120 },
        { kind: "field", id: "f-role", bind: "role", fieldType: "select", label: "Role", options: [{ label: "Admin", value: "admin" }] },
        { kind: "field", id: "f-active", bind: "active", fieldType: "checkbox", label: "Active" },
      ] },
      { kind: "button", id: "button", label: "Save", variant: "primary", action: { type: "save", params: { name: { $state: "name" } } } },
      { kind: "card", id: "card", type: "weather", data: { city: { $state: "name" }, units: "c" } },
    ],
  },
} as const

describe("UI protocol validation", () => {
  it("accepts every v1 node kind and exact state bindings", () => {
    const { registry, actionRuntime } = setup()
    expect(validateUIDocument(fullDocument, { registry, actionRuntime })).toEqual(fullDocument)
    expect(parseUIDocument(JSON.stringify(fullDocument), { registry, actionRuntime })).toEqual(fullDocument)
  })

  it("rejects unknown and dangerous keys, unsafe ids, duplicate ids, missing state, and nested forms", () => {
    const { registry, actionRuntime } = setup()
    const invalid = [
      { ...fullDocument, html: "<b>x</b>" },
      { ...fullDocument, __proto__: { polluted: true } },
      { ...fullDocument, id: "bad id" },
      { ...fullDocument, root: { kind: "stack", id: "x", children: [{ kind: "text", id: "x", text: "x" }] } },
      { ...fullDocument, state: {}, root: { kind: "text", id: "x", text: { $state: "missing" } } },
      { ...fullDocument, root: { kind: "form", id: "a", submit: { type: "save" }, children: [{ kind: "form", id: "b", submit: { type: "save" }, children: [] }] } },
    ]
    for (const value of invalid) expect(() => validateUIDocument(value, { registry, actionRuntime })).toThrow(UIDocumentError)
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
  })

  it("rejects invalid node constraints, actions, cards, field types, rows, and unsafe regex", () => {
    const { registry, actionRuntime } = setup()
    const nodes = [
      { kind: "grid", id: "x", columns: 5, children: [] },
      { kind: "table", id: "x", caption: "x", headers: ["a"], rows: [[1, 2]] },
      { kind: "button", id: "x", label: "x", action: { type: "missing" } },
      { kind: "card", id: "x", type: "missing", data: {} },
      { kind: "card", id: "x", type: "weather", data: {} },
      { kind: "field", id: "x", bind: "name", fieldType: "text", label: "x" },
      { kind: "form", id: "form", submit: { type: "save" }, children: [{ kind: "field", id: "x", bind: "age", fieldType: "text", label: "x" }] },
      { kind: "form", id: "form", submit: { type: "save" }, children: [{ kind: "field", id: "x", bind: "name", fieldType: "text", label: "x", pattern: "^(a+)+$" }] },
    ]
    for (const root of nodes) expect(() => validateUIDocument({ version: 1, id: "doc", state: { name: "a", age: 1 }, root }, { registry, actionRuntime })).toThrow(UIDocumentError)
  })

  it("enforces source and structural limits", () => {
    const { registry, actionRuntime } = setup()
    expect(() => parseUIDocument("x".repeat(DEFAULT_UI_LIMITS.sourceBytes + 1), { registry, actionRuntime })).toThrow(UIDocumentError)
    const children = Array.from({ length: 3 }, (_, i) => ({ kind: "text", id: `n${i}`, text: "x" }))
    expect(() => validateUIDocument({ version: 1, id: "doc", root: { kind: "stack", id: "root", children } }, { registry, actionRuntime, limits: { children: 2 } })).toThrow(UIDocumentError)
    expect(() => validateUIDocument({ version: 1, id: "doc", root: { kind: "stack", id: "a", children: [{ kind: "stack", id: "b", children: [{ kind: "text", id: "c", text: "x" }] }] } }, { registry, actionRuntime, limits: { depth: 2 } })).toThrow(UIDocumentError)
  })

  it("rejects programmatic cycles, class instances, sparse arrays, and non-finite values", () => {
    const { registry, actionRuntime } = setup()
    const cyclic: Record<string, unknown> = { version: 1, id: "doc" }
    cyclic.root = cyclic
    class Evil { version = 1; id = "doc"; root = { kind: "text", id: "x", text: "x" } }
    const sparse = [{ kind: "text", id: "x", text: "x" }, , { kind: "text", id: "y", text: "y" }]
    for (const value of [cyclic, new Evil(), { version: 1, id: "doc", state: { n: Infinity }, root: { kind: "text", id: "x", text: "x" } }, { version: 1, id: "doc", root: { kind: "stack", id: "root", children: sparse } }]) {
      expect(() => validateUIDocument(value, { registry, actionRuntime })).toThrow(UIDocumentError)
    }
  })
})

describe("UI plugin and prompt", () => {
  it("generates a dynamic restrictive prompt", () => {
    const { registry, actionRuntime } = setup()
    const prompt = uiPromptSpec(registry, actionRuntime)
    expect(prompt).toContain("```ui")
    expect(prompt).toContain("save")
    expect(prompt).toContain("delete")
    expect(prompt).toContain("weather: Current weather")
    expect(prompt).toContain("city(string)")
    for (const forbidden of ["HTML", "Markdown", "CSS", "JavaScript", "URLs", "imports", "remote components", "workflows", "artifact commands", "declarative"]) expect(prompt).toContain(forbidden)
  })

  it("is complete-gated through the real Renderer, returns generic invalid UI, and caches by AST node", () => {
    const { registry, actionRuntime } = setup()
    const plugin = ui({ registry, actionRuntime })
    let nodes = [] as Parameters<NonNullable<ConstructorParameters<typeof Renderer>[0]["onPatch"]>>[1]
    const renderer = new Renderer({ registry, plugins: [plugin], onPatch: (_patches, value) => { nodes = value } })
    renderer.push('```ui\n{"version":1')
    const render = collectNodeRenderers([plugin]).ui
    const loading = render(nodes[0]) as RenderOutput
    expect(loading.kind).toBe("html")
    renderer.push("}\n```")
    const invalid = render(nodes[0]) as RenderOutput
    expect(invalid.kind).toBe("html")
    if (invalid.kind === "html") expect(invalid.html).toBe('<div data-aigui-ui-invalid="" role="alert">Invalid UI.</div>')
    expect(render(nodes[0])).toBe(invalid)
  })

  it("accepts at most one UI fence per renderer generation", () => {
    const { registry, actionRuntime } = setup()
    const plugin = ui({ registry, actionRuntime })
    let nodes: any[] = []
    const renderer = new Renderer({ registry, plugins: [plugin], onPatch: (_patches, value) => { nodes = value } })
    const source = `\`\`\`ui\n${JSON.stringify(fullDocument)}\n\`\`\`\n\n\`\`\`ui\n${JSON.stringify({ ...fullDocument, id: "second-ui" })}\n\`\`\``
    renderer.push(source)
    const render = collectNodeRenderers([plugin]).ui
    expect((render(nodes[0]) as RenderOutput).kind).toBe("mount")
    const duplicate = render(nodes[1]) as RenderOutput
    expect(duplicate.kind).toBe("html")
    if (duplicate.kind === "html") expect(duplicate.html).toContain("data-aigui-ui-invalid")
    renderer.reset()
    renderer.push(`\`\`\`ui\n${JSON.stringify({ ...fullDocument, id: "fresh-ui" })}\n\`\`\``)
    expect((render(nodes[0]) as RenderOutput).kind).toBe("mount")
  })
})

describe("UI DOM runtime", () => {
  it("renders semantic DOM without innerHTML, generated styles/classes, or model execution", () => {
    const { registry, actionRuntime } = setup()
    const host = document.createElement("div")
    const innerHTML = vi.spyOn(Element.prototype, "innerHTML", "set")
    const uiDocument = validateUIDocument(fullDocument, { registry, actionRuntime })
    mountUIDocument(host, uiDocument, { actionRuntime })
    expect(host.querySelector("h2")?.textContent).toBe("Profile")
    expect(host.querySelector("ol li")?.textContent).toBe("one")
    expect(host.querySelector("table caption")?.textContent).toBe("People")
    expect(host.querySelector("dl dt")?.textContent).toBe("Name")
    expect(host.querySelector("[style]")).toBeNull()
    expect(host.querySelector("[class]")).toBeNull()
    expect(innerHTML).not.toHaveBeenCalled()
    innerHTML.mockRestore()
  })

  it("updates bound text, key values, and cards selectively in the same slot", () => {
    const { registry, actionRuntime } = setup()
    const host = document.createElement("div")
    const update = vi.fn()
    const destroy = vi.fn()
    const mountCard = vi.fn(() => ({ update, destroy }))
    const uiDocument = validateUIDocument(fullDocument, { registry, actionRuntime })
    const cleanup = mountUIDocument(host, uiDocument, { actionRuntime, mountContext: { mountCard } })
    const text = host.querySelector('[data-aigui-ui-id="name"]')!
    const input = host.querySelector<HTMLInputElement>('[data-aigui-ui-id="f-name"] input')!
    input.value = "Grace"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    expect(text.textContent).toBe("Grace")
    expect(host.querySelector("dd")?.textContent).toBe("Grace")
    expect(mountCard).toHaveBeenCalledOnce()
    expect(update).toHaveBeenLastCalledWith({ city: "Grace", units: "c" })
    cleanup()
    cleanup()
    expect(destroy).toHaveBeenCalledOnce()
  })

  it("uses a safe card fallback when no mount bridge exists", () => {
    const { registry, actionRuntime } = setup()
    const host = document.createElement("div")
    mountUIDocument(host, validateUIDocument(fullDocument, { registry, actionRuntime }), { actionRuntime })
    expect(host.querySelector('[data-aigui-ui-card-fallback="weather"]')?.textContent).toBe("Card unavailable.")
  })

  it("resolves button params at click time and handles pending, safe errors, and abort", async () => {
    let reject!: (error: unknown) => void
    const run = vi.fn((_params, { signal }: { signal: AbortSignal }) => new Promise((_resolve, fail) => {
      reject = fail
      signal.addEventListener("abort", () => fail(signal.reason), { once: true })
    }))
    const actions = new ActionRegistry()
    actions.register({ type: "save", run })
    const actionRuntime = createActionRuntime({ registry: actions })
    const registry = new CardRegistry()
    const value = { version: 1, id: "doc", state: { value: "a" }, root: { kind: "stack", id: "root", children: [
      { kind: "form", id: "form", submit: { type: "save" }, children: [{ kind: "field", id: "field", bind: "value", fieldType: "text", label: "Value" }] },
      { kind: "button", id: "button", label: "Go", action: { type: "save", params: { value: { $state: "value" } } } },
    ] } }
    const host = document.createElement("div")
    const cleanup = mountUIDocument(host, validateUIDocument(value, { registry, actionRuntime }), { actionRuntime })
    const input = host.querySelector("input")!
    input.value = "latest"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    const button = host.querySelector<HTMLButtonElement>('[data-aigui-ui-id="button"]')!
    button.click()
    button.click()
    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0]?.[0]).toEqual({ value: "latest" })
    expect(button.disabled).toBe(true)
    expect(button.getAttribute("aria-busy")).toBe("true")
    reject(new Error("secret details"))
    await Promise.resolve(); await Promise.resolve()
    expect(host.querySelector('[data-aigui-ui-action-error="button"]')?.textContent).toBe("Action failed.")
    button.click()
    cleanup()
    await Promise.resolve()
    expect(run.mock.calls[1]?.[1].signal.aborted).toBe(true)
  })

  it("validates forms, focuses the first invalid field, submits typed state, and exposes accessible errors", async () => {
    const run = vi.fn()
    const actions = new ActionRegistry()
    actions.register({ type: "save", run })
    const actionRuntime = createActionRuntime({ registry: actions })
    const registry = new CardRegistry()
    const value = { version: 1, id: "doc", state: { name: "", count: 2, enabled: false }, root: { kind: "form", id: "form", submit: { type: "save" }, children: [
      { kind: "field", id: "name", bind: "name", fieldType: "text", label: "Name", required: true },
      { kind: "field", id: "count", bind: "count", fieldType: "number", label: "Count" },
      { kind: "field", id: "enabled", bind: "enabled", fieldType: "checkbox", label: "Enabled" },
    ] } }
    const host = document.createElement("div")
    document.body.appendChild(host)
    mountUIDocument(host, validateUIDocument(value, { registry, actionRuntime }), { actionRuntime })
    const form = host.querySelector("form")!
    form.requestSubmit()
    const name = host.querySelector<HTMLInputElement>('[data-aigui-ui-id="name"] input')!
    expect(document.activeElement).toBe(name)
    expect(name.getAttribute("aria-invalid")).toBe("true")
    expect(host.querySelector('[data-aigui-ui-field-error="name"]')?.getAttribute("role")).toBe("alert")
    name.value = "Ada"; name.dispatchEvent(new Event("input", { bubbles: true }))
    form.requestSubmit()
    await Promise.resolve()
    expect(run).toHaveBeenCalledWith({ name: "Ada", count: 2, enabled: false }, expect.objectContaining({ cardType: "ui:doc:form" }))
    host.remove()
  })

  it("treats an empty number field as missing rather than zero", () => {
    const { registry, actionRuntime } = setup()
    const value = { version: 1, id: "doc", state: { count: 2 }, root: { kind: "form", id: "form", submit: { type: "save" }, children: [
      { kind: "field", id: "count", bind: "count", fieldType: "number", label: "Count", required: true },
    ] } }
    const host = document.createElement("div")
    mountUIDocument(host, validateUIDocument(value, { registry, actionRuntime }), { actionRuntime })
    const input = host.querySelector<HTMLInputElement>("input")!
    input.value = ""
    input.dispatchEvent(new Event("input", { bubbles: true }))
    host.querySelector<HTMLFormElement>("form")!.requestSubmit()
    expect(input.getAttribute("aria-invalid")).toBe("true")
  })

  it("isolates multiple mounts and forwards card actions through the bridge", () => {
    const { registry, actionRuntime } = setup()
    const document = validateUIDocument(fullDocument, { registry, actionRuntime })
    const hosts = [document, document].map(() => documentNode())
    let cardRequest: { type: string; data: unknown } | undefined
    const context: RenderMountContext = { mountCard: (_host, request) => { cardRequest = request; return { update() {}, destroy() {} } } }
    mountUIDocument(hosts[0], document, { actionRuntime, mountContext: context })
    mountUIDocument(hosts[1], document, { actionRuntime })
    hosts[0].querySelector<HTMLInputElement>('[data-aigui-ui-id="f-name"] input')!.value = "One"
    hosts[0].querySelector<HTMLInputElement>('[data-aigui-ui-id="f-name"] input')!.dispatchEvent(new Event("input", { bubbles: true }))
    expect(hosts[0].querySelector('[data-aigui-ui-id="name"]')?.textContent).toBe("One")
    expect(hosts[1].querySelector('[data-aigui-ui-id="name"]')?.textContent).toBe("Ada")
    expect(cardRequest?.type).toBe("weather")
  })
})

function documentNode(): HTMLElement {
  return globalThis.document.createElement("div")
}

describe("public surface", () => {
  it("exports bounded CSS and remains import-safe without a DOM", async () => {
    expect(uiCss).toContain("[data-aigui-ui]")
    expect(uiCss).not.toContain("url(")
    expect(typeof mountUIDocument).toBe("function")
  })
})
