import type { ScreenDefinition } from "./types"

export interface Palette {
  accent: string
  text: string
  muted: string
  good: string
  bad: string
  warn: string
  track: string
  /** The series colours charts cycle through. */
  series: string[]
  gridLine: string
}

/**
 * Two palettes, one per theme.
 *
 * The dark one is the data-wall look — deep navy, cyan accent, a little glow; the light one is
 * the same screen on a white page. The accent can be overridden per screen, and the series
 * colours start from it so a screen reads as one thing rather than a collage.
 */
export function palette(definition: Pick<ScreenDefinition, "theme" | "accent">): Palette {
  const accent = definition.accent ?? (definition.theme === "dark" ? "#22d3ee" : "#0369a1")
  return definition.theme === "dark"
    ? {
        accent,
        text: "#e2e8f0",
        muted: "#94a3b8",
        good: "#34d399",
        bad: "#fb7185",
        warn: "#fbbf24",
        track: "rgba(148,163,184,0.18)",
        series: [accent, "#a78bfa", "#34d399", "#fbbf24", "#fb7185", "#60a5fa", "#f472b6", "#2dd4bf"],
        gridLine: "rgba(148,163,184,0.16)",
      }
    : {
        accent,
        text: "#1e293b",
        muted: "#64748b",
        good: "#059669",
        bad: "#e11d48",
        warn: "#d97706",
        track: "rgba(100,116,139,0.16)",
        series: [accent, "#7c3aed", "#059669", "#d97706", "#e11d48", "#2563eb", "#db2777", "#0d9488"],
        gridLine: "rgba(100,116,139,0.2)",
      }
}

/** `#rrggbb` with an alpha, for glows and fills. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "")
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h
  const n = Number.parseInt(full, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}
