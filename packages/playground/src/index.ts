import { createElement } from "react"
import { h } from "vue"
import { AIRenderer as ReactRenderer } from "@ai-gui/react"
import { AIRenderer as VueRenderer } from "@ai-gui/vue"
import { createRenderer as createVanillaRenderer } from "@ai-gui/vanilla"
import { STREAM_FIXTURES } from "@ai-gui/devtools"

export type PlaygroundAdapter = "react" | "vue" | "vanilla"

export interface PlaygroundReproduction {
  version: 1
  adapter: PlaygroundAdapter
  markdown: string
  chunkSize: number
  delayMs: number
}

export const PLAYGROUND_FIXTURES = Object.freeze({
  markdown: STREAM_FIXTURES.markdown,
  card: STREAM_FIXTURES.card,
  unicode: STREAM_FIXTURES.unicode,
})

export function exportReproduction(input: Omit<PlaygroundReproduction, "version">): string {
  return JSON.stringify({ version: 1, ...input } satisfies PlaygroundReproduction, null, 2)
}

export function loadReproduction(json: string): PlaygroundReproduction {
  const value: unknown = JSON.parse(json)
  if (!isRecord(value) || value.version !== 1 || !isAdapter(value.adapter) || typeof value.markdown !== "string") {
    throw new TypeError("Invalid AIGUI playground reproduction")
  }
  if (!Number.isSafeInteger(value.chunkSize) || (value.chunkSize as number) <= 0) throw new TypeError("Invalid chunkSize")
  if (typeof value.delayMs !== "number" || !Number.isFinite(value.delayMs) || value.delayMs < 0) throw new TypeError("Invalid delayMs")
  return {
    version: 1,
    adapter: value.adapter,
    markdown: value.markdown,
    chunkSize: value.chunkSize as number,
    delayMs: value.delayMs,
  }
}

export const ADAPTER_FIXTURES = Object.freeze({
  react: () => createElement(ReactRenderer, null),
  vue: () => h(VueRenderer),
  vanilla: (element: HTMLElement) => createVanillaRenderer(element),
})

function isAdapter(value: unknown): value is PlaygroundAdapter {
  return value === "react" || value === "vue" || value === "vanilla"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
