export interface Palette {
  /** The page's text colour, for labels. */
  text: string
  /** Untyped entities, and secondary text. */
  muted: string
  /** An edge with no property. */
  edge: string
  /** A relation that breaks its property's domain or range. */
  violation: string
  /** The focused entity's ring. */
  focus: string
  /** The class and property colours, hashed onto. */
  series: string[]
  /** Tooltip and legend background. */
  surface: string
  /** Tooltip and legend border. */
  border: string
}

/**
 * Two palettes, one per theme.
 *
 * Seven series colours, not eight: the eighth in most rings is a second blue-green a shade off
 * the first, and two classes a reader cannot tell apart is worse than two classes sharing a
 * colour the legend admits to.
 */
export function palette(theme?: string): Palette {
  return theme === "dark"
    ? {
        text: "#e2e8f0",
        muted: "#94a3b8",
        edge: "#64748b",
        violation: "#f87171",
        focus: "#fbbf24",
        series: ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#fb7185", "#f472b6", "#2dd4bf"],
        surface: "#0f172a",
        border: "#334155",
      }
    : {
        text: "#1e293b",
        muted: "#94a3b8",
        edge: "#94a3b8",
        violation: "#dc2626",
        focus: "#d97706",
        series: ["#0284c7", "#7c3aed", "#059669", "#d97706", "#e11d48", "#db2777", "#0d9488"],
        surface: "#ffffff",
        border: "#e2e8f0",
      }
}
