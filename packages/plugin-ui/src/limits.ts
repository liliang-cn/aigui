import type { UILimitOverrides, UILimits } from "./types"

export const DEFAULT_UI_LIMITS: Readonly<UILimits> = Object.freeze({
  sourceBytes: 64 * 1024,
  nodes: 200,
  depth: 12,
  children: 50,
  state: 64,
  string: 4096,
  totalStrings: 64 * 1024,
  tableRows: 100,
  tableColumns: 20,
  options: 100,
  boundJSONDepth: 8,
  boundJSONNodes: 512,
})

export function resolveUILimits(overrides?: UILimitOverrides): UILimits {
  const limits = { ...DEFAULT_UI_LIMITS, ...overrides }
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value < 1) throw new TypeError(`UI limit "${key}" must be a positive integer.`)
  }
  return limits
}
