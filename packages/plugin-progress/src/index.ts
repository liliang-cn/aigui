import type { AIGuiPlugin, ASTNode, RenderOutput } from "@ai-gui/core"

/**
 * Progress for work that takes a while inside one turn.
 *
 * A model that is going to search, read three sources, then draft, spends a long time saying nothing.
 * A host-level "thinking…" covers that, but it is one line for the whole turn and it cannot say which
 * of the four things is happening, which have finished, or that the third one failed.
 *
 * So progress is something the model writes, several steps per turn, each updated in place: emitting a
 * step again with the same `id` replaces it. That last part is the whole design. A streamed answer is
 * append-only, so an update *is* a second block — without superseding, a turn that reported four steps
 * three times would render twelve rows and read as chaos.
 */

export type StepState = "pending" | "running" | "done" | "failed" | "skipped"

export interface ProgressStep {
  /** Stable within a turn. Emitting the same id again updates that step rather than adding one. */
  id: string
  label: string
  state?: StepState
  /** A short line under the label: what it is doing, or why it failed. */
  detail?: string
  /** 0–100, when the work has a measurable fraction. Omit when it does not. */
  percent?: number
}

export interface ProgressOptions {
  maxSourceBytes?: number
  /** How many steps one block may carry. */
  maxSteps?: number
}

const DEFAULTS = { maxSourceBytes: 8 * 1024, maxSteps: 24 }
const STATES: readonly StepState[] = ["pending", "running", "done", "failed", "skipped"]

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Read the steps out of a block.
 *
 * Accepts one step or a list, because both are how a model writes this: a single step when it starts
 * something, the whole list when it restates where it is. Rejecting either shape would mean progress
 * that silently stops rendering halfway through a turn.
 */
export function parseProgress(
  source: string,
  options: ProgressOptions = {},
): { valid: true; steps: ProgressStep[] } | { valid: false; issues: string[] } {
  const limits = { ...DEFAULTS, ...options }
  if (new TextEncoder().encode(source).byteLength > limits.maxSourceBytes) {
    return { valid: false, issues: ["Progress block is too large."] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    return { valid: false, issues: ["Progress must be valid JSON."] }
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { valid: false, issues: ["Progress must be a JSON object."] }
  }
  const value = parsed as Record<string, unknown>
  if (value.version !== 1) {
    return { valid: false, issues: ['Progress must declare "version": 1.'] }
  }
  const raw = Array.isArray(value.steps) ? value.steps : [value]
  if (raw.length === 0) {
    return { valid: false, issues: ["Progress must carry at least one step."] }
  }
  if (raw.length > limits.maxSteps) {
    return { valid: false, issues: [`Progress carries more than ${limits.maxSteps} steps.`] }
  }
  const issues: string[] = []
  const steps: ProgressStep[] = []
  raw.forEach((item, index) => {
    const path = `$.steps[${index}]`
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      issues.push(`${path} must be an object.`)
      return
    }
    const step = item as Record<string, unknown>
    if (typeof step.id !== "string" || step.id.trim() === "") {
      issues.push(`${path}.id must be a non-empty string.`)
      return
    }
    if (typeof step.label !== "string" || step.label.trim() === "") {
      issues.push(`${path}.label must be a non-empty string.`)
      return
    }
    const state = step.state === undefined ? "running" : step.state
    if (typeof state !== "string" || !STATES.includes(state as StepState)) {
      issues.push(`${path}.state must be one of ${STATES.join(", ")}.`)
      return
    }
    const percent =
      typeof step.percent === "number" && Number.isFinite(step.percent)
        ? Math.min(100, Math.max(0, step.percent))
        : undefined
    steps.push({
      id: step.id.trim(),
      label: step.label,
      state: state as StepState,
      ...(typeof step.detail === "string" && step.detail.trim() !== "" ? { detail: step.detail } : {}),
      ...(percent === undefined ? {} : { percent }),
    })
  })
  if (issues.length > 0) return { valid: false, issues }
  return { valid: true, steps }
}

/** Draw the steps. */
export function renderProgressHTML(steps: ProgressStep[]): string {
  if (steps.length === 0) return ""
  const rows = steps
    .map((step) => {
      const state = step.state ?? "running"
      const bar =
        step.percent === undefined
          ? ""
          : `<span class="aigui-progress-bar" role="progressbar" aria-valuenow="${Math.round(step.percent)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.round(step.percent)}%"></i></span>`
      const detail = step.detail ? `<small>${escapeHtml(step.detail)}</small>` : ""
      return [
        `<li data-aigui-progress-step="${escapeHtml(state)}">`,
        `<span class="aigui-progress-mark" aria-hidden="true"></span>`,
        `<span class="aigui-progress-body"><b>${escapeHtml(step.label)}</b>${detail}${bar}</span>`,
        "</li>",
      ].join("")
    })
    .join("")
  // `aria-live` on the list, because the steps change under the reader rather than being read once.
  return `<ul data-aigui-progress="steps" aria-live="polite">${rows}</ul>`
}

/**
 * You rarely want this directly: `buildSystemPrompt({ registry, plugins, locale })` from
 * `@ai-gui/core` collects the card specs and every enabled plugin's spec in one call, in the
 * product's language. Reach for this only to inspect or override one plugin's rules.
 */
export function progressPromptSpec(options: ProgressOptions = {}): string {
  const limits = { ...DEFAULTS, ...options }
  return [
    "Progress for a long turn (fenced): ```progress <strict JSON>```.",
    'One step: {"version":1,"id":"search","label":"检索资料","state":"running","detail":"..."?,"percent":40?}.',
    'Several at once: {"version":1,"steps":[{...},{...}]}. No unknown fields.',
    'State is one of pending, running, done, failed, skipped; it defaults to running.',
    "To update a step, emit it again with the same id — the later block replaces the earlier one, so restating the whole list is fine and does not duplicate rows.",
    `At most ${limits.maxSteps} steps per block, ${limits.maxSourceBytes} UTF-8 bytes.`,
    "Use this only when a turn does several things that take real time — searching, reading sources, running a long计算 — and say what each step is for. Do not narrate ordinary prose with it, and do not leave a step running once it has finished.",
  ].join("\n")
}

export const progressCss = `
[data-aigui-progress] { margin: 12px 0; padding: 0; list-style: none; display: grid; gap: 7px; }
[data-aigui-progress] li { display: grid; grid-template-columns: 16px minmax(0, 1fr); align-items: start; gap: 9px; }
[data-aigui-progress] .aigui-progress-mark { width: 12px; height: 12px; margin-top: 3px; border: 2px solid var(--aigui-progress-idle, currentColor); border-radius: 50%; opacity: .35; }
[data-aigui-progress] .aigui-progress-body { min-width: 0; display: grid; gap: 3px; }
[data-aigui-progress] b { font-size: 13px; font-weight: 500; }
[data-aigui-progress] small { font-size: 11px; opacity: .7; }
[data-aigui-progress] .aigui-progress-bar { height: 3px; margin-top: 2px; border-radius: 999px; background: color-mix(in srgb, currentColor 14%, transparent); overflow: hidden; }
[data-aigui-progress] .aigui-progress-bar > i { display: block; height: 100%; background: var(--aigui-progress-running, currentColor); transition: width .3s ease; }
[data-aigui-progress-step="running"] .aigui-progress-mark { border-color: var(--aigui-progress-running, currentColor); border-right-color: transparent; opacity: 1; animation: aigui-progress-spin .7s linear infinite; }
[data-aigui-progress-step="done"] .aigui-progress-mark { border-color: var(--aigui-progress-done, currentColor); background: var(--aigui-progress-done, currentColor); opacity: 1; }
[data-aigui-progress-step="failed"] .aigui-progress-mark { border-color: var(--aigui-progress-failed, currentColor); background: var(--aigui-progress-failed, currentColor); opacity: 1; }
[data-aigui-progress-step="skipped"] .aigui-progress-mark { border-style: dashed; opacity: .4; }
[data-aigui-progress-step="done"] b, [data-aigui-progress-step="skipped"] b { opacity: .65; }
@keyframes aigui-progress-spin { to { transform: rotate(360deg); } }
/* A reader who asked for less motion gets a filled marker instead of a spinning one. */
@media (prefers-reduced-motion: reduce) {
  [data-aigui-progress-step="running"] .aigui-progress-mark { animation: none; border-right-color: var(--aigui-progress-running, currentColor); }
  [data-aigui-progress] .aigui-progress-bar > i { transition: none; }
}
`

function errorHtml(issue: string): RenderOutput {
  return { kind: "html", html: `<pre data-aigui-progress-error>${escapeHtml(issue)}</pre>` }
}

export function progress(options: ProgressOptions = {}): AIGuiPlugin {
  // Which node last mentioned each step id. A streamed answer is append-only, so an update arrives as
  // another block; without this a turn that restated four steps three times would render twelve rows.
  let latest = new Map<string, ASTNode>()

  const render = (node: ASTNode): RenderOutput => {
    if (!node.complete) {
      return { kind: "html", html: '<div data-aigui-block-loading data-block-type="progress"></div>' }
    }
    const parsed = parseProgress(node.content ?? "", options)
    if (!parsed.valid) return errorHtml(parsed.issues[0] ?? "Invalid progress block.")
    // Only the steps this node is the latest mention of. A superseded block renders nothing at all
    // rather than a stale copy, which is what keeps the list a list.
    const own = parsed.steps.filter((step) => (latest.get(step.id) ?? node) === node)
    if (own.length === 0) return { kind: "html", html: "", trusted: true }
    return { kind: "html", html: renderProgressHTML(own), trusted: true }
  }

  return {
    name: "progress",
    nodeRenderers: { progress: render },
    onASTCommit: (nodes) => {
      // Derived from the current AST rather than accumulated. Both end with the same winners — a
      // re-parse hands over new node objects for the same blocks, and the loop below overwrites — so
      // this is for the reader: the map is a function of the nodes in hand, and an id that has left the
      // text does not linger in it.
      const next = new Map<string, ASTNode>()
      for (const node of nodes) {
        if (node.type !== "progress" || !node.complete) continue
        const parsed = parseProgress(node.content ?? "", options)
        if (!parsed.valid) continue
        for (const step of parsed.steps) next.set(step.id, node)
      }
      latest = next
    },
    promptSpec: progressPromptSpec(options),
    css: progressCss,
  }
}
