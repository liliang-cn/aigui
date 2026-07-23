export type DebugSource = "renderer" | "action-runtime" | "card-store"

export interface DebugEvent<TData extends Record<string, unknown> = Record<string, unknown>> {
  type: string
  source: DebugSource
  timestamp: number
  sequence: number
  data: TData
}

export type DebugEventListener = (event: DebugEvent) => void

export interface DebugEventTarget {
  readonly debugSource: DebugSource
  subscribeDebug(listener: DebugEventListener): () => void
}

export interface DebugOptions {
  debug?: boolean
  onDebugEvent?: DebugEventListener
}

const SENSITIVE_KEY = /^(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|access[-_]?key|private[-_]?key)$/i

export class DebugEmitter {
  private readonly enabled: boolean
  private readonly source: DebugSource
  private readonly listeners = new Set<DebugEventListener>()
  private sequence = 0

  constructor(source: DebugSource, options: DebugOptions = {}) {
    this.source = source
    this.enabled = options.debug === true
    if (this.enabled && options.onDebugEvent) this.listeners.add(options.onDebugEvent)
  }

  get active(): boolean {
    return this.enabled && this.listeners.size > 0
  }

  subscribe(listener: DebugEventListener): () => void {
    if (!this.enabled) return () => {}
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(type: string, data: Record<string, unknown> = {}): void {
    if (!this.active) return
    const event: DebugEvent = Object.freeze({
      type,
      source: this.source,
      timestamp: Date.now(),
      sequence: ++this.sequence,
      data: safeDebugValue(data) as Record<string, unknown>,
    })
    for (const listener of this.listeners) {
      try { listener(event) } catch { /* Debug observers cannot affect runtime behavior. */ }
    }
  }
}

export function safeDebugValue(value: unknown): unknown {
  const seen = new WeakSet<object>()
  const visit = (input: unknown, key = "", depth = 0): unknown => {
    if (SENSITIVE_KEY.test(key)) return "[REDACTED]"
    if (input === null || typeof input === "string" || typeof input === "boolean") return input
    if (typeof input === "number") return Number.isFinite(input) ? input : String(input)
    if (typeof input === "bigint" || typeof input === "symbol" || typeof input === "function" || typeof input === "undefined") return String(input)
    if (input instanceof Error) return { name: input.name || "Error", message: input.message }
    if (depth >= 32) return "[MAX_DEPTH]"
    if (seen.has(input as object)) return "[CIRCULAR]"
    seen.add(input as object)
    try {
      if (Array.isArray(input)) return input.map((item) => visit(item, "", depth + 1))
      const output: Record<string, unknown> = {}
      for (const [childKey, child] of Object.entries(input as Record<string, unknown>)) {
        output[childKey] = visit(child, childKey, depth + 1)
      }
      return output
    } finally {
      seen.delete(input as object)
    }
  }
  return visit(value)
}
