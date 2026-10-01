import type { SceneDefinition, Vec3 } from "./types"

/** How one object looks at a step. */
export interface ObjectState {
  position: Vec3
  color?: string
  visible: boolean
  highlight: boolean
}

/**
 * Every object's state after step `index` (−1: before any step; "all": after the last, which is
 * what a still picture shows). Changes carry forward; highlights belong to their own step only.
 */
export function sceneStateAt(definition: SceneDefinition, index: number | "all"): ObjectState[] {
  const steps = definition.steps ?? []
  const last = index === "all" ? steps.length - 1 : Math.min(index, steps.length - 1)
  const byId = new Map(definition.objects.map((o, i) => [o.id, i] as const).filter(([id]) => id !== undefined))
  const states: ObjectState[] = definition.objects.map((o) => ({ position: o.position ?? [0, 0, 0], color: o.color, visible: true, highlight: false }))
  for (const step of steps.slice(0, last + 1)) {
    for (const [id, position] of Object.entries(step.move ?? {})) states[byId.get(id)!].position = position
    for (const [id, color] of Object.entries(step.color ?? {})) states[byId.get(id)!].color = color
    for (const id of step.hide ?? []) states[byId.get(id)!].visible = false
    for (const id of step.show ?? []) states[byId.get(id)!].visible = true
  }
  if (index !== "all" && last >= 0) for (const id of steps[last].highlight ?? []) states[byId.get(id)!].highlight = true
  return states
}
