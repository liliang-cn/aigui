// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { ActionRegistry, collectNodeRenderers, createActionRuntime, createParser, type RenderOutput } from "@ai-gui/core"
import { flashcardPromptSpec, flashcards, parseFlashcards } from "./index"

const deck = {
  version: 1,
  id: "de-week-1",
  title: "本周德语词",
  gradeAction: "revise.word",
  cards: [
    { id: "word-1", front: "der Kühlschrank", back: "冰箱", hint: "der Kühl-schrank", example: "Der Kühlschrank ist leer." },
    { id: "word-2", front: "möchten", back: "想要" },
  ],
}

function mount(source: object, run = vi.fn(() => ({ recorded: true }))) {
  const registry = new ActionRegistry()
  registry.register({ type: "revise.word", run })
  const plugin = flashcards({ actionRuntime: createActionRuntime({ registry }) })
  const node = createParser({ plugins: [plugin] })(`\`\`\`flashcards\n${JSON.stringify(source)}\n\`\`\``)[0]
  const out = collectNodeRenderers([plugin]).flashcards(node) as RenderOutput
  const host = document.createElement("div")
  if (out.kind === "mount") out.mount(host)
  else host.innerHTML = out.kind === "html" ? out.html : ""
  return { host, run, kind: out.kind }
}

const card = (host: HTMLElement) => host.querySelector<HTMLElement>("[data-aigui-card]")!
const back = (host: HTMLElement) => host.querySelector<HTMLElement>("[data-aigui-card-back]")!
const front = (host: HTMLElement) => host.querySelector<HTMLElement>("[data-aigui-card-front]")!

describe("flashcards", () => {
  it("asks before it tells", () => {
    // The whole reason a deck is not a list: a word shown beside its meaning is a word being read, and
    // reading a word you have already read teaches nothing.
    const { host } = mount(deck)

    expect(front(host).textContent).toBe("der Kühlschrank")
    expect(back(host).hidden).toBe(true)
    expect(host.querySelector<HTMLElement>("[data-aigui-card-grades]")!.hidden).toBe(true)
    // And the answer is not merely invisible — it must not be sitting in the text of the card either.
    expect(card(host).textContent).not.toContain("冰箱")

    card(host).click()

    expect(back(host).hidden).toBe(false)
    expect(back(host).textContent).toBe("冰箱")
    expect(host.querySelector<HTMLElement>("[data-aigui-card-grades]")!.hidden).toBe(false)
  })

  it("reports one grade per card, against the host's own id", () => {
    const { host, run } = mount(deck)

    card(host).click()
    host.querySelector<HTMLElement>('[data-aigui-card-grade="good"]')!.click()

    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0][0]).toMatchObject({ deckId: "de-week-1", cardId: "word-1", grade: "good" })
    // And it has moved on, with the next answer hidden again.
    expect(front(host).textContent).toBe("möchten")
    expect(back(host).hidden).toBe(true)
  })

  it("counts the round and stops at the end", () => {
    const { host, run } = mount(deck)

    for (const grade of ["again", "good"]) {
      card(host).click()
      host.querySelector<HTMLElement>(`[data-aigui-card-grade="${grade}"]`)!.click()
    }

    expect(run).toHaveBeenCalledTimes(2)
    const done = host.querySelector<HTMLElement>("[data-aigui-deck-done]")!
    expect(done.hidden).toBe(false)
    expect(done.textContent).toContain("认识 1")
    expect(done.textContent).toContain("不认识 1")
    expect(card(host).hidden).toBe(true)
  })

  it("can be revised entirely from the keyboard", () => {
    // Anyone who revises daily ends up working this way, and a deck reachable only by mouse is a deck
    // some people cannot use at all.
    const { host, run } = mount(deck)

    card(host).dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }))
    expect(back(host).hidden).toBe(false)

    host.querySelector("[data-aigui-flashcards]")!.dispatchEvent(new KeyboardEvent("keydown", { key: "3", bubbles: true }))

    expect(run.mock.calls[0][0]).toMatchObject({ cardId: "word-1", grade: "good" })
    expect(front(host).textContent).toBe("möchten")
  })

  it("does not grade a number key while the answer is still hidden", () => {
    // Otherwise a stray keypress grades a card the person never saw, and the schedule believes it.
    const { host, run } = mount(deck)

    host.querySelector("[data-aigui-flashcards]")!.dispatchEvent(new KeyboardEvent("keydown", { key: "3", bubbles: true }))

    expect(run).not.toHaveBeenCalled()
    expect(front(host).textContent).toBe("der Kühlschrank")
  })

  it("shows both sides at once when the person is meeting these for the first time", () => {
    // Teaching, not revising: there is nothing yet to test, and hiding the meaning of a word nobody has
    // been told is a quiz on a lesson that has not happened.
    const { host, kind, run } = mount({ ...deck, reveal: "immediate" })

    expect(kind).toBe("html")
    expect(host.textContent).toContain("der Kühlschrank")
    expect(host.textContent).toContain("冰箱")
    expect(host.querySelector("[data-aigui-card-grades]")).toBeNull()
    expect(run).not.toHaveBeenCalled()
  })

  it("refuses a deck that cannot be revised from", () => {
    for (const [source, reason] of [
      [{ version: 2, id: "d", cards: [] }, "version"],
      [{ version: 1, id: "d", cards: [{ id: "a", front: "x" }] }, "back is required"],
      [{ version: 1, id: "d", cards: [{ id: "a", back: "x" }] }, "front is required"],
      [{ version: 1, id: "d", cards: [{ id: "a", front: "x", back: "y" }, { id: "a", front: "p", back: "q" }] }, "already used"],
      [{ version: 1, id: "d", cards: [] }, "empty"],
      [{ version: 1, id: "d", cards: [{ id: "a", front: "x", back: "y", colour: "red" }] }, "not a card property"],
      [{ version: 1, id: "bad id!", cards: [{ id: "a", front: "x", back: "y" }] }, "safe identifier"],
    ] as Array<[object, string]>) {
      const parsed = parseFlashcards(JSON.stringify(source))
      expect(parsed.valid, JSON.stringify(source)).toBe(false)
      if (!parsed.valid) expect(parsed.issues.join(" "), JSON.stringify(source)).toContain(reason)
    }
  })

  it("will not dispatch to an action the application never registered", () => {
    // The same allowlist a form's submission goes through: a deck is model output, and its action name
    // is a string the model chose.
    const registry = new ActionRegistry()
    const plugin = flashcards({ actionRuntime: createActionRuntime({ registry }) })
    const node = createParser({ plugins: [plugin] })(`\`\`\`flashcards\n${JSON.stringify(deck)}\n\`\`\``)[0]
    const out = collectNodeRenderers([plugin]).flashcards(node) as RenderOutput

    expect(out.kind).toBe("html")
    if (out.kind === "html") expect(out.html).toContain("Unknown action")
  })

  it("escapes what the model wrote", () => {
    const { host } = mount({ ...deck, reveal: "immediate", cards: [{ id: "a", front: "<script>alert(1)</script>", back: "x" }] })

    expect(host.querySelector("script")).toBeNull()
    expect(host.textContent).toContain("<script>")
  })

  it("tells a model which deck is for revising and which is for meeting", () => {
    const spec = flashcardPromptSpec()

    expect(spec).toContain("```flashcards")
    expect(spec).toContain("hidden")
    expect(spec).toContain("immediate")
    // The one mistake that makes a hint useless.
    expect(spec).toContain("never give the answer away")
  })
})
