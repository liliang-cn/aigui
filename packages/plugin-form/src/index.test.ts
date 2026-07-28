// @vitest-environment jsdom
import { ActionRegistry, collectNodeRenderers, createActionRuntime, createParser, type ActionState, type RenderOutput } from "@ai-gui/core"
import { describe, expect, it, vi } from "vitest"
import { form, formPromptSpec, parseFormDefinition, validateFormValues, type FormDefinition, type FormPluginOptions } from "./index"

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

describe("plugin-form label rendering", () => {
  const mathy = {
    id: "concept-check",
    fields: [
      {
        name: "answer",
        type: "radio",
        label: "$G_\\parallel$ 的值是多少？",
        required: true,
        expect: "B",
        options: [
          { label: "A. 20 N", value: "A" },
          { label: "B. $20\\sqrt{3}$ N", value: "B" },
        ],
      },
    ],
    submitAction: "quiz.answer",
  }

  function mountMathy(renderLabel?: FormPluginOptions["renderLabel"]) {
    const registry = new ActionRegistry()
    registry.register({ type: "quiz.answer", run: () => ({ submitted: true }) })
    const plugin = form({ actionRuntime: createActionRuntime({ registry }), renderLabel })
    const node = createParser({ plugins: [plugin] })(`\`\`\`form\n${JSON.stringify(mathy)}\n\`\`\``)[0]
    const out = collectNodeRenderers([plugin]).form(node) as RenderOutput
    if (out.kind !== "mount") throw new Error("expected a mount output")
    const host = document.createElement("div")
    out.mount(host)
    return host
  }

  it("leaves a label as text when the host has no renderer", () => {
    // The default has to stay text: every label here is model output, and a question that arrives with
    // markup in it must not become markup.
    const host = mountMathy()

    expect(host.querySelector("legend")?.textContent).toBe("$G_\\parallel$ 的值是多少？")
    expect(host.querySelector("legend")?.querySelector("*")).toBeNull()
  })

  it("lets the host typeset a label, including an option's", () => {
    // Without this a maths question renders as "$20\sqrt{3}$ N" in front of the learner — the answer
    // they are being asked to choose, written in source.
    const host = mountMathy((text) => {
      const span = document.createElement("span")
      span.className = "typeset"
      span.textContent = text.replace(/\$([^$]+)\$/g, "⟨$1⟩")
      return span
    })

    expect(host.querySelector("legend .typeset")?.textContent).toBe("⟨G_\\parallel⟩ 的值是多少？")
    const optionLabels = Array.from(host.querySelectorAll("label .typeset")).map((node) => node.textContent)
    expect(optionLabels).toContain("B. ⟨20\\sqrt{3}⟩ N")
  })

  it("falls back to text when the host's renderer declines or throws", () => {
    // A typesetter that cannot parse one formula must cost that formula's appearance, not the question:
    // an exception here would otherwise take down the whole form and leave nothing to answer.
    const declined = mountMathy(() => undefined)
    expect(declined.querySelector("legend")?.textContent).toBe("$G_\\parallel$ 的值是多少？")

    const threw = mountMathy(() => {
      throw new Error("KaTeX gave up")
    })
    expect(threw.querySelector("legend")?.textContent).toBe("$G_\\parallel$ 的值是多少？")
    expect(threw.querySelectorAll("label").length).toBeGreaterThan(0)
  })
})

describe("plugin-form audio answers", () => {
  const spoken = {
    id: "speak",
    fields: [
      {
        name: "reading",
        type: "audio",
        label: "读出这句：Ich möchte über mein Projekt sprechen",
        required: true,
        maxSeconds: 20,
      },
    ],
    submitAction: "quiz.answer",
  }

  it("parses an audio field and keeps its own recording limit", () => {
    const parsed = parseFormDefinition(JSON.stringify(spoken))

    expect(parsed.valid).toBe(true)
    if (!parsed.valid) return
    const field = parsed.data.fields[0]
    expect(field.type).toBe("audio")
    expect(field.type === "audio" && field.maxSeconds).toBe(20)
  })

  it("refuses an expected answer on a recording", () => {
    // Two recordings of one sentence are never equal, so an expectation could only ever be wrong. What
    // makes this worth an error rather than a shrug: a form that greys itself green on a string compare
    // would tell a learner their pronunciation was correct because the base64 happened to match.
    const parsed = parseFormDefinition(JSON.stringify({
      ...spoken,
      fields: [{ ...spoken.fields[0], expect: "Ich möchte über mein Projekt sprechen" }],
    }))

    expect(parsed.valid).toBe(false)
    if (parsed.valid) return
    expect(parsed.issues.join(" ")).toContain("judged by the host")
  })

  it("refuses a recording limit on a field that does not record", () => {
    const parsed = parseFormDefinition(JSON.stringify({
      ...spoken,
      fields: [{ name: "answer", type: "text", label: "写出来", maxSeconds: 20 }],
    }))

    expect(parsed.valid).toBe(false)
    if (parsed.valid) return
    expect(parsed.issues.join(" ")).toContain("only be set on an audio field")
  })

  it("carries a recording as its value and refuses anything that is not one", () => {
    const definitionOf = (source: object) => {
      const parsed = parseFormDefinition(JSON.stringify(source))
      if (!parsed.valid) throw new Error(parsed.issues.join(" "))
      return parsed.data
    }
    const form = definitionOf(spoken)

    const recorded = validateFormValues(form, { reading: "data:audio/webm;base64,GkXfo0AgQ==" })
    expect(recorded.valid).toBe(true)
    expect(recorded.values.reading).toBe("data:audio/webm;base64,GkXfo0AgQ==")

    // A field the host forwards is a field that must not carry an arbitrary payload: only audio, and
    // only base64 — otherwise `data:text/html,<script>` travels wherever the recording was going.
    const smuggled = validateFormValues(form, { reading: "data:text/html;base64,PHNjcmlwdD4=" })
    expect(smuggled.valid).toBe(false)
    expect(smuggled.errors.reading).toBe("Must be a recording.")

    const nothing = validateFormValues(form, {})
    expect(nothing.valid).toBe(false)
    expect(nothing.errors.reading).toBe("Record an answer.")
  })
})

describe("plugin-form audio rendering", () => {
  const spoken = {
    id: "speak",
    fields: [{ name: "reading", type: "audio", label: "读出这句", required: true, maxSeconds: 20 }],
    submitAction: "quiz.answer",
  }

  function mountSpoken(options: Partial<FormPluginOptions> = {}) {
    const registry = new ActionRegistry()
    registry.register({ type: "quiz.answer", run: () => ({ submitted: true }) })
    const plugin = form({ actionRuntime: createActionRuntime({ registry }), ...options })
    const node = createParser({ plugins: [plugin] })(`\`\`\`form\n${JSON.stringify(spoken)}\n\`\`\``)[0]
    const out = collectNodeRenderers([plugin]).form(node) as RenderOutput
    if (out.kind !== "mount") throw new Error("expected a mount output")
    const host = document.createElement("div")
    out.mount(host)
    return host
  }

  it("renders a record button and carries the recording in the form's own value", () => {
    // The hidden input is the control on purpose: it makes a recording an ordinary form value, so
    // reading, restoring and re-grading all take the same path as a text box.
    const host = mountSpoken()

    expect(host.querySelector('[data-aigui-form-record="reading"]')).not.toBeNull()
    const control = host.querySelector<HTMLInputElement>('input[name="reading"]')!
    expect(control.type).toBe("hidden")
    expect(host.querySelector<HTMLAudioElement>('[data-aigui-form-playback="reading"]')!.hidden).toBe(true)
  })

  it("brings the player back with a restored recording", () => {
    // A restored value alone is invisible: the person would see a Record button and no sign that their
    // answer is already in there, which reads as an answer that was lost.
    const recording = "data:audio/webm;base64,GkXfo0AgQ=="
    const host = mountSpoken({ restore: () => ({ values: { reading: recording } }) })

    const player = host.querySelector<HTMLAudioElement>('[data-aigui-form-playback="reading"]')!
    expect(player.hidden).toBe(false)
    expect(player.getAttribute("src")).toBe(recording)
  })

  it("disables recording where the browser cannot do it, instead of offering a dead button", () => {
    const original = globalThis.MediaRecorder
    // @ts-expect-error — deleting a global for the duration of one test
    delete globalThis.MediaRecorder
    try {
      const host = mountSpoken()
      const button = host.querySelector<HTMLButtonElement>('[data-aigui-form-record="reading"]')!
      expect(button.disabled).toBe(true)
      expect(button.textContent).toMatch(/not supported/i)
    } finally {
      globalThis.MediaRecorder = original
    }
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

describe("plugin-form expectations", () => {
  const quiz = (expectValue: string) => ({
    id: "q1",
    fields: [{ name: "answer", type: "radio", label: "请选择", required: true, expect: expectValue, options: [{ label: "A. 100", value: "A" }, { label: "B. 7", value: "B" }] }],
    submitAction: "quiz.answer",
  })

  async function answer(pick: string, expectValue: string, run: () => unknown = () => ({ submitted: true })) {
    const registry = new ActionRegistry()
    registry.register({ type: "quiz.answer", run })
    const plugin = form({ actionRuntime: createActionRuntime({ registry }) })
    const node = createParser({ plugins: [plugin] })(`\`\`\`form\n${JSON.stringify(quiz(expectValue))}\n\`\`\``)[0]
    const out = collectNodeRenderers([plugin]).form(node) as RenderOutput
    if (out.kind !== "mount") throw new Error("expected a mount output")
    const host = document.createElement("div")
    out.mount(host)
    host.querySelector<HTMLInputElement>(`input[value="${pick}"]`)!.checked = true
    host.querySelector<HTMLButtonElement>("[data-aigui-form-submit]")!.click()
    await vi.waitFor(() => expect(host.querySelector("form")?.hasAttribute("data-aigui-form-submitted")).toBe(true))
    return host.querySelector("form")!
  }

  it("marks a wrong answer as soon as it is submitted", async () => {
    const formEl = await answer("A", "B")

    expect(formEl.getAttribute("data-aigui-form-outcome")).toBe("warning")
    expect(formEl.querySelector('[data-aigui-form-field="answer"]')?.getAttribute("data-aigui-form-field-outcome")).toBe("warning")
  })

  it("marks a right answer", async () => {
    const formEl = await answer("B", "B")

    expect(formEl.getAttribute("data-aigui-form-outcome")).toBe("positive")
  })

  it("lets the answer through rather than blocking it", async () => {
    // A wrong answer is an answer: the tutor still has to see it to teach from it, so `expect`
    // reports and never validates.
    const run = vi.fn(() => ({ submitted: true }))
    const formEl = await answer("A", "B", run)

    expect(run).toHaveBeenCalledWith({ answer: "A" }, expect.anything())
    expect(formEl.hasAttribute("data-aigui-form-submitted")).toBe(true)
  })

  it("takes the handler's verdict over its own comparison", async () => {
    // The handler knows more than a value match: partial credit, a rephrased answer, a mark scheme.
    const formEl = await answer("A", "B", () => ({ outcome: { tone: "neutral", message: "这题按过程给分" } }))

    expect(formEl.getAttribute("data-aigui-form-outcome")).toBe("neutral")
    expect(formEl.querySelector("[data-aigui-form-outcome-message]")?.textContent).toBe("这题按过程给分")
  })

  it("rejects an expectation that is not a value a field can hold", async () => {
    const { parseFormDefinition } = await import("./index")
    const result = parseFormDefinition(JSON.stringify({ id: "q", submitAction: "a", fields: [{ name: "answer", type: "text", label: "答", expect: { b: 1 } }] }))

    expect(result.valid).toBe(false)
  })
})

describe("plugin-form restored submissions", () => {
  const quiz = {
    id: "q1",
    fields: [
      { name: "answer", type: "radio", label: "请选择", required: true, expect: "B", options: [{ label: "A. 100", value: "A" }, { label: "B. 7", value: "B" }] },
      { name: "why", type: "textarea", label: "理由" },
      { name: "sure", type: "checkbox", label: "确定" },
    ],
    submitAction: "quiz.answer",
  }

  function mount(options: Partial<Parameters<typeof form>[0]> = {}, definition: unknown = quiz) {
    const registry = new ActionRegistry()
    const run = vi.fn(() => ({ submitted: true }))
    registry.register({ type: "quiz.answer", run })
    const plugin = form({ actionRuntime: createActionRuntime({ registry }), ...options })
    const node = createParser({ plugins: [plugin] })(`\`\`\`form\n${JSON.stringify(definition)}\n\`\`\``)[0]
    const out = collectNodeRenderers([plugin]).form(node) as RenderOutput
    if (out.kind !== "mount") throw new Error("expected a mount output")
    const host = document.createElement("div")
    out.mount(host)
    return { host, formEl: host.querySelector("form")!, run }
  }

  it("puts the answer back, not just the lock", () => {
    // `submitted: true` alone left a disabled question with nothing chosen in it — which claims to
    // have been answered and cannot say with what. This is the whole point of restoring.
    const { formEl } = mount({
      restore: () => ({ values: { answer: "B", why: "因为 3+4=7", sure: true } }),
    })

    expect(formEl.querySelector<HTMLInputElement>('input[value="B"]')!.checked).toBe(true)
    expect(formEl.querySelector<HTMLInputElement>('input[value="A"]')!.checked).toBe(false)
    expect(formEl.querySelector<HTMLTextAreaElement>('[name="why"]')!.value).toBe("因为 3+4=7")
    expect(formEl.querySelector<HTMLInputElement>('input[name="sure"]')!.checked).toBe(true)
    expect(formEl.hasAttribute("data-aigui-form-submitted")).toBe(true)
  })

  it("will not take a second answer for a question already answered", () => {
    const { formEl, run } = mount({ restore: () => ({ values: { answer: "A" } }) })

    expect(Array.from(formEl.elements).every((element) => (element as HTMLInputElement).disabled)).toBe(true)
    formEl.querySelector<HTMLButtonElement>("[data-aigui-form-submit]")!.click()
    expect(run).not.toHaveBeenCalled()
  })

  it("grades a restored answer again so a quiz comes back coloured", () => {
    // The host stores what was answered; it should not have to store the marking as well.
    const wrong = mount({ restore: () => ({ values: { answer: "A" } }) })
    expect(wrong.formEl.getAttribute("data-aigui-form-outcome")).toBe("warning")

    const right = mount({ restore: () => ({ values: { answer: "B" } }) })
    expect(right.formEl.getAttribute("data-aigui-form-outcome")).toBe("positive")
  })

  it("prefers a stored verdict over grading the values again", () => {
    const { formEl } = mount({
      restore: () => ({ values: { answer: "A" }, outcome: { tone: "neutral", message: "按过程给分" } }),
    })

    expect(formEl.getAttribute("data-aigui-form-outcome")).toBe("neutral")
    expect(formEl.querySelector("[data-aigui-form-outcome-message]")?.textContent).toBe("按过程给分")
  })

  it("only restores the form the submission belongs to", () => {
    const seen: string[] = []
    mount({
      restore: (formId) => {
        seen.push(formId)
        return formId === "other" ? { values: { answer: "A" } } : undefined
      },
    })

    expect(seen).toEqual(["q1"])
    // Asked about q1, told nothing: this form must be answerable.
    const { formEl } = mount({ restore: (formId) => (formId === "other" ? { values: { answer: "A" } } : undefined) })
    expect(formEl.hasAttribute("data-aigui-form-submitted")).toBe(false)
  })

  it("hands the submission to the host with the form id, so there is something to restore", async () => {
    const onSubmitted = vi.fn()
    const { formEl } = mount({ onSubmitted })

    formEl.querySelector<HTMLInputElement>('input[value="B"]')!.checked = true
    formEl.querySelector<HTMLButtonElement>("[data-aigui-form-submit]")!.click()

    await vi.waitFor(() => expect(onSubmitted).toHaveBeenCalled())
    // An untouched optional text field is left out, the same as the values the action receives —
    // and `restore` skips what is absent, so a round trip through the host does not invent a "".
    expect(onSubmitted).toHaveBeenCalledWith("q1", {
      values: { answer: "B", sure: false },
      outcome: expect.objectContaining({ tone: "positive" }),
    })
  })

  it("keeps the form usable when the host throws while persisting", async () => {
    // The host's bookkeeping failing is not the person's problem: their answer went through.
    const { formEl } = mount({
      onSubmitted: () => {
        throw new Error("disk full")
      },
    })

    formEl.querySelector<HTMLInputElement>('input[value="B"]')!.checked = true
    expect(() => formEl.querySelector<HTMLButtonElement>("[data-aigui-form-submit]")!.click()).not.toThrow()
    await vi.waitFor(() => expect(formEl.hasAttribute("data-aigui-form-submitted")).toBe(true))
  })

  describe("a question with several right answers", () => {
    /** The definition, parsed, so the tests below work on what the plugin would actually hold. */
    function assertValid(source: unknown): FormDefinition {
      const parsed = parseFormDefinition(JSON.stringify(source))
      if (!parsed.valid) throw new Error(parsed.issues.join(" "))
      return parsed.data
    }

    async function mountFormFor(source: unknown, extra: Partial<FormPluginOptions> = {}) {
      const registry = new ActionRegistry()
      registry.register({ type: "quiz.answer", run: async () => {} })
      const plugin = form({ actionRuntime: createActionRuntime({ registry }), ...extra })
      const out = collectNodeRenderers([plugin]).form({
        key: "form",
        type: "form",
        complete: true,
        content: JSON.stringify(source),
      }) as RenderOutput
      if (out.kind !== "mount") throw new Error("expected mount")
      const host = document.createElement("div")
      out.mount(host)
      return host
    }

    const multi = {
      id: "multi",
      fields: [
        {
          name: "answer",
          type: "checkboxes",
          label: "哪些属于同步复制？",
          required: true,
          options: [
            { label: "A. Protocol A", value: "A" },
            { label: "B. Protocol B", value: "B" },
            { label: "C. Protocol C", value: "C" },
          ],
          expect: ["B", "C"],
        },
      ],
      submitAction: "quiz.answer",
    }

    it("parses a checkboxes field with its options and its set of answers", () => {
      const parsed = parseFormDefinition(JSON.stringify(multi))

      expect(parsed.valid).toBe(true)
      if (!parsed.valid) return
      const field = parsed.data.fields[0]
      expect(field.type).toBe("checkboxes")
      expect(field.type === "checkboxes" && field.options).toHaveLength(3)
      expect(field.expect).toEqual(["B", "C"])
    })

    it("refuses an array answer on a field that can only hold one", () => {
      // Radios exclude each other, so a set of expected answers there is a question nobody can answer.
      const parsed = parseFormDefinition(JSON.stringify({
        ...multi,
        fields: [{ ...multi.fields[0], type: "radio", expect: ["B", "C"] }],
      }))

      expect(parsed.valid).toBe(false)
      if (parsed.valid) return
      expect(parsed.issues.join(" ")).toContain("only be an array on a checkboxes field")
    })

    it("keeps the chosen options in the order they were offered", () => {
      // Clicked C then B, and again B then C: the same answer, so it has to compare equal to itself.
      const clicked = validateFormValues(assertValid(multi), { answer: ["C", "B"] })

      expect(clicked.valid).toBe(true)
      expect(clicked.values.answer).toEqual(["B", "C"])
    })

    it("requires at least one, and honours a limit on how many", () => {
      expect(validateFormValues(assertValid(multi), { answer: [] }).errors.answer).toBe("This field is required.")

      const limited = assertValid({
        ...multi,
        fields: [{ ...multi.fields[0], required: false, minSelected: 2, maxSelected: 2 }],
      })
      expect(validateFormValues(limited, { answer: ["B"] }).errors.answer).toContain("at least 2")
      expect(validateFormValues(limited, { answer: ["A", "B", "C"] }).errors.answer).toContain("at most 2")
      expect(validateFormValues(limited, { answer: ["B", "C"] }).valid).toBe(true)
    })

    it("refuses an option that was never offered", () => {
      const validation = validateFormValues(assertValid(multi), { answer: ["B", "Z"] })

      expect(validation.valid).toBe(false)
      expect(validation.errors.answer).toBe("Select an allowed option.")
    })

    it("marks the answer right however the expected set was written", async () => {
      // A model writes the correct options in whatever order it thought of them, and sometimes with a
      // stray space. The answer is a set; comparing the two as text makes a right answer read as wrong.
      const reordered = {
        ...multi,
        fields: [{ ...multi.fields[0], expect: [" C", "B "] }],
      }
      const host = await mountFormFor(reordered)
      for (const value of ["B", "C"]) {
        host.querySelector<HTMLInputElement>(`input[type=checkbox][value="${value}"]`)!.checked = true
      }
      host.querySelector<HTMLButtonElement>("[data-aigui-form-submit]")!.click()
      await Promise.resolve()
      await Promise.resolve()

      expect(host.querySelector("form")!.getAttribute("data-aigui-form-outcome")).toBe("positive")
    })

    it("marks the answer right only when the set is exactly right", async () => {
      // 漏选 and 多选 are both wrong here; how much a half-right answer is worth is the host's marking
      // scheme, and the form only says whether it was right.
      for (const [chosen, tone] of [
        [["B", "C"], "positive"],
        [["B"], "warning"],
        [["A", "B", "C"], "warning"],
        [["A"], "warning"],
      ] as const) {
        const host = await mountFormFor(multi)
        for (const value of chosen) {
          const box = host.querySelector<HTMLInputElement>(`input[type=checkbox][value="${value}"]`)!
          box.checked = true
        }
        host.querySelector<HTMLButtonElement>("[data-aigui-form-submit]")!.click()
        await Promise.resolve()
        await Promise.resolve()
        expect(host.querySelector("form")!.getAttribute("data-aigui-form-outcome")).toBe(tone)
      }
    })

    it("puts a stored multi-select answer back the way it was left", async () => {
      const host = await mountFormFor(multi, { restore: () => ({ values: { answer: ["B", "C"] } }) })

      const checked = [...host.querySelectorAll<HTMLInputElement>("input[type=checkbox]")]
        .filter((box) => box.checked)
        .map((box) => box.value)
      // A reloaded conversation that showed the question unanswered would claim it had been answered
      // and be unable to say with what.
      expect(checked).toEqual(["B", "C"])
      expect(host.querySelector("form")!.getAttribute("data-aigui-form-outcome")).toBe("positive")
    })

    it("tells a model that a pronunciation question needs a recording, not a spelling", () => {
      const spec = formPromptSpec()

      expect(spec).toContain("audio")
      expect(spec).toContain("maxSeconds")
      // The two things a model gets wrong here: grading a recording, and asking for it in writing.
      expect(spec).toContain("never give it `expect`")
      expect(spec).toMatch(/a spelling is not a pronunciation/)
    })

    it("tells a model that several right answers means checkboxes", () => {
      const spec = formPromptSpec()

      expect(spec).toContain("checkboxes")
      expect(spec).toContain("never radio")
    })
  })
})
