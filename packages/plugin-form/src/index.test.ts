// @vitest-environment jsdom
import { ActionRegistry, collectNodeRenderers, createActionRuntime, createParser, type ActionState, type RenderOutput } from "@ai-gui/core"
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

  it("rejects unsafe regular expressions without compiling them", () => {
    const OriginalRegExp = globalThis.RegExp
    const construct = vi.fn(() => { throw new Error("must not compile rejected patterns") })
    globalThis.RegExp = construct as unknown as RegExpConstructor
    try {
      const parsed = parseFormDefinition(JSON.stringify({
        id: "unsafe",
        fields: [{ name: "value", type: "text", label: "Value", pattern: "^(a+)+$" }],
        submitAction: "save",
      }))
      expect(parsed.valid).toBe(false)
      expect(construct).not.toHaveBeenCalled()
    } finally {
      globalThis.RegExp = OriginalRegExp
    }
  })

  it.each(["(a+)", "(a)", "a(?=b)", "(a)\\1", "a+.*b", "a+a+"])("rejects unsupported pattern %s", (pattern) => {
    const parsed = parseFormDefinition(JSON.stringify({
      id: "unsafe",
      fields: [{ name: "value", type: "text", label: "Value", pattern }],
      submitAction: "save",
    }))
    expect(parsed.valid).toBe(false)
  })

  it.each(["^[A-Z]", "^[A-Za-z0-9_-]{1,32}$", "order-\\d+"])("accepts linear pattern %s", (pattern) => {
    const parsed = parseFormDefinition(JSON.stringify({
      id: "safe",
      fields: [{ name: "value", type: "text", label: "Value", pattern }],
      submitAction: "save",
    }))
    expect(parsed.valid).toBe(true)
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
    expect(host.querySelector("label")?.htmlFor).toBe(from.id)
    expect(from.getAttribute("aria-describedby")).toContain("error")
    expect(host.querySelector("textarea[name=notes]")).toBeTruthy()
    expect(host.querySelector("input[type=date][name=date]")).toBeTruthy()
    expect(host.querySelector("select[name=class]")).toBeTruthy()
    expect(host.querySelector("input[type=checkbox][name=direct]")).toBeTruthy()
    expect(host.querySelectorAll("input[type=radio][name=meal]")).toHaveLength(2)

    formEl.requestSubmit()
    expect(run).not.toHaveBeenCalled()
    expect(host.querySelector('[data-aigui-form-field-error="from"]')?.textContent).toBe("")

    from.value = "Paris"
    people.value = "2"
    direct.checked = true
    const submit = host.querySelector<HTMLButtonElement>("[data-aigui-form-submit]")!
    submit.click()
    submit.click()
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ from: "Paris", people: 2, direct: true }), expect.anything())
    expect(submit.disabled).toBe(true)
    resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(submit.disabled).toBe(true)
    expect(submit.textContent).toBe("Submitted")
    expect(formEl.hasAttribute("data-aigui-form-submitted")).toBe(true)
    submit.click()
    expect(run).toHaveBeenCalledTimes(1)
    if (typeof cleanup === "function") cleanup()
  })

  it("mounts restored forms as submitted and never dispatches them", () => {
    const run = vi.fn()
    const registry = new ActionRegistry()
    registry.register({ type: "travel.search", run })
    const out = collectNodeRenderers([form({
      actionRuntime: createActionRuntime({ registry }),
      submitted: true,
      submittedLabel: "Saved",
    })]).form({ key: "form", type: "form", complete: true, content: JSON.stringify(definition) }) as RenderOutput
    if (out.kind !== "mount") throw new Error("expected mount")
    const host = document.createElement("div")
    out.mount(host)
    const formEl = host.querySelector<HTMLFormElement>("form")!
    const submit = host.querySelector<HTMLButtonElement>("[data-aigui-form-submit]")!
    expect(formEl.hasAttribute("data-aigui-form-submitted")).toBe(true)
    expect(Array.from(formEl.elements).every((element) => !("disabled" in element) || element.disabled)).toBe(true)
    expect(submit.textContent).toBe("Saved")
    submit.click()
    expect(run).not.toHaveBeenCalled()
  })

  it("restores the form after a failed action so it can be retried", async () => {
    const run = vi.fn().mockRejectedValue(new Error("failed"))
    const registry = new ActionRegistry()
    registry.register({ type: "travel.search", run })
    const out = collectNodeRenderers([form({ actionRuntime: createActionRuntime({ registry }) })]).form({
      key: "form", type: "form", complete: true, content: JSON.stringify({ ...definition, fields: [] }),
    }) as RenderOutput
    if (out.kind !== "mount") throw new Error("expected mount")
    const host = document.createElement("div")
    out.mount(host)
    const submit = host.querySelector<HTMLButtonElement>("[data-aigui-form-submit]")!
    submit.click()
    await Promise.resolve()
    await Promise.resolve()
    expect(submit.disabled).toBe(false)
    expect(host.querySelector("form")?.hasAttribute("data-aigui-form-submitted")).toBe(false)
    submit.click()
    expect(run).toHaveBeenCalledTimes(2)
  })

  it("never dispatches when a radio option is selected", () => {
    const run = vi.fn()
    const registry = new ActionRegistry()
    registry.register({ type: "travel.search", run })
    const plugin = form({ actionRuntime: createActionRuntime({ registry }) })
    const node = createParser({ plugins: [plugin] })(`\`\`\`form\n${JSON.stringify(definition)}\n\`\`\``)[0]
    const out = collectNodeRenderers([plugin]).form(node) as RenderOutput
    if (out.kind !== "mount") throw new Error("expected mount")
    const host = document.createElement("div")
    out.mount(host)
    const option = host.querySelector<HTMLInputElement>('input[type="radio"][value="veg"]')!
    host.querySelector<HTMLLabelElement>(`label[for="${option.id}"]`)!.click()
    expect(option.checked).toBe(true)
    expect(run).not.toHaveBeenCalled()
    host.querySelector("form")!.requestSubmit()
    expect(run).not.toHaveBeenCalled()
  })

  it("rejects unknown actions before mounting and displays only safe Action errors", async () => {
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
    host.querySelector<HTMLButtonElement>("[data-aigui-form-submit]")!.click()
    await Promise.resolve()
    await Promise.resolve()
    expect(host.querySelector("[data-aigui-form-action-error]")?.textContent).toBe('Action "travel.search" failed')
  })

  it("isolates action state, cancellation, and DOM ids for every mount", async () => {
    const aborted: string[] = []
    const states: ActionState[] = []
    const registry = new ActionRegistry()
    registry.register({
      type: "travel.search",
      run: (_params, { signal, cardType }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          aborted.push(cardType ?? "")
          reject(signal.reason)
        }, { once: true })
      }),
    })
    const runtime = createActionRuntime({ registry })
    runtime.subscribe((state) => states.push(state))
    const out = collectNodeRenderers([form({ actionRuntime: runtime })]).form({
      key: "form", type: "form", complete: true, content: JSON.stringify({ ...definition, fields: [] }),
    }) as RenderOutput
    if (out.kind !== "mount") throw new Error("expected mount")
    const firstHost = document.createElement("div")
    const secondHost = document.createElement("div")
    const cleanupFirst = out.mount(firstHost)
    const cleanupSecond = out.mount(secondHost)
    firstHost.querySelector<HTMLButtonElement>("[data-aigui-form-submit]")!.click()
    secondHost.querySelector<HTMLButtonElement>("[data-aigui-form-submit]")!.click()

    const pending = states.filter((state) => state.status === "pending")
    expect(pending).toHaveLength(2)
    expect(new Set(pending.map((state) => state.key)).size).toBe(2)
    expect(new Set(pending.map((state) => state.cardType)).size).toBe(2)
    expect(firstHost.querySelector("form")?.getAttribute("data-aigui-form-instance")).not.toBe(
      secondHost.querySelector("form")?.getAttribute("data-aigui-form-instance"),
    )

    if (typeof cleanupFirst === "function") cleanupFirst()
    await Promise.resolve()
    expect(aborted).toEqual([pending[0]?.cardType])
    expect(runtime.getState(pending[1]!.key).status).toBe("pending")
    if (typeof cleanupSecond === "function") cleanupSecond()
    await Promise.resolve()
  })

  it("uses unique DOM ids while preserving label and aria relationships", () => {
    const registry = new ActionRegistry()
    registry.register({ type: "travel.search", run: vi.fn() })
    const out = collectNodeRenderers([form({ actionRuntime: createActionRuntime({ registry }) })]).form({
      key: "form", type: "form", complete: true, content: JSON.stringify(definition),
    }) as RenderOutput
    if (out.kind !== "mount") throw new Error("expected mount")
    const firstHost = document.createElement("div")
    const secondHost = document.createElement("div")
    out.mount(firstHost)
    out.mount(secondHost)
    const firstInput = firstHost.querySelector<HTMLInputElement>('[name="from"]')!
    const secondInput = secondHost.querySelector<HTMLInputElement>('[name="from"]')!
    expect(firstInput.id).not.toBe(secondInput.id)
    expect(firstHost.querySelector("label")?.htmlFor).toBe(firstInput.id)
    expect(secondHost.querySelector("label")?.htmlFor).toBe(secondInput.id)
    expect(firstHost.querySelector('[data-aigui-form-field-error="from"]')?.id).toBe(firstInput.getAttribute("aria-describedby"))
    expect(secondHost.querySelector('[data-aigui-form-field-error="from"]')?.id).toBe(secondInput.getAttribute("aria-describedby"))
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
    host.querySelector<HTMLButtonElement>("[data-aigui-form-submit]")!.click()
    if (typeof cleanup === "function") cleanup()
    await Promise.resolve()
    expect(aborted).toHaveBeenCalledOnce()
  })

  it("documents the form fence and supported fields", () => {
    expect(formPromptSpec()).toContain("```form")
    expect(formPromptSpec()).toContain("checkbox")
  })
})

describe("plugin-form outcomes", () => {
  const quiz = {
    id: "q1",
    fields: [{ name: "answer", type: "radio", label: "请选择", required: true, options: [{ label: "A. 100", value: "A" }, { label: "B. 7", value: "B" }] }],
    submitAction: "quiz.answer",
    submitLabel: "提交答案",
  }

  async function submit(run: () => unknown) {
    const registry = new ActionRegistry()
    registry.register({ type: "quiz.answer", run })
    const plugin = form({ actionRuntime: createActionRuntime({ registry }) })
    const node = createParser({ plugins: [plugin] })(`\`\`\`form\n${JSON.stringify(quiz)}\n\`\`\``)[0]
    const out = collectNodeRenderers([plugin]).form(node) as RenderOutput
    if (out.kind !== "mount") throw new Error("expected a mount output")
    const host = document.createElement("div")
    out.mount(host)
    host.querySelector<HTMLInputElement>('input[value="A"]')!.checked = true
    host.querySelector<HTMLButtonElement>("[data-aigui-form-submit]")!.click()
    await vi.waitFor(() => expect(host.querySelector("form")?.hasAttribute("data-aigui-form-submitted")).toBe(true))
    return host
  }

  it("shows the verdict the handler returned", async () => {
    // A wrong answer submits perfectly well, so the form used to disable itself and read
    // "Submitted" whether the answer was right or not — the result was thrown away.
    const host = await submit(() => ({ outcome: { tone: "warning", message: "再看一下极限的定义", fields: { answer: "warning" } } }))

    expect(host.querySelector("form")?.getAttribute("data-aigui-form-outcome")).toBe("warning")
    expect(host.querySelector("[data-aigui-form-outcome-message]")?.textContent).toBe("再看一下极限的定义")
    expect(host.querySelector('[data-aigui-form-field="answer"]')?.getAttribute("data-aigui-form-field-outcome")).toBe("warning")
  })

  it("keeps a verdict out of the error slot, which means the submission failed", async () => {
    const host = await submit(() => ({ outcome: { tone: "warning", message: "差一点" } }))

    const error = host.querySelector("[data-aigui-form-action-error]") as HTMLElement
    expect(error.hidden).toBe(true)
    expect(error.textContent).toBe("")
  })

  it("says nothing when the handler did not judge the answer", async () => {
    const host = await submit(() => ({ submitted: true }))

    expect(host.querySelector("form")?.hasAttribute("data-aigui-form-outcome")).toBe(false)
    expect((host.querySelector("[data-aigui-form-outcome-message]") as HTMLElement).hidden).toBe(true)
  })
})
