import type { CardRegistry } from "./card-registry"
import type { AIGuiPlugin } from "./types"

export interface BuildSystemPromptOptions {
  base?: string
  registry?: CardRegistry
  plugins?: AIGuiPlugin[]
  /**
   * The locale to write the guidance in, as a BCP-47 tag, e.g. "zh-CN".
   *
   * A product whose persona says "always answer in Chinese" ends up appending English rules to
   * it, which reads as a contradiction. Plugins fall back to English for locales they have not
   * been translated into.
   */
  locale?: string
}

/**
 * Assembles the LLM system-prompt guidance: an optional base, the registered
 * cards' spec, and every plugin's promptSpec. Consumers prepend this to their
 * own system prompt so the model knows which fenced blocks it may emit.
 */
export function buildSystemPrompt(options: BuildSystemPromptOptions = {}): string {
  const parts: string[] = []
  if (options.base) parts.push(options.base)
  const cardSpec = options.registry?.toPromptSpec()
  if (cardSpec) parts.push(cardSpec)
  for (const plugin of options.plugins ?? []) {
    const spec = typeof plugin.promptSpec === "function" ? plugin.promptSpec(options.locale) : plugin.promptSpec
    if (spec) parts.push(spec)
  }
  return parts.join("\n\n")
}
