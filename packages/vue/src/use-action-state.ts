import { onScopeDispose, shallowRef, type ShallowRef } from "vue"
import type { ActionRuntime, ActionState } from "@ai-gui/core"

export function useActionState(runtime: ActionRuntime, key: string): ShallowRef<ActionState> {
  const state = shallowRef(runtime.getState(key))
  const unsubscribe = runtime.subscribe((next) => {
    if (next.key === key) state.value = next
  })
  onScopeDispose(unsubscribe)
  return state
}
