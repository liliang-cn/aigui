import { useCallback, useMemo, useSyncExternalStore } from "react"
import { getIdleActionState, type ActionRuntime, type ActionState } from "@ai-gui/core"

export function useActionState(runtime: ActionRuntime | undefined, key: string): ActionState {
  const idle = useMemo(() => getIdleActionState(key), [key])
  const subscribe = useCallback((notify: () => void) => runtime?.subscribe(() => notify()) ?? (() => {}), [runtime])
  const getSnapshot = useCallback(() => {
    const state = runtime?.getState(key) ?? idle
    return state.status === "idle" ? idle : state
  }, [idle, key, runtime])
  return useSyncExternalStore(subscribe, getSnapshot, () => idle)
}
