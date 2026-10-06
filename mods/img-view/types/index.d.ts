/** One picture the pane can show: a file on this machine, with what is known about it. */
export type Picture = {
  path: string
  /** What drew it or where it came from: `chart`, `Read`, `/img`. */
  label: string
  width?: number
  height?: number
  /** Problems AIGUI found in the drawing. */
  issues: number
}

declare module 'claude-code' {
  interface PluginState {
    'img-view': { pictures: Picture[]; selected: number }
  }
}
