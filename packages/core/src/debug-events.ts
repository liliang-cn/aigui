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
  maxStringLength?: number
  maxDepth?: number
  maxNodes?: number
  redact?: (context: DebugRedactContext) => boolean
}

export interface DebugRedactContext {
  key: string
  path: readonly (string | number)[]
  value: unknown
}

export interface DebugInstrumentationTarget extends DebugEventTarget {
  readonly debugEnabled: boolean
  emitDebug(type: string, data?: Record<string, unknown>): void
}

export interface SafeDebugValueOptions {
  maxStringLength?: number
  maxDepth?: number
  maxNodes?: number
  redact?: DebugOptions["redact"]
}

const DEFAULT_MAX_STRING_LENGTH = 2_048
const DEFAULT_MAX_DEPTH = 8
const DEFAULT_MAX_NODES = 1_000
const SENSITIVE_KEY_PARTS = [
  "authorization", "auth", "accesstoken", "refreshtoken", "clientsecret", "credentials",
  "cookie", "setcookie", "proxyauthorization", "password", "passwd", "apikey", "secret", "token",
]

export class DebugEmitter {
  private readonly enabled: boolean
  private readonly source: DebugSource
  private readonly limits: Required<Pick<SafeDebugValueOptions, "maxStringLength" | "maxDepth" | "maxNodes">> & Pick<SafeDebugValueOptions, "redact">
  private readonly listeners = new Set<DebugEventListener>()
  private sequence = 0

  constructor(source: DebugSource, options: DebugOptions = {}) {
    this.source = source
    this.enabled = options.debug === true
    this.limits = {
      maxStringLength: positiveInteger(options.maxStringLength, DEFAULT_MAX_STRING_LENGTH, "maxStringLength"),
      maxDepth: positiveInteger(options.maxDepth, DEFAULT_MAX_DEPTH, "maxDepth"),
      maxNodes: positiveInteger(options.maxNodes, DEFAULT_MAX_NODES, "maxNodes"),
      redact: options.redact,
    }
    if (this.enabled && options.onDebugEvent) this.listeners.add(options.onDebugEvent)
  }

  get active(): boolean {
    return this.enabled && this.listeners.size > 0
  }

  get available(): boolean {
    return this.enabled
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
      data: safeDebugValue(data, this.limits) as Record<string, unknown>,
    })
    for (const listener of this.listeners) {
      try { listener(event) } catch { /* Debug observers cannot affect runtime behavior. */ }
    }
  }
}

export function safeDebugValue(value: unknown, options: SafeDebugValueOptions = {}): unknown {
  const maxStringLength = positiveInteger(options.maxStringLength, DEFAULT_MAX_STRING_LENGTH, "maxStringLength")
  const maxDepth = positiveInteger(options.maxDepth, DEFAULT_MAX_DEPTH, "maxDepth")
  const maxNodes = positiveInteger(options.maxNodes, DEFAULT_MAX_NODES, "maxNodes")
  const seen = new WeakSet<object>()
  let nodes = 0
  const visit = (input: unknown, key = "", path: (string | number)[] = [], depth = 0): unknown => {
    if (++nodes > maxNodes) return "[MAX_NODES]"
    if (isSensitiveKey(key) || options.redact?.({ key, path, value: input })) return "[REDACTED]"
    if (typeof input === "string") return limitString(redactText(input), maxStringLength)
    if (input === null || typeof input === "boolean") return input
    if (typeof input === "number") return Number.isFinite(input) ? input : String(input)
    if (typeof input === "bigint" || typeof input === "symbol" || typeof input === "function" || typeof input === "undefined") return String(input)
    if (input instanceof Error) return { name: limitString(input.name || "Error", maxStringLength), message: limitString(redactText(input.message), maxStringLength) }
    if (depth >= maxDepth) return "[MAX_DEPTH]"
    if (seen.has(input as object)) return "[CIRCULAR]"
    seen.add(input as object)
    try {
      if (Array.isArray(input)) return input.map((item, index) => visit(item, "", [...path, index], depth + 1))
      const output: Record<string, unknown> = {}
      for (const [childKey, child] of Object.entries(input as Record<string, unknown>)) {
        output[childKey] = visit(child, childKey, [...path, childKey], depth + 1)
      }
      return output
    } finally {
      seen.delete(input as object)
    }
  }
  return visit(value)
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "")
  return normalized !== "" && SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part))
}

function redactText(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/([?&](?:access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|password|passwd|token|secret)=)[^&#\s]*/gi, "$1[REDACTED]")
    .replace(/\b((?:access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|password|passwd|token|secret)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
}

function limitString(value: string, maxLength: number): string {
  if (value.includes("[REDACTED]") && maxLength < 20) return `[REDACTED][TRUNCATED length=${value.length}]`
  return value.length > maxLength ? `${value.slice(0, maxLength)}[TRUNCATED length=${value.length}]` : value
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`)
  return value
}
