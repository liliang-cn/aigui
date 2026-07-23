// @vitest-environment jsdom
import { ActionRegistry, collectNodeRenderers, createActionRuntime, createParser, type RenderOutput } from "@ai-gui/core"
import { describe, expect, it, vi } from "vitest"
import { form, formPromptSpec, parseFormDefinition, validateFormValues } from "./index"

const definition = {
  id: "travel-search",
  fields: [
    { name: "from", type: "text", label: "From", required: true, minLength: 2, maxLength: 20, pattern: "^[A-Z]" },
    { name: "notes", type: "textarea", label: "Notes", maxLength: 50 },
    { name: "people", type: "number", label: "People", min: 1, max: 8 },
    { name: "date", type: "date", label: "Departure" },
    { name: "class", type: "select", label: "Class", options: [{ label: "Economy", value: "economy" }] },
    { name: "direct", type: "checkbox", label: "Direct only" },
    { name: "meal", type: "radio", label: "Meal", options: [{ label: "None", value: "none" }, { label: "Vegetarian", value: "veg" }] },
  ],
  submitAction: "travel.search",
  submitLabel: "Search",
} as const

describe("plugin-form", () => {
  it("parses only the safe supported schema", () => {
    expect(parseFormDefinition(JSON.stringify(definition))).toEqual({ valid: true, data: definition })
    expect(parseFormDefinition('{"id":"x","fields":[],"submitAction":"x","url":"https://evil"}').valid).toBe(false)
    expect(parseFormDefinition('{"id":"x","fields":[{"name":"x","type":"script","label":"X"}],"submitAction":"x"}').valid).toBe(false)
    expect(parseFormDefinition('{"id":"x","fields":[{"name":"__proto__","type":"text","label":"X"}],"submitAction":"x"}').valid).toBe(false)
  })

  it("validates required, length, pattern, and numeric bounds locally", () => {
    const parsed = parseFormDefinition(JSON.stringify(definition))
    if (!parsed.valid) throw new Error("fixture must be valid")
    expect(validateFormValues(parsed.data, { from: "a", people: 9 }).errors).toEqual({
      from: "Must contain at least 2 characters.",
      people: "Must be at most 8.",
    })
    expect(validateFormValues(parsed.data, { from: "ab", people: 2 }).errors.from).toBe("Must match the required format.")
  })

  it("is complete-gated and safely falls back for closed invalid JSON", () => {
    const plugin = form({ actionRuntime: createActionRuntime({ registry: new ActionRegistry() }) })
    const parse = createParser({ plugins: [plugin] })
    const incomplete = parse('```form\n{"id":"x"').at(0)!
    expect(incomplete.complete).toBe(false)
    const loading = collectNodeRenderers([plugin]).form(incomplete) as RenderOutput
    expect(loading.kind).toBe("html")
    if (loading.kind === "html") expect(loading.html).toContain("data-aigui-block-loading")
    const invalid = parse("```form\nnot json\n```").at(0)!
    expect(invalid.complete).toBe(true)
    const out = collectNodeRenderers([plugin]).form(invalid) as RenderOutput
    expect(out.kind).toBe("html")
    if (out.kind === "html") expect(out.html).toContain("data-aigui-form-invalid")
  })

  it("renders accessible fields and submits typed values only through ActionRuntime", async () => {
    let resolve!: () => void
    const run = vi.fn(() => new Promise<void>((done) => { resolve = done }))
    const registry = new ActionRegistry()
    registry.register({ type: "travel.search", run })
    const runtime = createActionRuntime({ registry })
    const plugin = form({ actionRuntime: runtime })
    const node = createParser({ plugins: [plugin] })(`\`\`\`form\n${JSON.stringify(definition)}\n\`\`\``)[0]
    const out = collectNodeRenderers([plugin]).form(node) as RenderOutput
    expect(out.kind).toBe("mount")
    if (out.kind !== "mount") return
    const host = document.createElement("div")
    const cleanup = out.mount(host)
    const formEl = host.querySelector("form")!
    const from = host.querySelector<HTMLInputElement>('[name="from"]')!
    const people = host.querySelector<HTMLInputElement>('[name="people"]')!
    const direct = host.querySelector<HTMLInputElement>('[name="direct"]')!
    expect(host.querySelector('label[for="travel-search-from"]')).toBeTruthy()
    expect(from.getAttribute("aria-describedby")).toContain("error")
    expect(host.querySelector("textarea[name=notes]")).toBeTruthy()
    expect(host.querySelector("input[type=date][name=date]")).toBeTruthy()
    expect(host.querySelector("select[name=class]")).toBeTruthy()
    expect(host.querySelector("input[type=checkbox][name=direct]")).toBeTruthy()
    expect(host.querySelectorAll("input[type=radio][name=meal]")).toHaveLength(2)

    formEl.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    expect(run).not.toHaveBeenCalled()
    expect(host.querySelector('[data-aigui-form-field-error="from"]')?.textContent).toContain("required")

    from.value = "Paris"
    people.value = "2"
    direct.checked = true
    formEl.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    formEl.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ from: "Paris", people: 2, direct: true }), expect.anything())
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)
    resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false)
    if (typeof cleanup === "function") cleanup()
  })

  it("rejects unknown actions before mounting and displays Action errors", async () => {
    const missingRuntime = createActionRuntime({ registry: new ActionRegistry() })
    const missing = collectNodeRenderers([form({ actionRuntime: missingRuntime })]).form({
      key: "form", type: "form", complete: true, content: JSON.stringify(definition),
    }) as RenderOutput
    expect(missing.kind).toBe("html")
    if (missing.kind === "html") expect(missing.html).toContain("data-aigui-form-invalid")

    const registry = new ActionRegistry()
    registry.register({ type: "travel.search", run: () => { throw new Error("Search unavailable") } })
    const out = collectNodeRenderers([form({ actionRuntime: createActionRuntime({ registry }) })]).form({
      key: "form", type: "form", complete: true, content: JSON.stringify({ ...definition, fields: [] }),
    }) as RenderOutput
    if (out.kind !== "mount") throw new Error("expected mount")
    const host = document.createElement("div")
    out.mount(host)
    host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await Promise.resolve()
    await Promise.resolve()
    expect(host.querySelector("[data-aigui-form-action-error]")?.textContent).toContain("Search unavailable")
  })

  it("aborts its own pending action when the adapter unmounts it", async () => {
    const aborted = vi.fn()
    const registry = new ActionRegistry()
    registry.register({
      type: "travel.search",
      run: (_params, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => { aborted(); reject(signal.reason) }, { once: true })
      }),
    })
    const out = collectNodeRenderers([form({ actionRuntime: createActionRuntime({ registry }) })]).form({
      key: "form", type: "form", complete: true, content: JSON.stringify({ ...definition, fields: [] }),
    }) as RenderOutput
    if (out.kind !== "mount") throw new Error("expected mount")
    const host = document.createElement("div")
    const cleanup = out.mount(host)
    host.querySelector("form")!.requestSubmit()
    if (typeof cleanup === "function") cleanup()
    await Promise.resolve()
    expect(aborted).toHaveBeenCalledOnce()
  })

  it("documents the form fence and supported fields", () => {
    expect(formPromptSpec()).toContain("```form")
    expect(formPromptSpec()).toContain("checkbox")
  })
})
