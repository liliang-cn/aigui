import type { ActionRuntime, AIGuiPlugin, CardRegistry } from "@ai-gui/core"

/**
 * Every published plugin, by the name a config uses for it.
 *
 * The names are the fences a model writes (`katex` is the exception: its fence is `$$`), so the
 * config reads like the prompt it produces. Each entry loads its package only when asked for, so
 * `aigui prompt --plugins graph` never imports the other twenty-six.
 *
 * `promptOptions` names the factory options that change the plugin's prompt. Every other option
 * only affects rendering and is accepted but makes no difference to the output.
 */

/** What the CLI builds once and shares between the plugins that need it. */
export interface PluginContext {
  registry: CardRegistry
  actionRuntime: ActionRuntime
}

export interface CatalogEntry {
  /** The npm package. */
  package: string
  /** What the model writes to use it. */
  fence: string
  /** Factory options that change the prompt. */
  promptOptions: string[]
  load: (options: Record<string, unknown>, context: PluginContext) => Promise<AIGuiPlugin>
}

type Options = Record<string, unknown>

const entry = (pkg: string, fence: string, load: CatalogEntry["load"], promptOptions: string[] = []): CatalogEntry => ({ package: pkg, fence, promptOptions, load })

export const PLUGIN_CATALOG: Record<string, CatalogEntry> = {
  artifact: entry("@ai-gui/plugin-artifact", "artifact-create / artifact-update", async (o) => {
    const m = await import("@ai-gui/plugin-artifact")
    return m.artifact({ store: new m.ArtifactStore(), ...(o as Options) })
  }),
  bigscreen: entry("@ai-gui/plugin-bigscreen", "bigscreen", async (o) => (await import("@ai-gui/plugin-bigscreen")).bigscreen(o)),
  chart: entry("@ai-gui/plugin-chart", "chart", async (o) => (await import("@ai-gui/plugin-chart")).chart(o)),
  citation: entry("@ai-gui/plugin-citation", "sources", async (o) => (await import("@ai-gui/plugin-citation")).citation(o)),
  dashboard: entry("@ai-gui/plugin-dashboard", "dashboard", async (o) => (await import("@ai-gui/plugin-dashboard")).dashboard(o)),
  evidence: entry("@ai-gui/plugin-evidence", "evidence (host-written)", async (o) => (await import("@ai-gui/plugin-evidence")).evidence(o)),
  figure: entry("@ai-gui/plugin-figure", "figure", async (o) => (await import("@ai-gui/plugin-figure")).figure(o), ["maxParts", "maxSourceBytes", "width", "height"]),
  flashcards: entry("@ai-gui/plugin-flashcard", "flashcards", async (o, ctx) => (await import("@ai-gui/plugin-flashcard")).flashcards({ actionRuntime: ctx.actionRuntime, ...(o as Options) })),
  form: entry("@ai-gui/plugin-form", "form", async (o, ctx) => (await import("@ai-gui/plugin-form")).form({ actionRuntime: ctx.actionRuntime, ...(o as Options) })),
  function: entry("@ai-gui/plugin-function", "function", async (o) => (await import("@ai-gui/plugin-function")).fn(o)),
  graph: entry("@ai-gui/plugin-graph", "graph", async (o) => (await import("@ai-gui/plugin-graph")).graph(o)),
  gravity: entry("@ai-gui/plugin-gravity", "gravity", async (o) => (await import("@ai-gui/plugin-gravity")).gravity(o)),
  highlight: entry("@ai-gui/plugin-highlight", "```<lang> code blocks", async (o) => (await import("@ai-gui/plugin-highlight")).highlight(o), ["langs"]),
  katex: entry("@ai-gui/plugin-katex", "$…$ and $$…$$", async (o) => (await import("@ai-gui/plugin-katex")).katex(o), ["chemistry"]),
  map: entry("@ai-gui/plugin-map", "map", async (o) => (await import("@ai-gui/plugin-map")).map(o)),
  mermaid: entry("@ai-gui/plugin-mermaid", "mermaid", async (o) => (await import("@ai-gui/plugin-mermaid")).mermaid(o)),
  molecule: entry("@ai-gui/plugin-molecule", "molecule", async (o) => (await import("@ai-gui/plugin-molecule")).molecule(o), ["enable3D", "maxAtoms", "maxBonds", "maxConformerAtoms", "maxSourceBytes", "width", "height"]),
  motion: entry("@ai-gui/plugin-motion", "motion", async (o) => (await import("@ai-gui/plugin-motion")).motion(o)),
  optics: entry("@ai-gui/plugin-optics", "optics", async (o) => (await import("@ai-gui/plugin-optics")).optics(o)),
  physics: entry("@ai-gui/plugin-physics", "physics", async (o) => (await import("@ai-gui/plugin-physics")).physics(o), ["maxElements", "maxSourceBytes", "width", "height"]),
  primitives: entry("@ai-gui/plugin-primitives", "list / table / key-value / layout", async () => (await import("@ai-gui/plugin-primitives")).primitives()),
  progress: entry("@ai-gui/plugin-progress", "progress", async (o) => (await import("@ai-gui/plugin-progress")).progress(o), ["maxSteps", "maxSourceBytes"]),
  quote: entry("@ai-gui/plugin-quote", "quote", async (o) => (await import("@ai-gui/plugin-quote")).quote(o)),
  resultset: entry("@ai-gui/plugin-resultset", "resultset (host-written)", async (o) => (await import("@ai-gui/plugin-resultset")).resultset(o)),
  scene: entry("@ai-gui/plugin-scene", "scene", async (o) => (await import("@ai-gui/plugin-scene")).scene(o)),
  solid: entry("@ai-gui/plugin-solid", "solid", async (o) => (await import("@ai-gui/plugin-solid")).solid(o)),
  ui: entry("@ai-gui/plugin-ui", "ui", async (o, ctx) => (await import("@ai-gui/plugin-ui")).ui({ registry: ctx.registry, actionRuntime: ctx.actionRuntime, ...(o as Options) }), ["limits"]),
}

/** The plugin names a config may use, alphabetically. */
export function pluginNames(): string[] {
  return Object.keys(PLUGIN_CATALOG).sort()
}
