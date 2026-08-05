import type { ImagingElement } from "./optics"

export type OpticsElement = ImagingElement | "interface"

export interface OpticsDefinition {
  element: OpticsElement
  focal?: number
  object?: { distance: number; height: number; label?: string }
  media?: [number, number]
  incidence?: number
  show?: Array<"rays" | "focalPoints" | "labels">
  caption?: string
}

export interface OpticsOptions {
  width?: number
  height?: number
  maxSourceBytes?: number
}

export interface OpticsError {
  code: "invalid-json" | "invalid-definition" | "too-large"
  message: string
}

export type OpticsResult<T> = { ok: true; value: T } | { ok: false; error: OpticsError }
