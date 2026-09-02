import type { GravityDefinition, UnitSystem } from "./types"

export interface UnitLabels {
  G: number
  length: string
  time: string
  mass: string
  speed: string
}

/**
 * The three unit systems and their G.
 *
 * In AU, years and solar masses, Kepler's third law with a = 1 AU and T = 1 yr for the Sun's
 * mass fixes G at 4π² exactly. That is the number that makes "Earth at 1 AU" come out as a
 * one-year orbit without anyone typing 6.674e-11 or 1.989e30.
 */
export const UNITS: Record<UnitSystem, UnitLabels> = {
  astronomical: { G: 4 * Math.PI * Math.PI, length: "AU", time: "yr", mass: "M☉", speed: "AU/yr" },
  si: { G: 6.674e-11, length: "m", time: "s", mass: "kg", speed: "m/s" },
  toy: { G: 1, length: "", time: "", mass: "", speed: "" },
}

export function gravitationalConstant(definition: Pick<GravityDefinition, "units" | "G">): number {
  return definition.units === "toy" ? (definition.G ?? 1) : UNITS[definition.units].G
}
