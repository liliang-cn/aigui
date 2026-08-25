import { ActionRuntimeError, type ActionRuntime, type AIGuiPlugin, type ASTNode, type RenderOutput } from "@ai-gui/core"

/**
 * Cards to test yourself against, one at a time.
 *
 * The moment a vocabulary list stops being a list: a word shown beside its meaning is a word being
 * read, and reading a word you have already read teaches nothing. What moves a word into memory is
 * being asked for it and finding out whether it came — so a card hides its back, and the person says
 * whether they knew it before they are told.
 *
 * That self-report is the whole output. This plugin does not schedule anything: which card comes back
 * in a day and which in a month is the host's, because only the host knows what else the person is
 * learning and when they last saw it. What travels out is one grade per card, through the same action
 * allowlist a form's submission uses.
 */

const DEFAULTS = { maxSourceBytes: 16 * 1024, maxCards: 60 }
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/
const DECK_KEYS = new Set(["id", "version", "reveal", "gradeAction", "title", "cards"])
const CARD_KEYS = new Set(["id", "front", "back", "hint", "example", "note"])

/** How the person said it went. Three, because "I half knew it" is the commonest answer and a
 * two-way split forces it into a lie either way. */
export type CardGrade = "again" | "hard" | "good"

export interface FlashcardOptions {
  maxSourceBytes?: number
  maxCards?: number
}

export interface FlashcardPluginOptions extends FlashcardOptions {
  /** Shared runtime whose registry is the only allowlist for `gradeAction`. */
  actionRuntime: ActionRuntime
  /** Labels, so a deck can speak the language the lesson is in. */
  labels?: Partial<FlashcardLabels>
}

export interface FlashcardLabels {
  reveal: string
  again: string
  hard: string
  good: string
  progress: (seen: number, total: number) => string
  done: (counts: Record<CardGrade, number>) => string
}

const DEFAULT_LABELS: FlashcardLabels = {
  reveal: "看答案",
  again: "不认识",
  hard: "模糊",
  good: "认识",
  progress: (seen, total) => `${seen} / ${total}`,
  done: (counts) => `这一轮：认识 ${counts.good}，模糊 ${counts.hard}，不认识 ${counts.again}`,
}

export interface Flashcard {
  /** The host's own id for this card — what a grade is reported against. */
  id: string
  /** What is asked. A word, a formula, a question.  */
  front: string
  /** What is checked against. */
  back: string
  /** Shown with the front: a reading, a first letter, a category. Never the answer itself. */
  hint?: string
  /** Shown with the back: the sentence that makes the answer usable. */
  example?: string
  note?: string
}

export interface FlashcardDeck {
  id: string
  version: 1
  /**
   * `hidden` asks before it tells — the revision case, and the default.
   *
   * `immediate` shows both sides at once and grades nothing: the teaching case, where the person is
   * meeting these for the first time and there is nothing yet to test.
   */
  reveal: "hidden" | "immediate"
  /** The registered action a grade is reported to. Absent means nothing is reported. */
  gradeAction?: string
  title?: string
  cards: Flashcard[]
}

export type FlashcardParseResult =
  | { valid: true; data: FlashcardDeck }
  | { valid: false; issues: string[] }

/** Read a deck out of a block, strictly. */
export function parseFlashcards(source: string, options: FlashcardOptions = {}): FlashcardParseResult {
  const limits = { ...DEFAULTS, ...options }
  if (new TextEncoder().encode(source).byteLength > limits.maxSourceBytes) {
    return { valid: false, issues: ["Deck is too large."] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    return { valid: false, issues: ["Deck must be valid JSON."] }
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { valid: false, issues: ["Deck must be a JSON object."] }
  }
  const value = parsed as Record<string, unknown>
  const issues: string[] = []
  for (const key of Object.keys(value)) {
    if (!DECK_KEYS.has(key)) issues.push(`$.${key} is not a deck property.`)
  }
  if (value.version !== 1) issues.push("$.version must be 1.")
  const id = typeof value.id === "string" ? value.id.trim() : ""
  if (!id || !SAFE_ID.test(id)) issues.push("$.id must be a safe identifier.")
  const reveal = value.reveal === undefined ? "hidden" : value.reveal
  if (reveal !== "hidden" && reveal !== "immediate") issues.push('$.reveal must be "hidden" or "immediate".')
  let gradeAction: string | undefined
  if (value.gradeAction !== undefined) {
    if (typeof value.gradeAction !== "string" || !SAFE_ID.test(value.gradeAction)) {
      issues.push("$.gradeAction must name a registered action.")
    } else {
      gradeAction = value.gradeAction
    }
  }
  const title = typeof value.title === "string" ? value.title.trim() : undefined
  if (!Array.isArray(value.cards)) issues.push("$.cards must be an array.")

  const cards: Flashcard[] = []
  const seen = new Set<string>()
  for (const [index, entry] of (Array.isArray(value.cards) ? value.cards : []).entries()) {
    const path = `$.cards[${index}]`
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      issues.push(`${path} must be an object.`)
      continue
    }
    const card = entry as Record<string, unknown>
    for (const key of Object.keys(card)) {
      if (!CARD_KEYS.has(key)) issues.push(`${path}.${key} is not a card property.`)
    }
    const cardId = typeof card.id === "string" ? card.id.trim() : ""
    const front = typeof card.front === "string" ? card.front.trim() : ""
    const back = typeof card.back === "string" ? card.back.trim() : ""
    if (!cardId || !SAFE_ID.test(cardId)) issues.push(`${path}.id must be a safe identifier.`)
    if (!front) issues.push(`${path}.front is required.`)
    // A card with no back cannot be checked against anything, which makes grading it a guess about a
    // guess — and the grade is the only thing this produces.
    if (!back) issues.push(`${path}.back is required.`)
    if (cardId && seen.has(cardId)) issues.push(`${path}.id is already used in this deck.`)
    seen.add(cardId)
    if (!cardId || !front || !back) continue
    cards.push({
      id: cardId,
      front,
      back,
      ...(typeof card.hint === "string" && card.hint.trim() ? { hint: card.hint.trim() } : {}),
      ...(typeof card.example === "string" && card.example.trim() ? { example: card.example.trim() } : {}),
      ...(typeof card.note === "string" && card.note.trim() ? { note: card.note.trim() } : {}),
    })
    if (cards.length > limits.maxCards) {
      issues.push(`$.cards holds more than ${limits.maxCards} cards.`)
      break
    }
  }
  if (cards.length === 0 && issues.length === 0) issues.push("$.cards is empty.")
  if (issues.length > 0) return { valid: false, issues }
  return {
    valid: true,
    data: { id, version: 1, reveal: reveal as FlashcardDeck["reveal"], gradeAction, title, cards },
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** Every card at once, with both sides shown — the teaching case, where nothing is being tested yet. */
function renderOpenDeck(deck: FlashcardDeck): string {
  const rows = deck.cards
    .map((card) => {
      const hint = card.hint ? `<span data-aigui-card-hint>${escapeHtml(card.hint)}</span>` : ""
      const example = card.example ? `<p data-aigui-card-example>${escapeHtml(card.example)}</p>` : ""
      return `<li><div data-aigui-card-front><strong>${escapeHtml(card.front)}</strong>${hint}</div><div data-aigui-card-back>${escapeHtml(card.back)}</div>${example}</li>`
    })
    .join("")
  const title = deck.title ? `<p data-aigui-deck-title>${escapeHtml(deck.title)}</p>` : ""
  return `<div data-aigui-flashcards="${escapeHtml(deck.id)}" data-reveal="immediate">${title}<ul data-aigui-card-list>${rows}</ul></div>`
}

/**
 * A deck that asks first.
 *
 * Mounted rather than rendered as HTML: the whole point is what happens between showing the front and
 * showing the back, and that is a sequence of events, not a string.
 */
function mountDeck(
  host: HTMLElement,
  deck: FlashcardDeck,
  options: FlashcardPluginOptions,
): () => void {
  const labels = { ...DEFAULT_LABELS, ...options.labels }
  const root = document.createElement("div")
  root.setAttribute("data-aigui-flashcards", deck.id)
  root.setAttribute("data-reveal", "hidden")

  const header = document.createElement("div")
  header.setAttribute("data-aigui-deck-header", "")
  const title = document.createElement("span")
  title.setAttribute("data-aigui-deck-title", "")
  title.textContent = deck.title ?? ""
  const progress = document.createElement("span")
  progress.setAttribute("data-aigui-deck-progress", "")
  progress.setAttribute("aria-live", "polite")
  header.append(title, progress)

  const card = document.createElement("div")
  card.setAttribute("data-aigui-card", "")
  card.tabIndex = 0
  // A card is a question until it is answered; a button is the honest role for something whose whole
  // purpose is to be activated once.
  card.setAttribute("role", "button")

  const front = document.createElement("div")
  front.setAttribute("data-aigui-card-front", "")
  const hint = document.createElement("span")
  hint.setAttribute("data-aigui-card-hint", "")
  const back = document.createElement("div")
  back.setAttribute("data-aigui-card-back", "")
  back.hidden = true
  const example = document.createElement("p")
  example.setAttribute("data-aigui-card-example", "")
  example.hidden = true
  card.append(front, hint, back, example)

  const reveal = document.createElement("button")
  reveal.type = "button"
  reveal.setAttribute("data-aigui-card-reveal", "")
  reveal.textContent = labels.reveal

  const grades = document.createElement("div")
  grades.setAttribute("data-aigui-card-grades", "")
  grades.hidden = true
  for (const grade of ["again", "hard", "good"] as CardGrade[]) {
    const button = document.createElement("button")
    button.type = "button"
    button.dataset.aiguiCardGrade = grade
    button.textContent = labels[grade]
    grades.appendChild(button)
  }

  const done = document.createElement("p")
  done.setAttribute("data-aigui-deck-done", "")
  done.hidden = true

  root.append(header, card, reveal, grades, done)
  host.replaceChildren(root)

  let index = 0
  let shown = false
  const counts: Record<CardGrade, number> = { again: 0, hard: 0, good: 0 }
  let disposed = false

  const draw = () => {
    const current = deck.cards[index]
    if (!current) {
      card.hidden = true
      reveal.hidden = true
      grades.hidden = true
      done.hidden = false
      done.textContent = labels.done(counts)
      root.setAttribute("data-finished", "true")
      progress.textContent = labels.progress(deck.cards.length, deck.cards.length)
      return
    }
    front.textContent = current.front
    hint.textContent = current.hint ?? ""
    hint.hidden = !current.hint
    // Written only once asked for, not merely hidden: `hidden` is a style, and an answer sitting in the
    // card's text is one select-all, one copy, or one tool that ignores `hidden` away from being read
    // before the question has been answered.
    back.textContent = shown ? current.back : ""
    example.textContent = shown ? (current.example ?? "") : ""
    back.hidden = !shown
    example.hidden = !shown || !current.example
    reveal.hidden = shown
    grades.hidden = !shown
    card.setAttribute("data-shown", String(shown))
    progress.textContent = labels.progress(index + (shown ? 1 : 0), deck.cards.length)
  }

  const show = () => {
    if (shown) return
    shown = true
    draw()
    // Focus moves to the grades, so the keyboard path continues where the eye does.
    grades.querySelector<HTMLButtonElement>("button")?.focus()
  }

  const grade = (value: CardGrade) => {
    const current = deck.cards[index]
    if (!current || disposed) return
    counts[value] += 1
    if (deck.gradeAction) {
      // Fired, not awaited: the next card must appear at once. A host that cannot record a grade has a
      // problem with its own storage, and making the person wait for it teaches them nothing.
      // `cardId` is part of the runtime's dedupe key, and it has to be: a runtime that dedupes on the
      // action alone would drop the second card's grade while the first was still in flight — the
      // person grades a word and the schedule never hears about it. Per card, dedupe means what it
      // should: grading the same card twice in one breath counts once.
      void options.actionRuntime
        .dispatch(
          {
            type: deck.gradeAction,
            cardType: deck.id,
            cardId: current.id,
            params: { deckId: deck.id, cardId: current.id, grade: value },
          },
          { owner: root },
        )
        .catch((error: unknown) => {
          if (error instanceof ActionRuntimeError) return
          throw error
        })
    }
    index += 1
    shown = false
    draw()
    if (index < deck.cards.length) card.focus()
  }

  const onCardActivate = (event: Event) => {
    if (event instanceof KeyboardEvent) {
      if (event.key !== "Enter" && event.key !== " ") return
      event.preventDefault()
    }
    show()
  }
  card.addEventListener("click", onCardActivate)
  card.addEventListener("keydown", onCardActivate)
  reveal.addEventListener("click", show)
  const onGrade = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-aigui-card-grade]")
    if (!button) return
    grade(button.dataset.aiguiCardGrade as CardGrade)
  }
  grades.addEventListener("click", onGrade)
  // 1/2/3 anywhere in the deck, which is how anyone who revises daily ends up working.
  const onKey = (event: KeyboardEvent) => {
    if (!shown) return
    const byNumber: Record<string, CardGrade> = { "1": "again", "2": "hard", "3": "good" }
    const chosen = byNumber[event.key]
    if (!chosen) return
    event.preventDefault()
    grade(chosen)
  }
  root.addEventListener("keydown", onKey)

  draw()
  return () => {
    disposed = true
    card.removeEventListener("click", onCardActivate)
    card.removeEventListener("keydown", onCardActivate)
    reveal.removeEventListener("click", show)
    grades.removeEventListener("click", onGrade)
    root.removeEventListener("keydown", onKey)
  }
}

/**
 * You rarely want this directly: `buildSystemPrompt({ registry, plugins, locale })` from
 * `@ai-gui/core` collects the card specs and every enabled plugin's spec in one call, in the
 * product's language. Reach for this only to inspect or override one plugin's rules.
 */
export function flashcardPromptSpec(): string {
  return [
    "Flashcards: one fenced block, the safe deck JSON on the lines inside it.",
    "",
    "```flashcards",
    "<safe deck JSON>",
    "```",
    "",
    'Deck: {"version":1,"id":"...","reveal":"hidden|immediate"?,"gradeAction":"..."?,"title":"..."?,"cards":[{"id":"...","front":"...","back":"...","hint":"..."?,"example":"..."?}]}.',
    "`hidden` (the default) shows one card at a time and asks the person to say how it went before showing the answer — use it to revise. `immediate` shows both sides of every card at once and grades nothing — use it when they are meeting these for the first time.",
    "`front` is what is being asked and `back` is what it is checked against; a `hint` is shown with the front and must never give the answer away. `id` on each card is what a grade is reported against, so use the host's own ids.",
    "gradeAction must name an application-registered Action. Never emit URLs, scripts, HTML or handlers.",
  ].join("\n")
}

export const flashcardCss = `
[data-aigui-flashcards] { margin: 14px 0; padding: 14px; border: 1px solid #c8d6ce; border-radius: 12px; background: #f7f9f6; }
[data-aigui-deck-header] { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 10px; font-size: 12px; color: #5d6f65; }
[data-aigui-card] { display: grid; gap: 6px; padding: 22px 16px; text-align: center; border: 1px solid #c4d1ca; border-radius: 10px; background: #fff; cursor: pointer; }
[data-aigui-card]:focus-visible { outline: 2px solid #2f6b4f; outline-offset: 2px; }
[data-aigui-card-front] { font-size: 20px; font-weight: 700; }
[data-aigui-card-hint] { font-size: 12px; color: #7b8b81; }
[data-aigui-card-back] { padding-top: 8px; border-top: 1px dashed #d3ded7; font-size: 16px; }
[data-aigui-card-example] { margin: 0; font-size: 13px; color: #55655c; }
[data-aigui-card-reveal] { width: 100%; margin-top: 10px; padding: 9px; border: 1px solid #c4d1ca; border-radius: 9px; background: #fff; cursor: pointer; }
[data-aigui-card-grades] { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
[data-aigui-card-grades] button { padding: 9px; border: 1px solid #c4d1ca; border-radius: 9px; background: #fff; cursor: pointer; }
[data-aigui-card-grades] button[data-aigui-card-grade="again"] { color: #8a2b20; border-color: #e3b4ad; }
[data-aigui-card-grades] button[data-aigui-card-grade="good"] { color: #23543c; border-color: #a9c9b6; }
[data-aigui-card-list] { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
[data-aigui-card-list] li { display: grid; gap: 2px; padding: 10px 12px; border: 1px solid #c4d1ca; border-radius: 9px; background: #fff; }
[data-aigui-deck-done] { margin: 10px 0 0; text-align: center; font-size: 13px; color: #23543c; }
`

/**
 * Cards to revise from.
 *
 * @example
 * ```ts
 * const plugin = flashcards({ actionRuntime })
 * ```
 */
export function flashcards(options: FlashcardPluginOptions): AIGuiPlugin {
  if (!options?.actionRuntime) throw new TypeError("flashcards() requires an actionRuntime")
  return {
    name: "flashcards",
    nodeRenderers: {
      flashcards: (node: ASTNode): RenderOutput => {
        const parsed = parseFlashcards(node.content ?? "", options)
        if (!parsed.valid) {
          return {
            kind: "html",
            html: `<div data-aigui-flashcards-error>${escapeHtml(parsed.issues[0] ?? "Invalid deck.")}</div>`,
            trusted: true,
          }
        }
        const deck = parsed.data
        if (deck.gradeAction && !options.actionRuntime.hasAction(deck.gradeAction)) {
          return {
            kind: "html",
            html: `<div data-aigui-flashcards-error>${escapeHtml(`Unknown action: ${deck.gradeAction}`)}</div>`,
            trusted: true,
          }
        }
        if (deck.reveal === "immediate") {
          return { kind: "html", html: renderOpenDeck(deck), trusted: true }
        }
        return { kind: "mount", mount: (host: HTMLElement) => mountDeck(host, deck, options) }
      },
    },
    promptSpec: flashcardPromptSpec(),
    css: flashcardCss,
  }
}
