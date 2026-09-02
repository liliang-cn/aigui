/**
 * A block family that can be turned into a picture.
 *
 * The first six are flat. `scene`, `molecule` and `bigscreen` draw on WebGL, which headless
 * Chromium provides in software; `gravity` is SVG with the animation switched off.
 */
export type RenderableKind =
  | "chart"
  | "mermaid"
  | "dashboard"
  | "card"
  | "math"
  | "table"
  | "scene"
  | "gravity"
  | "bigscreen"
  | "molecule"

/** One block chosen for rendering, with the source range it occupies. */
export interface BlockSelection {
  kind: RenderableKind
  /** Character offset of the block's first character in the source. */
  start: number
  /** Character offset one past the block's last character. */
  end: number
}

export interface RenderedImage {
  kind: RenderableKind
  /** Absolute path of the written PNG. */
  path: string
  width: number
  height: number
}

export interface RenderOptions {
  /** Directory the PNGs are written into. Created if missing. */
  outDir: string
  kinds?: RenderableKind[]
  theme?: "light" | "dark"
  /** Viewport width in CSS pixels. */
  width?: number
  /** Device pixels per CSS pixel. */
  scale?: number
  /** Cap on how many blocks are rendered. Extra blocks stay as text. */
  max?: number
  timeoutMs?: number
  idleShutdownMs?: number
}

export interface RenderResult {
  /** The source with every successfully rendered block removed. */
  text: string
  images: RenderedImage[]
}

export const DEFAULT_KINDS: RenderableKind[] = ["chart", "mermaid", "dashboard", "card", "math", "table", "scene", "gravity", "bigscreen", "molecule"]
export const DEFAULT_WIDTH = 720
export const DEFAULT_SCALE = 2
export const DEFAULT_MAX = 6
export const DEFAULT_TIMEOUT_MS = 10_000
export const DEFAULT_IDLE_SHUTDOWN_MS = 300_000
