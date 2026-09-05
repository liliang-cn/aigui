import { ActionRegistry, CardRegistry, buildSystemPrompt, createActionRuntime, type AIGuiPlugin } from "@ai-gui/core"
import { PLUGIN_CATALOG, type PluginContext } from "./catalog"
import type { PromptConfig } from "./config"

/**
 * From a config to the string: the same `buildSystemPrompt` the browser calls, fed a registry
 * and plugins built from JSON instead of from host code. There is no second implementation of
 * the prompt here to drift from the first.
 */

export interface BuiltPrompt {
  prompt: string
  locale?: string
  /** Plugin names, in the order they appear in the prompt. */
  plugins: string[]
  /** Card types, in the order registered. */
  cards: string[]
}

export async function buildPrompt(config: PromptConfig): Promise<BuiltPrompt> {
  const registry = new CardRegistry()
  for (const card of config.cards) registry.register({ type: card.type, description: card.description, schema: card.schema, example: card.example })

  // Actions need a `run`; the prompt only lists them, so one that does nothing is the right one.
  const actions = new ActionRegistry()
  for (const action of config.actions) actions.register({ type: action.type, schema: action.schema, run: () => undefined })
  const context: PluginContext = { registry, actionRuntime: createActionRuntime({ registry: actions }) }

  const plugins: AIGuiPlugin[] = []
  for (const entry of config.plugins) plugins.push(await PLUGIN_CATALOG[entry.name].load(entry.options, context))

  return {
    prompt: buildSystemPrompt({ base: config.base, registry, plugins, locale: config.locale }),
    locale: config.locale,
    plugins: config.plugins.map((entry) => entry.name),
    cards: config.cards.map((card) => card.type),
  }
}
