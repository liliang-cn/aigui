export type PlaygroundAdapter = "react" | "vue" | "vanilla"

export interface PlaygroundReproduction {
  version: 1
  adapter: PlaygroundAdapter
  markdown: string
  chunkSize: number
  delayMs: number
}

export function exportReproduction(input: Omit<PlaygroundReproduction, "version">): string {
  return JSON.stringify({ version: 1, ...input } satisfies PlaygroundReproduction, null, 2)
}

export function loadReproduction(json: string): PlaygroundReproduction {
  const value: unknown = JSON.parse(json)
  if (!isRecord(value) || value.version !== 1 || !isAdapter(value.adapter) || typeof value.markdown !== "string") throw new TypeError("Invalid AIGUI playground reproduction")
  if (!Number.isSafeInteger(value.chunkSize) || (value.chunkSize as number) <= 0) throw new TypeError("Invalid chunkSize")
  if (typeof value.delayMs !== "number" || !Number.isFinite(value.delayMs) || value.delayMs < 0) throw new TypeError("Invalid delayMs")
  return { version: 1, adapter: value.adapter, markdown: value.markdown, chunkSize: value.chunkSize as number, delayMs: value.delayMs }
}

function isAdapter(value: unknown): value is PlaygroundAdapter {
  return value === "react" || value === "vue" || value === "vanilla"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
