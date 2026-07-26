/**
 * How a completed action turned out, as opposed to whether it completed.
 *
 * The lifecycle a card and an action already report — idle, loading, success, error — answers "did
 * the dispatch run". It cannot answer "was the answer right": a student who picks the wrong option
 * submits perfectly well, so the action succeeds and nothing on screen says otherwise. Putting a
 * "warning" beside "error" in that lifecycle would fold a wrong answer in with a failed request,
 * which is the one distinction a host needs to keep.
 *
 * So the outcome travels on its own, returned by the handler that judged it.
 */

/** How the result should read to the person looking at it. */
export type OutcomeTone = "positive" | "warning" | "negative" | "neutral"

export interface ActionOutcome {
  tone: OutcomeTone
  /** A sentence to show beside the control — why it is wrong, or what was expected. */
  message?: string
  /**
   * Per-field verdicts, so one wrong answer marks the field it came from rather than the whole
   * form. Keyed by field name.
   */
  fields?: Record<string, OutcomeTone>
}

const TONES = new Set<OutcomeTone>(["positive", "warning", "negative", "neutral"])

function isTone(value: unknown): value is OutcomeTone {
  return typeof value === "string" && TONES.has(value as OutcomeTone)
}

/**
 * Read an outcome out of whatever a handler returned.
 *
 * A handler answers with its own result type, so the outcome is looked for rather than required:
 * `{ tone: "warning", message: "…" }` on its own, or under an `outcome` key beside the handler's
 * own data. Anything else means the handler did not judge, and the host shows nothing.
 */
export function actionOutcome(value: unknown): ActionOutcome | undefined {
  const candidate = value as { outcome?: unknown; tone?: unknown } | null | undefined
  const source = (candidate?.outcome ?? candidate) as
    | { tone?: unknown; message?: unknown; fields?: unknown }
    | null
    | undefined
  if (!source || !isTone(source.tone)) return undefined
  const outcome: ActionOutcome = { tone: source.tone }
  if (typeof source.message === "string" && source.message.trim() !== "") {
    outcome.message = source.message
  }
  if (source.fields && typeof source.fields === "object") {
    const fields: Record<string, OutcomeTone> = {}
    for (const [name, tone] of Object.entries(source.fields as Record<string, unknown>)) {
      if (isTone(tone)) fields[name] = tone
    }
    if (Object.keys(fields).length > 0) outcome.fields = fields
  }
  return outcome
}
