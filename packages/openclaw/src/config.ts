import type { RenderableKind } from "@ai-gui/image"

export interface AiguiPluginConfig {
  channels: string[]
  blocks: RenderableKind[]
  theme: "light" | "dark"
  width: number
  scale: number
  maxImages: number
  timeoutMs: number
  idleShutdownMs: number
}

const ALL_BLOCKS: RenderableKind[] = ["chart", "mermaid", "dashboard", "card", "math", "table"]

const DEFAULTS: AiguiPluginConfig = {
  // WeChat only. Telegram and Slack already render markdown; turning pictures on for them is an
  // opinion an operator should have to state, not something an install imposes.
  channels: ["openclaw-weixin"],
  blocks: ALL_BLOCKS,
  theme: "light",
  width: 720,
  scale: 2,
  maxImages: 6,
  timeoutMs: 10_000,
  idleShutdownMs: 300_000,
}

function strings(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback
  const out = value.filter((item): item is string => typeof item === "string" && item.length > 0)
  return out.length > 0 ? out : fallback
}

function blocks(value: unknown, fallback: RenderableKind[]): RenderableKind[] {
  if (!Array.isArray(value)) return fallback
  const out = value.filter((item): item is RenderableKind => ALL_BLOCKS.includes(item as RenderableKind))
  return out.length > 0 ? out : fallback
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  const rounded = Math.round(value)
  return rounded >= min && rounded <= max ? rounded : fallback
}

/**
 * Turn whatever the operator wrote into a usable config.
 *
 * Nothing here throws. A typo in a config file must not be able to stop replies from being
 * delivered — the worst it can do is leave a setting at its default.
 */
export function resolveConfig(raw: unknown): AiguiPluginConfig {
  const input = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>
  return {
    channels: strings(input.channels, DEFAULTS.channels),
    blocks: blocks(input.blocks, DEFAULTS.blocks),
    theme: input.theme === "dark" ? "dark" : "light",
    width: integer(input.width, DEFAULTS.width, 200, 2000),
    scale: integer(input.scale, DEFAULTS.scale, 1, 4),
    maxImages: integer(input.maxImages, DEFAULTS.maxImages, 1, 20),
    timeoutMs: integer(input.timeoutMs, DEFAULTS.timeoutMs, 1000, 120_000),
    idleShutdownMs: integer(input.idleShutdownMs, DEFAULTS.idleShutdownMs, 10_000, 3_600_000),
  }
}
