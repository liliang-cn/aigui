import type { Palette } from "./palette"
import type { EntityDef, GraphDefinition, GraphLayer } from "./types"

export interface Mount3dOptions {
  palette: Palette
  height: number
  labelBudget: number
  rotate: boolean
  onEntityClick?: (entity: EntityDef) => void
}

export interface Mounted3d {
  destroy(): void
}

/** Written in the next step; until then the chrome's fallback path is what a reader sees. */
export async function mount3d(_host: HTMLElement, _def: GraphDefinition, _layer: GraphLayer, _options: Mount3dOptions): Promise<Mounted3d> {
  throw new Error("3D renderer not implemented yet")
}
