import type { DebugEvent, DebugEventTarget, DebugSource } from "@ai-gui/core"

export interface TimelineEvent {
  type: string
  source: DebugSource
  timestamp: number
  sequence: number
  sourceSequence: number
  data: Record<string, unknown>
}

export interface RedactContext {
  key: string
  path: readonly (string | number)[]
  value: unknown
}

export interface DevToolsOptions {
  maxEvents?: number
  maxStringLength?: number
  maxDepth?: number
  maxNodes?: number
  redact?: (context: RedactContext) => boolean
  now?: () => number
}

export interface DevToolsStats {
  retained: number
  dropped: number
}

export interface DevTools {
  attach(...targets: DebugEventTarget[]): () => void
  subscribe(listener: (event: TimelineEvent) => void): () => void
  snapshot(): TimelineEvent[]
  clear(): void
  stats(): DevToolsStats
  destroy(): void
}

const DEFAULT_SENSITIVE_KEY = /^(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|access[-_]?key|private[-_]?key)$/i

export function createDevTools(options: DevToolsOptions = {}): DevTools {
  const maxEvents = positiveInteger(options.maxEvents, 1_000, "maxEvents")
  const maxStringLength = positiveInteger(options.maxStringLength, 4_096, "maxStringLength")
  const maxDepth = positiveInteger(options.maxDepth, 24, "maxDepth")
  const maxNodes = positiveInteger(options.maxNodes, 20_000, "maxNodes")
  const now = options.now ?? Date.now
  const timeline: TimelineEvent[] = []
  const listeners = new Set<(event: TimelineEvent) => void>()
  const detachments = new Set<() => void>()
  let sequence = 0
  let dropped = 0
  let destroyed = false

  const record = (event: DebugEvent) => {
    if (destroyed) return
    const entry: TimelineEvent = Object.freeze({
      type: event.type,
      source: event.source,
      timestamp: now(),
      sequence: ++sequence,
      sourceSequence: event.sequence,
      data: limitValue(event.data, { maxStringLength, maxDepth, maxNodes, redact: options.redact }) as Record<string, unknown>,
    })
    timeline.push(entry)
    if (timeline.length > maxEvents) {
      dropped += timeline.length - maxEvents
      timeline.splice(0, timeline.length - maxEvents)
    }
    for (const listener of listeners) {
      try { listener(entry) } catch { /* Timeline observers cannot affect runtime behavior. */ }
    }
  }

  const api: DevTools = {
    attach(...targets) {
      if (destroyed) throw new Error("DevTools has been destroyed")
      const current = targets.map((target) => target.subscribeDebug(record))
      const detach = () => {
        if (!detachments.delete(detach)) return
        for (const unsubscribe of current) unsubscribe()
      }
      detachments.add(detach)
      return detach
    },
    subscribe(listener) {
      if (destroyed) return () => {}
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    snapshot() {
      return timeline.map((event) => ({ ...event, data: cloneValue(event.data) as Record<string, unknown> }))
    },
    clear() {
      timeline.length = 0
      dropped = 0
    },
    stats() {
      return { retained: timeline.length, dropped }
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      for (const detach of [...detachments]) detach()
      listeners.clear()
      timeline.length = 0
    },
  }
  return api
}

interface LimitOptions {
  maxStringLength: number
  maxDepth: number
  maxNodes: number
  redact?: DevToolsOptions["redact"]
}

function limitValue(value: unknown, options: LimitOptions): unknown {
  const seen = new WeakSet<object>()
  let nodes = 0
  const visit = (input: unknown, key: string, path: (string | number)[], depth: number): unknown => {
    nodes++
    if (nodes > options.maxNodes) return "[MAX_NODES]"
    if (DEFAULT_SENSITIVE_KEY.test(key) || options.redact?.({ key, path, value: input })) return "[REDACTED]"
    if (typeof input === "string") {
      return input.length > options.maxStringLength
        ? `${input.slice(0, options.maxStringLength)}[TRUNCATED]`
        : input
    }
    if (input === null || typeof input === "number" || typeof input === "boolean") return input
    if (typeof input !== "object") return String(input)
    if (depth >= options.maxDepth) return "[MAX_DEPTH]"
    if (seen.has(input)) return "[CIRCULAR]"
    seen.add(input)
    try {
      if (Array.isArray(input)) return input.map((item, index) => visit(item, "", [...path, index], depth + 1))
      const output: Record<string, unknown> = {}
      for (const [childKey, child] of Object.entries(input)) {
        output[childKey] = visit(child, childKey, [...path, childKey], depth + 1)
      }
      return output
    } finally {
      seen.delete(input)
    }
  }
  return visit(value, "", [], 0)
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]))
  }
  return value
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`)
  return value
}

export type StreamSimulatorState = "running" | "paused" | "completed" | "cancelled"

export interface StreamSimulatorOptions {
  chunkSize?: number
  delayMs?: number
}

export interface StreamSimulator {
  stream: AsyncIterable<Uint8Array>
  pause(): void
  resume(): void
  cancel(): void
  state(): StreamSimulatorState
}

export const STREAM_FIXTURES = Object.freeze({
  markdown: "# Streaming demo\n\nThis paragraph arrives in deterministic chunks.",
  card: "```card:demo\n{\"id\":\"demo-card\",\"title\":\"Fixture card\",\"count\":1}\n```",
  unicode: "UTF-8 boundaries: 你好, مرحبا, 🙂.",
})

export function createStreamSimulator(input: string, options: StreamSimulatorOptions = {}): StreamSimulator {
  const chunkSize = positiveInteger(options.chunkSize, 8, "chunkSize")
  const delayMs = nonNegativeNumber(options.delayMs, 0, "delayMs")
  const bytes = new TextEncoder().encode(input)
  let currentState: StreamSimulatorState = "running"
  let offset = 0
  let wake: (() => void) | undefined

  const waitUntilRunning = async () => {
    while (currentState === "paused") await new Promise<void>((resolve) => { wake = resolve })
  }
  const stream: AsyncIterable<Uint8Array> = {
    async *[Symbol.asyncIterator]() {
      try {
        while (offset < bytes.length && !isCancelled()) {
          await waitUntilRunning()
          if (isCancelled()) return
          if (delayMs > 0) await delay(delayMs)
          if (isCancelled()) return
          await waitUntilRunning()
          if (isCancelled()) return
          const chunk = bytes.slice(offset, Math.min(offset + chunkSize, bytes.length))
          offset += chunk.length
          yield chunk
        }
        if (currentState !== "cancelled") currentState = "completed"
      } finally {
        if (currentState !== "completed") currentState = "cancelled"
        wake?.()
        wake = undefined
      }
    },
  }
  return {
    stream,
    pause() { if (currentState === "running") currentState = "paused" },
    resume() {
      if (currentState !== "paused") return
      currentState = "running"
      wake?.()
      wake = undefined
    },
    cancel() {
      if (currentState === "completed" || currentState === "cancelled") return
      currentState = "cancelled"
      wake?.()
      wake = undefined
    },
    state() { return currentState },
  }

  function isCancelled(): boolean {
    return currentState === "cancelled"
  }
}

function nonNegativeNumber(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be a non-negative number`)
  return value
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
