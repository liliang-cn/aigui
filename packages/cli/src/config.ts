import { readFileSync } from "node:fs"
import { readFile as readFileAsync } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import type { JSONSchema } from "@ai-gui/core"
import { PLUGIN_CATALOG, pluginNames } from "./catalog"

/**
 * The JSON a backend team writes once: which plugins, which cards, which actions, in what
 * language, under what persona. Strict on shape, because a misspelt key here silently drops a
 * block from the prompt and nobody notices until the model never uses it.
 */

/** A card as the prompt needs it: no `render`, no `validate`. */
export interface CardSpec {
  type: string
  description: string
  schema?: JSONSchema
  example?: unknown
}

/** An action as the `ui` and `flashcards` specs list it. */
export interface ActionSpec {
  type: string
  schema?: JSONSchema
}

export interface PluginEntry {
  name: string
  options: Record<string, unknown>
}

export interface PromptConfig {
  base?: string
  locale?: string
  plugins: PluginEntry[]
  cards: CardSpec[]
  actions: ActionSpec[]
}

/** What the command line may override. */
export interface ConfigFlags {
  plugins?: string[]
  locale?: string
  base?: string
  cards?: unknown
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ConfigError"
  }
}

const TOP_FIELDS = new Set(["base", "baseFile", "locale", "plugins", "cards", "actions"])
const CARD_FIELDS = new Set(["type", "description", "schema", "example"])
const ACTION_FIELDS = new Set(["type", "schema"])

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

function unknownField(raw: Record<string, unknown>, allowed: Set<string>, at: string): void {
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) throw new ConfigError(`${at}${at ? "." : ""}${key} is not a field of ${at ? "this" : "the config"}`)
  }
}

function pluginEntry(name: string, options: unknown, at: string): PluginEntry {
  if (!(name in PLUGIN_CATALOG)) throw new ConfigError(`unknown plugin "${name}"; the plugins are: ${pluginNames().join(", ")}`)
  if (options !== undefined && !isRecord(options)) throw new ConfigError(`${at} must be an object of options`)
  return { name, options: { ...(options as Record<string, unknown> | undefined) } }
}

/** Names from the command line, or a list or object from the config. */
export function parsePlugins(raw: unknown): PluginEntry[] {
  if (raw === undefined) return []
  if (Array.isArray(raw)) {
    return raw.map((name, index) => {
      if (typeof name !== "string") throw new ConfigError(`plugins[${index}] must be a plugin name`)
      return pluginEntry(name, undefined, `plugins[${index}]`)
    })
  }
  if (isRecord(raw)) return Object.entries(raw).map(([name, options]) => pluginEntry(name, options, `plugins.${name}`))
  throw new ConfigError("plugins must be an array of names or an object of name to options")
}

export function parseCards(raw: unknown): CardSpec[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw new ConfigError("cards must be an array")
  return raw.map((card, index) => {
    const at = `cards[${index}]`
    if (!isRecord(card)) throw new ConfigError(`${at} must be an object`)
    unknownField(card, CARD_FIELDS, at)
    if (typeof card.type !== "string" || card.type.trim() === "") throw new ConfigError(`${at}.type must be a non-empty string`)
    if (typeof card.description !== "string") throw new ConfigError(`${at}.description must be a string`)
    const spec: CardSpec = { type: card.type, description: card.description }
    if (card.schema !== undefined) {
      if (!isRecord(card.schema)) throw new ConfigError(`${at}.schema must be a JSON Schema object`)
      spec.schema = card.schema as JSONSchema
    }
    if (card.example !== undefined) spec.example = card.example
    return spec
  })
}

function parseActions(raw: unknown): ActionSpec[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw new ConfigError("actions must be an array")
  return raw.map((action, index) => {
    const at = `actions[${index}]`
    if (!isRecord(action)) throw new ConfigError(`${at} must be an object`)
    unknownField(action, ACTION_FIELDS, at)
    if (typeof action.type !== "string" || action.type.trim() === "") throw new ConfigError(`${at}.type must be a non-empty string`)
    const spec: ActionSpec = { type: action.type }
    if (action.schema !== undefined) {
      if (!isRecord(action.schema)) throw new ConfigError(`${at}.schema must be a JSON Schema object`)
      spec.schema = action.schema as JSONSchema
    }
    return spec
  })
}

export interface ConfigSource {
  /** The directory `baseFile` is relative to: where the config file lives. */
  dir: string
  readText: (path: string) => string
}

/** Check the parsed JSON and resolve `baseFile`, or throw a `ConfigError` naming the field. */
export function validateConfig(raw: unknown, source: ConfigSource): PromptConfig {
  if (!isRecord(raw)) throw new ConfigError("the config must be a JSON object")
  unknownField(raw, TOP_FIELDS, "")
  const config: PromptConfig = { plugins: parsePlugins(raw.plugins), cards: parseCards(raw.cards), actions: parseActions(raw.actions) }
  if (raw.base !== undefined && raw.baseFile !== undefined) throw new ConfigError("base and baseFile cannot both be given")
  if (raw.base !== undefined) {
    if (typeof raw.base !== "string") throw new ConfigError("base must be a string")
    config.base = raw.base
  }
  if (raw.baseFile !== undefined) {
    if (typeof raw.baseFile !== "string") throw new ConfigError("baseFile must be a path")
    config.base = source.readText(join(source.dir, raw.baseFile))
  }
  if (raw.locale !== undefined) {
    if (typeof raw.locale !== "string") throw new ConfigError("locale must be a string such as \"zh-CN\"")
    config.locale = raw.locale
  }
  return config
}

/** Parse one JSON file; the error names the file. */
export function parseJsonFile(path: string, text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new ConfigError(`${path} is not valid JSON`)
  }
}

/** Read and validate a config file. `baseFile` is resolved beside it. */
export async function readConfig(path: string): Promise<PromptConfig> {
  const absolute = resolve(path)
  let text: string
  try {
    text = await readFileAsync(absolute, "utf8")
  } catch {
    throw new ConfigError(`${path} could not be read`)
  }
  return validateConfig(parseJsonFile(path, text), {
    dir: dirname(absolute),
    readText: (file) => {
      try {
        return readFileSync(file, "utf8")
      } catch {
        throw new ConfigError(`${file} could not be read`)
      }
    },
  })
}

/** Flags win over the file: `--plugins` replaces the list, the others replace their field. */
export function applyFlags(config: PromptConfig, flags: ConfigFlags): PromptConfig {
  const merged: PromptConfig = { ...config, plugins: [...config.plugins], cards: [...config.cards], actions: [...config.actions] }
  if (flags.plugins !== undefined) merged.plugins = parsePlugins(flags.plugins)
  if (flags.locale !== undefined) merged.locale = flags.locale
  if (flags.base !== undefined) merged.base = flags.base
  if (flags.cards !== undefined) merged.cards = parseCards(flags.cards)
  return merged
}
